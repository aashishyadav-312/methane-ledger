import type { Constants, CostParams, MineInput, Settings, TechLibrary } from './types';
import { breakevenUsdPerT, irr, npv, priceByYear, pv, type ProjectComponents } from './finance';
import { mineComponents } from './waterfall';

/**
 * Financing structure parameters (Appendix B8). Source: reference/ref_v1.py `FIN`. All DUMMY until a real term sheet
 * exists. Each structure is described, not offered: these are the knobs of the illustration.
 */
export interface FinancingParams {
  /** B: share of gross revenue (credits + power) paid to Coal India. */
  royaltyShare: number;
  /** B: the developer's required return; below it the developer declines. */
  developerHurdleRate: number;
  /** C: years of credits sold in advance. */
  forwardYears: number;
  /** C: discount the buyer takes on the credit price for paying in advance. */
  forwardDiscount: number;
  /** D: guaranteed minimum price, USD per tCO2e. */
  floorUsdPerT: number;
  /** D: premium paid at t0 per credit covered by the floor, USD per tCO2e. */
  floorPremiumUsdPerT: number;
  /** D: years the floor covers. */
  floorYears: number;
  /** E: share of capex covered by a grant. Replaces `settings.grantShare` in structure E. */
  grantShare: number;
}

export const FIN_DEFAULTS: FinancingParams = {
  royaltyShare: 0.1,
  developerHurdleRate: 0.15,
  forwardYears: 3,
  forwardDiscount: 0.3,
  floorUsdPerT: 10,
  floorPremiumUsdPerT: 0.5,
  floorYears: 5,
  grantShare: 0.3,
};

/** Upper end of the price search for structure D (Appendix B8: bisection in [0, 500]). */
export const FLOOR_SEARCH_MAX_USD_PER_T = 500;
const BISECTIONS = 200;

/** What every structure reports for Coal India. */
export interface StructureBase {
  /** Index 0 is the build year (2026), then one entry per crediting year. */
  cilCashUsd: number[];
  cilNpvUsd: number;
  /** `null` when the cash flow never changes sign (for example when Coal India pays nothing up front). */
  cilIrr: number | null;
  /** Lowest credit price at which the structure goes ahead for Coal India; `null` when there are no reductions. */
  breakevenUsdPerT: number | null;
}

export interface StructureA extends StructureBase {
  structure: 'A';
}

export interface StructureB extends StructureBase {
  structure: 'B';
  developerCashUsd: number[];
  developerIrr: number | null;
  /** True when the developer's IRR is `null` or below the hurdle rate. */
  developerDeclines: boolean;
  /** Largest royalty share the developer can pay and still earn the hurdle rate. */
  maxRoyaltyShare: number;
  /** Credit price at which the developer's NPV at the hurdle rate is 0. `breakevenUsdPerT` repeats it. */
  breakevenForDeveloperUsdPerT: number | null;
}

export interface StructureC extends StructureBase {
  structure: 'C';
  prepaymentUsd: number;
  prepaymentShareOfCapex: number;
}

export interface StructureD extends StructureBase {
  structure: 'D';
  premiumPaidUsd: number;
  /** True when the floor alone makes the project pay at a market price of 0. */
  floorCoversAtZero: boolean;
}

export interface StructureE extends StructureBase {
  structure: 'E';
  grantUsd: number;
}

export interface FinancingResult {
  /** The market credit price used for the cash flows, USD per tCO2e. */
  creditPriceUsdPerT: number;
  params: FinancingParams;
  A: StructureA;
  B: StructureB;
  C: StructureC;
  D: StructureD;
  E: StructureE;
}

interface Flows {
  capexUsd: number;
  priceUsdPerT: number[];
  creditRevUsd: number[];
  /** cash[0] = -capex, then years 1..N. */
  cashUsd: number[];
}

/** Project cash flow at a credit price (Appendix B4). `realisedPrice` lets structure D lift the price to a floor. */
function flowsAt(
  c: ProjectComponents,
  settings: Settings,
  priceUsdPerT: number,
  realisedPrice: (priceUsdPerT: number, yearIndex: number) => number = (p) => p,
): Flows {
  const n = c.erTco2e.length;
  const price = priceByYear(priceUsdPerT, settings.priceEscalation, n).map(realisedPrice);
  const creditRevUsd = c.erTco2e.map(
    (er, i) => er * (price[i] * (1 - settings.brokerShare) - settings.issuanceFeeUsdPerT),
  );
  const cashUsd = [-c.capexUsd];
  for (let i = 0; i < n; i++) cashUsd.push(creditRevUsd[i] + c.energyRevUsd[i] - c.opexUsd[i] - c.mrvUsd[i]);
  return { capexUsd: c.capexUsd, priceUsdPerT: price, creditRevUsd, cashUsd };
}

/** NPV is linear in the credit price, so the zero is found from two evaluations. `null` when the slope is 0. */
function solveLinearUsdPerT(npvAt: (priceUsdPerT: number) => number): number | null {
  const a0 = npvAt(0);
  const a1 = npvAt(1);
  return a1 === a0 ? null : -a0 / (a1 - a0);
}

const base = (cilCashUsd: number[], rate: number, breakeven: number | null): StructureBase => ({
  cilCashUsd,
  cilNpvUsd: npv(cilCashUsd, rate),
  cilIrr: irr(cilCashUsd),
  breakevenUsdPerT: breakeven,
});

/**
 * Financing structures A to E for one mine (Appendix B8; mirrors `financing` in reference/ref_v1.py).
 * A, B, C and D use the grant already in `settings.grantShare`; E replaces it with `params.grantShare`.
 * Cash flows run at `settings.creditPriceUsdPerT`.
 */
export function financing(
  mine: MineInput,
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
  params: FinancingParams = FIN_DEFAULTS,
  costs?: CostParams,
): FinancingResult {
  const r = settings.discountRate;
  const n = settings.creditingYears;
  const priceUsdPerT = settings.creditPriceUsdPerT;
  // The grant changes capex, and on the cost build-up also insurance and decommissioning, so each grant share gets
  // its own pass through `projectFlows` instead of scaling capex afterwards.
  const noGrant = mineComponents(mine, { ...settings, grantShare: 0 }, tech, constants, costs);
  const c: ProjectComponents = mineComponents(mine, settings, tech, constants, costs);
  const flows = flowsAt(c, settings, priceUsdPerT);

  // A. Coal India funds it.
  const A: StructureA = { structure: 'A', ...base(flows.cashUsd, r, breakevenUsdPerT(c, settings)) };

  // B. A developer builds, owns and runs it; Coal India takes a royalty on gross revenue.
  const developerCashAt = (p: number): number[] => {
    const f = flowsAt(c, settings, p);
    return f.cashUsd.map((cash, i) => {
      if (i === 0) return cash;
      return cash - params.royaltyShare * (f.creditRevUsd[i - 1] + c.energyRevUsd[i - 1]);
    });
  };
  const grossRevUsd = flows.creditRevUsd.map((credit, i) => credit + c.energyRevUsd[i]);
  const developerCashUsd = developerCashAt(priceUsdPerT);
  const developerIrr = irr(developerCashUsd);
  const royaltyUsd = grossRevUsd.map((g) => params.royaltyShare * g);
  const pvGrossAtHurdleUsd = pv(grossRevUsd, params.developerHurdleRate);
  const breakevenForDeveloper = solveLinearUsdPerT((p) => npv(developerCashAt(p), params.developerHurdleRate));
  const B: StructureB = {
    structure: 'B',
    ...base([0, ...royaltyUsd], r, breakevenForDeveloper),
    developerCashUsd,
    developerIrr,
    developerDeclines: developerIrr === null || developerIrr < params.developerHurdleRate,
    maxRoyaltyShare:
      pvGrossAtHurdleUsd === 0 ? 0 : Math.max(0, npv(flows.cashUsd, params.developerHurdleRate) / pvGrossAtHurdleUsd),
    breakevenForDeveloperUsdPerT: breakevenForDeveloper,
  };

  // C. A buyer pays in advance for the first k years of credits, at a discount.
  const k = Math.min(params.forwardYears, n);
  const prepaymentAt = (p: number): number => {
    const price = priceByYear(p, settings.priceEscalation, n);
    let total = 0;
    for (let i = 0; i < k; i++) {
      total +=
        c.erTco2e[i] *
        (price[i] * (1 - params.forwardDiscount) * (1 - settings.brokerShare) - settings.issuanceFeeUsdPerT);
    }
    return total;
  };
  const forwardCashAt = (p: number): number[] => {
    const f = flowsAt(c, settings, p);
    return f.cashUsd.map((cash, i) => {
      if (i === 0) return cash + prepaymentAt(p);
      return i - 1 < k ? cash - f.creditRevUsd[i - 1] : cash;
    });
  };
  const prepaymentUsd = prepaymentAt(priceUsdPerT);
  const forwardCash = forwardCashAt(priceUsdPerT);
  const C: StructureC = {
    structure: 'C',
    ...base(forwardCash, r, solveLinearUsdPerT((p) => npv(forwardCashAt(p), r))),
    prepaymentUsd,
    prepaymentShareOfCapex: c.capexUsd === 0 ? 0 : prepaymentUsd / c.capexUsd,
  };

  // D. A price floor on the first few years, bought with a premium paid at t0.
  const floorYears = Math.min(params.floorYears, n);
  const premiumUsd = params.floorPremiumUsdPerT * c.erTco2e.slice(0, floorYears).reduce((a, b) => a + b, 0);
  const floorCashAt = (p: number): number[] => {
    const f = flowsAt(c, settings, p, (q, i) => (i < floorYears ? Math.max(q, params.floorUsdPerT) : q));
    return [f.cashUsd[0] - premiumUsd, ...f.cashUsd.slice(1)];
  };
  let floorBreakeven: number | null;
  if (npv(floorCashAt(0), r) >= 0) {
    floorBreakeven = 0;
  } else if (npv(floorCashAt(FLOOR_SEARCH_MAX_USD_PER_T), r) < 0) {
    floorBreakeven = null;
  } else {
    let lo = 0;
    let hi: number = FLOOR_SEARCH_MAX_USD_PER_T;
    for (let i = 0; i < BISECTIONS; i++) {
      const mid = (lo + hi) / 2;
      if (npv(floorCashAt(mid), r) >= 0) hi = mid;
      else lo = mid;
    }
    floorBreakeven = (lo + hi) / 2;
  }
  const D: StructureD = {
    structure: 'D',
    ...base(floorCashAt(priceUsdPerT), r, floorBreakeven),
    premiumPaidUsd: premiumUsd,
    floorCoversAtZero: floorBreakeven === 0,
  };

  // E. A grant covers part of capex. The grant replaces any grant in the settings.
  const grossCapexUsd = noGrant.capexUsd;
  const cE: ProjectComponents = mineComponents(mine, { ...settings, grantShare: params.grantShare }, tech, constants, costs);
  const E: StructureE = {
    structure: 'E',
    ...base(flowsAt(cE, settings, priceUsdPerT).cashUsd, r, breakevenUsdPerT(cE, settings)),
    grantUsd: grossCapexUsd * params.grantShare,
  };

  return { creditPriceUsdPerT: priceUsdPerT, params, A, B, C, D, E };
}

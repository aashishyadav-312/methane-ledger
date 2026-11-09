import type { Constants, MineInput, Settings, TechLibrary } from './types';
import { priceByYear, pv, type ProjectComponents } from './finance';
import { mineComponents } from './waterfall';

/** One number in the break-even formula, ready to show: a label, a value and its unit. */
export interface ExplainTerm {
  key: 'capex' | 'opex' | 'mrv' | 'fees' | 'energy' | 'sellerShare' | 'discountedReductions';
  label: string;
  /** Signed as it enters the formula (energy is negative). */
  value: number;
  unit: 'USD' | 'tCO2e' | 'fraction';
}

/**
 * The break-even formula as data (Appendix B4):
 * P* = (sum of `numerator`) / (product of `denominator`).
 * Step 8 renders it; there is no maths in the page.
 */
export interface Explanation {
  /** Added together: capex, PV(opex), PV(MRV), fees, minus PV(energy). USD, present value. */
  numerator: ExplainTerm[];
  numeratorUsd: number;
  /** Multiplied together: (1 - broker share) and PV(ER x price growth). */
  denominator: ExplainTerm[];
  denominatorTco2e: number;
  /** P*, USD per tCO2e; `null` when there are no reductions. */
  breakevenUsdPerT: number | null;
  discountRate: number;
  /** Price escalation per year; the break-even is the year-1 price. */
  priceEscalation: number;
}

export function explainComponents(c: ProjectComponents, settings: Settings): Explanation {
  const r = settings.discountRate;
  const growth = priceByYear(1, settings.priceEscalation, c.erTco2e.length);
  const numerator: ExplainTerm[] = [
    { key: 'capex', label: 'Build cost', value: c.capexUsd, unit: 'USD' },
    { key: 'opex', label: 'Running cost, present value', value: pv(c.opexUsd, r), unit: 'USD' },
    { key: 'mrv', label: 'Monitoring and verification, present value', value: pv(c.mrvUsd, r), unit: 'USD' },
    {
      key: 'fees',
      label: 'Issuance fees, present value',
      value: settings.issuanceFeeUsdPerT * pv(c.erTco2e, r),
      unit: 'USD',
    },
    { key: 'energy', label: 'Power sold, present value', value: -pv(c.energyRevUsd, r), unit: 'USD' },
  ];
  const denominator: ExplainTerm[] = [
    { key: 'sellerShare', label: 'Share of the price kept after the broker', value: 1 - settings.brokerShare, unit: 'fraction' },
    {
      key: 'discountedReductions',
      label: 'Reductions, present value',
      value: pv(c.erTco2e.map((e, i) => e * growth[i]), r),
      unit: 'tCO2e',
    },
  ];
  const numeratorUsd = numerator.reduce((sum, t) => sum + t.value, 0);
  const denominatorTco2e = denominator.reduce((prod, t) => prod * t.value, 1);
  return {
    numerator,
    numeratorUsd,
    denominator,
    denominatorTco2e,
    breakevenUsdPerT: denominatorTco2e === 0 ? null : numeratorUsd / denominatorTco2e,
    discountRate: r,
    priceEscalation: settings.priceEscalation,
  };
}

/** Explain the break-even of one mine. */
export function explain(mine: MineInput, settings: Settings, tech: TechLibrary, constants: Constants): Explanation {
  return explainComponents(mineComponents(mine, settings, tech, constants), settings);
}

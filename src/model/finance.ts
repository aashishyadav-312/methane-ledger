import type { Settings } from './types';
import { IRR_SEARCH } from './constants';
import type { StreamCashflow } from './cashflow';

/** PV(x) = sum of x_t / (1 + r)^t for t = 1..N (values[0] is year 1). */
export function pv(values: number[], rate: number): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i] / (1 + rate) ** (i + 1);
  return total;
}

/** NPV = sum of Cash_i / (1 + r)^i for i = 0..N (cash[0] is the build year). */
export function npv(cashUsd: number[], rate: number): number {
  let total = 0;
  for (let i = 0; i < cashUsd.length; i++) total += cashUsd[i] / (1 + rate) ** i;
  return total;
}

const round10 = (x: number) => Math.round(x * 1e10) / 1e10;

/**
 * IRR (Appendix B5, reference/ref_v1.py `irr`): scan r from 10.00 down to -0.90 in steps of 0.01, take the first
 * (highest) step where NPV(r_hi) <= 0 < NPV(r_lo), then bisect 200 times. `null` when NPV never changes sign.
 */
export function irr(cashUsd: number[]): number | null {
  let hi: number = IRR_SEARCH.highRate;
  let fHi = npv(cashUsd, hi);
  while (hi > IRR_SEARCH.lowRate) {
    let lo = round10(hi - IRR_SEARCH.step);
    const fLo = npv(cashUsd, lo);
    if ((fHi <= 0 && 0 < fLo) || fHi === 0) {
      for (let i = 0; i < IRR_SEARCH.bisections; i++) {
        const mid = (lo + hi) / 2;
        if (npv(cashUsd, mid) > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    hi = lo;
    fHi = fLo;
  }
  return null;
}

/** Payback index: the first i >= 1 where cumulative cash reaches 0 or more, else `null`. */
export function paybackIndex(cashUsd: number[]): number | null {
  let cum = 0;
  for (let i = 0; i < cashUsd.length; i++) {
    cum += cashUsd[i];
    if (i > 0 && cum >= 0) return i;
  }
  return null;
}

/** Price-independent project components per year t = 1..N, plus capex (after grant). */
export interface ProjectComponents {
  capexUsd: number;
  erTco2e: number[];
  energyRevUsd: number[];
  opexUsd: number[];
  mrvUsd: number[];
}

/** Price_t = P x (1 + escalation)^(t - 1). */
export function priceByYear(priceUsdPerT: number, escalation: number, years: number): number[] {
  return Array.from({ length: years }, (_, i) => priceUsdPerT * (1 + escalation) ** i);
}

/**
 * Break-even credit price P* (Appendix B4 closed form, since NPV is linear in P):
 * P* = [capex + PV(opex + MRV - energy) + fee x PV(ER)] / [(1 - b) x PV(ER_t x (1 + e)^(t - 1))].
 * With escalation, P* is the year-1 price. `null` when there are no reductions.
 */
export function breakevenUsdPerT(c: ProjectComponents, settings: Settings): number | null {
  const r = settings.discountRate;
  const netCost = c.opexUsd.map((o, i) => o + c.mrvUsd[i] - c.energyRevUsd[i]);
  const growth = priceByYear(1, settings.priceEscalation, c.erTco2e.length);
  const num = c.capexUsd + pv(netCost, r) + settings.issuanceFeeUsdPerT * pv(c.erTco2e, r);
  const den = (1 - settings.brokerShare) * pv(c.erTco2e.map((e, i) => e * growth[i]), r);
  return den === 0 ? null : num / den;
}

/**
 * Stream break-even, as in the reference: (stream capex + PV(stream opex - stream energy)) / PV(stream ER).
 * Excludes monitoring, MRV and fees, and is not grossed up. Negative means the stream pays for itself.
 * `null` when the stream has no reductions.
 */
export function streamBreakevenUsdPerT(cf: StreamCashflow, discountRate: number): number | null {
  const pvEr = pv(
    cf.rows.map((y) => y.erTco2e),
    discountRate,
  );
  if (pvEr === 0) return null;
  return (cf.capexUsd + pv(cf.rows.map((y) => y.opexUsd - y.energyRevUsd), discountRate)) / pvEr;
}

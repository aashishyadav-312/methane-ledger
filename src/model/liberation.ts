import type { MineInput } from './types';
import { activeSeries, productionMtByYear, type Timeline } from './timeline';

export interface GasSeries {
  /** Liberated gas L_t = P_t x SE, Mm3 CH4 a year. */
  liberatedMm3: number[];
  drainedMm3: number[];
  vamMm3: number[];
  /** Abandoned mine methane after closure; `null` when the window has no post-closure years or no `amm` input. */
  ammMm3: number[] | null;
}

/**
 * Appendix B1. Measured volumes beat derived ones. Derived: drained = L_t x drainedShare,
 * VAM = L_t x (1 - drainedShare). All are 0 after closure.
 */
export function buildGas(mine: MineInput, timeline: Timeline): GasSeries {
  const se = mine.specificEmissionM3PerT ?? 0;
  const share = mine.drainedShare ?? 0;
  // Mt x m3/t = Mm3
  const liberatedMm3 = productionMtByYear(mine, timeline).map((p) => p * se);
  const drainedMm3 =
    mine.drainedMm3PerYr !== undefined
      ? activeSeries(mine.drainedMm3PerYr, timeline)
      : liberatedMm3.map((l) => l * share);
  const vamMm3 =
    mine.vamMm3PerYr !== undefined ? activeSeries(mine.vamMm3PerYr, timeline) : liberatedMm3.map((l) => l * (1 - share));
  return { liberatedMm3, drainedMm3, vamMm3, ammMm3: ammSeries(mine, timeline, drainedMm3, vamMm3) };
}

/** Hyperbolic decline q(k) = q0 / (1 + b D k)^(1/b); b = 0 is the exponential limit q0 e^(-D k). */
export function ammDecline(q0Mm3: number, k: number, declineD: number, hyperbolicB: number): number {
  if (hyperbolicB === 0) return q0Mm3 * Math.exp(-declineD * k);
  return q0Mm3 / (1 + hyperbolicB * declineD * k) ** (1 / hyperbolicB);
}

/**
 * AMM after closure (Appendix B1):
 * - q0 = `amm.q0Mm3` if given (mine already closed), else fAmm x B, where B = `amm.q0BasisMm3` if given, else
 *   drained + VAM in the last active year.
 * - k = 1 .. postYears, shifted by `yearsSinceClosure` for a mine closed before the window.
 * - From `floodingYear` on, flow is multiplied by `floodingFactor`.
 */
export function ammSeries(
  mine: MineInput,
  timeline: Timeline,
  drainedMm3: number[],
  vamMm3: number[],
): number[] | null {
  const amm = mine.amm;
  if (!amm || timeline.postYears === 0) return null;
  const last = timeline.activeYears - 1;
  const basisMm3 = amm.q0BasisMm3 ?? (last >= 0 ? drainedMm3[last] + vamMm3[last] : 0);
  const q0Mm3 = amm.q0Mm3 ?? amm.fAmm * basisMm3;
  const firstYear = timeline.calendarYears[0];
  const kOffset = amm.yearsSinceClosure ?? Math.max(0, firstYear - 1 - mine.closureYear);
  return timeline.calendarYears.map((year, i) => {
    if (i < timeline.activeYears) return 0;
    const k = i - timeline.activeYears + 1 + kOffset;
    const q = ammDecline(q0Mm3, k, amm.declineD, amm.hyperbolicB);
    const flooded = amm.floodingYear !== undefined && year >= amm.floodingYear;
    return flooded ? q * amm.floodingFactor : q;
  });
}

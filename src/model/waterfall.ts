import type { Constants, MineInput, Settings, TechLibrary } from './types';
import { projectFlows } from './evaluate';
import { pv, priceByYear, type ProjectComponents } from './finance';
import { buildStreams } from './streams';
import { buildTimeline } from './timeline';

/**
 * The price-independent parts of one mine's project over the crediting window (Appendix B3): capex after grant,
 * reductions, energy revenue, opex and MRV by year. Everything in Step 7 starts here.
 */
export function mineComponents(
  mine: MineInput,
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
): ProjectComponents {
  const timeline = buildTimeline(mine, settings);
  const streams = buildStreams(mine, settings, tech, timeline);
  return projectFlows(streams, settings, tech, constants).components;
}

/** The break-even credit price split into its parts, in USD per tCO2e. The parts sum to `totalUsdPerT` (P*). */
export interface Waterfall {
  capexUsdPerT: number;
  opexUsdPerT: number;
  mrvUsdPerT: number;
  feesUsdPerT: number;
  /** Negative: power sold offsets cost. */
  energyUsdPerT: number;
  totalUsdPerT: number;
}

/**
 * Appendix B4 waterfall. The break-even numerator is capex + PV(opex) + PV(MRV) + fee x PV(ER) - PV(energy);
 * each part is divided by the denominator (1 - b) x PV(ER_t x (1 + e)^(t - 1)), so the parts sum to P*.
 * `null` when there are no reductions (nothing to divide by).
 */
export function waterfallFromComponents(c: ProjectComponents, settings: Settings): Waterfall | null {
  const r = settings.discountRate;
  const growth = priceByYear(1, settings.priceEscalation, c.erTco2e.length);
  const denTco2e = (1 - settings.brokerShare) * pv(c.erTco2e.map((e, i) => e * growth[i]), r);
  if (denTco2e === 0) return null;
  const capexUsdPerT = c.capexUsd / denTco2e;
  const opexUsdPerT = pv(c.opexUsd, r) / denTco2e;
  const mrvUsdPerT = pv(c.mrvUsd, r) / denTco2e;
  const feesUsdPerT = (settings.issuanceFeeUsdPerT * pv(c.erTco2e, r)) / denTco2e;
  const energyUsdPerT = -pv(c.energyRevUsd, r) / denTco2e;
  return {
    capexUsdPerT,
    opexUsdPerT,
    mrvUsdPerT,
    feesUsdPerT,
    energyUsdPerT,
    totalUsdPerT: capexUsdPerT + opexUsdPerT + mrvUsdPerT + feesUsdPerT + energyUsdPerT,
  };
}

/** Waterfall for a mine. The total equals `breakevenUsdPerT` from `evaluate` for the same inputs. */
export function waterfall(
  mine: MineInput,
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
): Waterfall | null {
  return waterfallFromComponents(mineComponents(mine, settings, tech, constants), settings);
}

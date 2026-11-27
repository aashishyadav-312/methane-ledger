import type {
  EstimateMine,
  EstimateOverrides,
  EstimateResult,
  EstimateTimeline,
  EstimateWarning,
  EstimationParams,
  GassinessDegree,
  MineInput,
  Settings,
} from './types';
import { AMM_DEFAULTS } from './constants';

export const NO_OUTPUT_REASON = 'No recent output. Enter coal output to model this mine.';
export const OPENCAST_REASON = 'Opencast: no concentrated stream to capture.';

/** A fraction written as a percentage without trailing zeros: 0.0005 gives "0.05". */
const percent = (fraction: number): string => String(Number((fraction * 100).toPrecision(6)));

/**
 * PLAN_V2 Appendix B: model inputs for a mine with no measured data, from its real output and closure year plus
 * gassiness defaults by coalfield. ESTIMATED. Ports `estimate()` in reference/ref_v2.py.
 *
 * - total methane = output x underground share x specific emission; drained gas = total x drained share; the rest
 *   is ventilation air.
 * - no_output: output is 0 or missing. not_abatable: no stream qualifies (opencast, or Degree I with no drained gas
 *   and ventilation air below the oxidiser minimum).
 * - closure_uncertain: the mine is "Past reported reserve" or runs out before the first model year; the closure
 *   year is then the first model year. An explicit `overrides.closureYear` is flagged only when it is before the
 *   first model year, not for the mine's reserve status.
 * - A measured record in `data/mines.json` beats this estimate; `pickMineInput` in `src/data/estimation.ts` applies that.
 */
export function estimateMineInput(
  mine: EstimateMine,
  timeline: EstimateTimeline,
  params: EstimationParams,
  settings: Pick<Settings, 'startYear' | 'creditingYears'>,
  overrides: EstimateOverrides = {},
): EstimateResult {
  const n = settings.creditingYears;
  const start = settings.startYear;
  const warnings: EstimateWarning[] = [];

  const outputMt = Math.max(overrides.outputMtPerYr ?? timeline.rateUsedMtPerYr ?? 0, 0);
  const degree: GassinessDegree | null =
    overrides.degree ?? (mine.type === 'OC' ? null : (params.degreeByField[mine.field] ?? params.defaultDegree));
  const gas =
    degree === null
      ? { specificEmissionM3PerT: params.opencastSpecificEmissionM3PerT, drainedShare: 0, drainedConc: 0, vamConc: 0 }
      : params.byDegree[String(degree) as '1' | '2' | '3'];
  const undergroundShare = degree !== null && mine.type === 'Mixed' ? params.mixedUndergroundShare : 1;
  const undergroundMt = outputMt * undergroundShare;
  const totalMm3 = overrides.totalMm3 ?? undergroundMt * gas.specificEmissionM3PerT; // Mt x m3/t = Mm3
  const specificEmission =
    overrides.totalMm3 !== undefined && undergroundMt > 0 ? totalMm3 / undergroundMt : gas.specificEmissionM3PerT;

  let closureYear = overrides.closureYear ?? timeline.runoutYear ?? start + n; // null run-out: past the window
  const uncertain =
    closureYear < start || (overrides.closureYear === undefined && timeline.status === 'Past reported reserve');
  if (uncertain) closureYear = Math.max(closureYear, start);
  const activeYears = Math.max(0, Math.min(n, closureYear - start + 1));

  const base = {
    degree,
    specificEmission,
    totalMm3,
    warnings,
    productionMtPerYr: outputMt,
    closureYear,
    activeYears,
    drainedMm3: totalMm3 * gas.drainedShare,
    vamMm3: totalMm3 * (1 - gas.drainedShare),
  };

  if (!(outputMt > 0)) {
    return { ...base, input: null, status: 'no_output', reason: NO_OUTPUT_REASON, totalMm3: 0, drainedMm3: 0, vamMm3: 0 };
  }
  if (uncertain) warnings.push('closure_uncertain');

  const hasDrained = gas.drainedShare > 0;
  const hasVam = gas.vamConc >= params.oxidiserMinVamConc;
  if (!hasDrained && !hasVam) {
    const reason =
      degree === null
        ? OPENCAST_REASON
        : `Ventilation air is ${percent(gas.vamConc)}% methane, below the ${percent(params.oxidiserMinVamConc)}% an oxidiser needs, and there is no drained gas.`;
    return { ...base, input: null, status: 'not_abatable', reason };
  }

  const input: MineInput = {
    id: mine.id,
    name: mine.name,
    closureYear,
    productionMtPerYr: outputMt,
    // The rate over the whole output, so output x rate is the total even for a mixed mine.
    specificEmissionM3PerT: totalMm3 / outputMt,
    drainedShare: gas.drainedShare,
    drainedMm3PerYr: base.drainedMm3,
    drainedConc: gas.drainedConc,
    vamMm3PerYr: base.vamMm3,
    vamConc: gas.vamConc,
    hasDrainageSystem: false,
    powerOfftake: true,
    captureEff: { ...params.captureEff },
    destructionMandated: { drained: false, vam: false, amm: false },
  };
  if (hasDrained) {
    input.amm = {
      fAmm: params.afterClosure.fAmm,
      declineD: AMM_DEFAULTS.declineD,
      hyperbolicB: AMM_DEFAULTS.hyperbolicB,
      conc: params.afterClosure.conc,
      floodingFactor: AMM_DEFAULTS.floodingFactor,
    };
  }
  return { ...base, input, status: 'ok' };
}

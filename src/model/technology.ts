import type { Constants, Settings, StreamInput, StreamKind, StreamStatus, Tech, TechLibrary, Warning } from './types';
import { EXPLOSIVE_RANGE_CONC, GJ_PER_MWH, HOURS_PER_YEAR, KW_PER_MW, M3_PER_MM3, SECONDS_PER_YEAR } from './constants';
import { massTFromMm3 } from './physics';

export interface TechChoice {
  tech: Tech | null;
  status: Exclude<StreamStatus, 'no_gas'>;
}

/** True when `tech` may be used on a stream at this concentration. Power also needs someone to take the power. */
export function meetsMinimum(tech: Tech, concFraction: number, powerOfftake: boolean, lib: TechLibrary): boolean {
  if (concFraction < lib[tech].minConc) return false;
  return tech !== 'power' || powerOfftake;
}

/**
 * Appendix B2 rule table.
 * - Drained and AMM: power if conc >= power minimum and there is power offtake, else flare if conc >= flare minimum.
 * - VAM: RTO (regenerative thermal oxidiser) if conc >= RTO minimum.
 * - No option fits: `needs_enrichment`.
 * A user override is honoured only when it meets that technology's minimum; otherwise the rule applies.
 */
export function selectTech(
  kind: StreamKind,
  concFraction: number,
  powerOfftake: boolean,
  lib: TechLibrary,
  override?: Tech,
): TechChoice {
  if (override && meetsMinimum(override, concFraction, powerOfftake, lib)) return { tech: override, status: 'ok' };
  const options: Tech[] = kind === 'vam' ? ['rto'] : ['power', 'flare'];
  const tech = options.find((t) => meetsMinimum(t, concFraction, powerOfftake, lib)) ?? null;
  return tech ? { tech, status: 'ok' } : { tech: null, status: 'needs_enrichment' };
}

/** Warnings for one stream: the explosive range (5% to 15% CH4) and `needs_enrichment`. */
export function streamWarnings(concFraction: number, status: StreamStatus): Warning[] {
  const warnings: Warning[] = [];
  if (concFraction >= EXPLOSIVE_RANGE_CONC.lower && concFraction <= EXPLOSIVE_RANGE_CONC.upper) {
    warnings.push('unsafe_range');
  }
  if (status === 'needs_enrichment') warnings.push('needs_enrichment');
  return warnings;
}

/** Electrical output in MWh from a mass of CH4 burnt in engines. */
export function powerMwhFromT(ch4T: number, lib: TechLibrary, constants: Constants): number {
  return (ch4T * constants.lhvGjPerT * lib.power.electricalEff) / GJ_PER_MWH;
}

/** Ventilation airflow (m3/s) that carries `ch4Mm3PerYr` of CH4 at `concFraction`. */
export function airflowM3sFromMm3(ch4Mm3PerYr: number, concFraction: number): number {
  return (ch4Mm3PerYr * M3_PER_MM3) / concFraction / SECONDS_PER_YEAR;
}

export interface StreamSizing {
  /** Design capacity: max(volumes) x capture efficiency, Mm3 CH4 a year. */
  capMm3PerYr: number;
  /** Engine size for power, kW. */
  powerKw: number;
  /** Design airflow for an RTO, m3/s. */
  airflowM3s: number;
  /** Stream capex including drainage and contingency, before any grant. */
  capexUsd: number;
}

/** Appendix B3 capex, mirroring `stream_cashflows` in reference/cmm_model.py. Needs a stream with a tech. */
export function sizeStream(
  stream: StreamInput,
  settings: Settings,
  lib: TechLibrary,
  constants: Constants,
): StreamSizing {
  const capMm3PerYr = Math.max(...stream.ch4Mm3ByYear) * stream.captureEff;
  let powerKw = 0;
  let airflowM3s = 0;
  let capexUsd = 0;
  if (stream.tech === 'power') {
    const peakMwh = powerMwhFromT(massTFromMm3(capMm3PerYr, constants), lib, constants);
    powerKw = (peakMwh * KW_PER_MW) / (HOURS_PER_YEAR * lib.power.availability);
    capexUsd = powerKw * lib.power.capexUsdPerKw;
  } else if (stream.tech === 'flare') {
    capexUsd = capMm3PerYr * lib.flare.capexUsdPerMm3Yr;
  } else if (stream.tech === 'rto') {
    airflowM3s = stream.airflowM3s ?? airflowM3sFromMm3(capMm3PerYr, stream.concFraction);
    capexUsd = airflowM3s * lib.rto.capexUsdPerM3s;
  }
  if (stream.needsDrainageCapex) capexUsd += capMm3PerYr * lib.drainage.capexUsdPerMm3Yr;
  capexUsd *= 1 + settings.contingency;
  return { capMm3PerYr, powerKw, airflowM3s, capexUsd };
}

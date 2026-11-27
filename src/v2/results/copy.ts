// Copy for the results dashboard (DESIGN.md and DESIGN_V2 "Copy": sentence case, no em dashes, no arrows). Every
// number comes in as a computed value; nothing here is typed by hand.
import { DASH, pct, usdPerT } from '../../lib/format';
import { STREAM_LABELS } from '../../model/constants';
import type { FinancingResult } from '../../model/financing';
import type { TornadoKey } from '../../model/tornado';
import type { ClosureCurve, MineInput, Result, StreamResult, Tech } from '../../model/types';
import { FINANCE_STRUCTURES, notAbatableReason, usdPrice } from '../../pages/MinePage/copy';
import type { StructureKey } from './model';

export { usdPrice };

const TECH_CHIP: Record<Tech, string> = {
  power: 'Engines make power',
  flare: 'Drained gas to a flare',
  rto: 'Thermal oxidiser',
};

/** The sticky bar's input chips: last year of mining, drained gas, what burns it, the credit price. */
export function inputChips(input: MineInput, result: Result, priceUsdPerT: number): string[] {
  const chips = [`Mining ends ${input.closureYear}`];
  const drained = result.streams.find((s) => s.kind === 'drained');
  const year1 = result.years[0]?.byStream.drained.ch4Mm3;
  const drainedMm3 = typeof input.drainedMm3PerYr === 'number' ? input.drainedMm3PerYr : year1;
  if (drained && drained.status === 'ok' && drainedMm3 !== undefined && drainedMm3 > 0) {
    chips.push(`${mm3(drainedMm3)} Mm³ drained gas`);
    if (drained.tech) chips.push(TECH_CHIP[drained.tech]);
  } else {
    chips.push('No drained gas');
  }
  chips.push(`${usdPrice(priceUsdPerT)} a tonne`);
  return chips;
}

/** Mm³ to at most one decimal place, without a trailing ".0". */
export function mm3(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export const SOURCE_TAG: Record<'record' | 'estimate', string> = {
  record: 'Illustrative inputs',
  estimate: 'Estimated inputs',
};

export function footnote(source: 'record' | 'estimate'): string {
  const head =
    source === 'record'
      ? 'Inputs are illustrative until measured gas and cost data arrive from the Central Mine Planning and Design Institute and Coal India.'
      : "Inputs are estimated from the mine's coal output, type and coalfield until measured gas data arrive.";
  return `${head} Results are indicative, at pre-feasibility level, and not investment advice.`;
}

export const NOT_ABATABLE_PILL = 'Not abatable with these technologies';

export function notAbatableText(streams: StreamResult[]): string {
  return notAbatableReason(streams);
}

/* ---------- the closure-year chart ---------- */

export const CLOSURE_TITLE = 'Every extra year of mining makes the methane cheaper to deal with';

/** The line under the closure chart's title, from the crossover year. */
export function closureLede(mineName: string, curve: ClosureCurve): string {
  const head = `Break-even credit price for ${mineName} by its last year of mining, everything else as set.`;
  const first = curve.years[0];
  const last = curve.years[curve.years.length - 1];
  const x = curve.crossoverYear;
  if (x === null) return `${head} A flare is cheaper than engines for every closure year to ${last}.`;
  if (x === first) return `${head} Engines are cheaper than a flare for every closure year from ${first}.`;
  return `${head} Engines need years of power sales to repay; a flare is cheaper for a mine that closes by ${x - 1}.`;
}

/** The shaded years' label, or null when nothing is shaded. */
export function flareZoneLabel(curve: ClosureCurve): string | null {
  const x = curve.crossoverYear;
  const last = curve.years[curve.years.length - 1];
  if (x === null) return `To ${last}: a flare is cheaper`;
  if (x === curve.years[0]) return null;
  return `Closing by ${x - 1}: a flare is cheaper`;
}

export function crossoverLabel(year: number): string {
  return `Engines cheaper from ${year}`;
}

export function mineOnCurveLabel(mineName: string, closureYear: number, lastYear: number, be: number | null): string {
  const when = closureYear > lastYear ? `mining past ${lastYear}` : String(closureYear);
  return `${mineName}, ${when}: ${be === null ? DASH : usdPerT(be)}`;
}

/** "Off the scale: $43.31 in 2027." for the points above the chart's cap, or null. */
export function offScaleText(points: { series: string; year: number; usdPerT: number }[], bothSeries: boolean): string | null {
  if (points.length === 0) return null;
  const items = points.map((p) => `${bothSeries ? `${p.series.toLowerCase()} ` : ''}${usdPerT(p.usdPerT)} in ${p.year}`);
  return `Off the scale: ${items.join(', ')}.`;
}

export const SERIES = { power: 'Gas engines', flare: 'Flare' } as const;

/* ---------- credits each year ---------- */

export const STREAM_NAMES = STREAM_LABELS;

/* ---------- the waterfall ---------- */

/** v2 names for the waterfall rows the v1 helper does not name the way the mockup does. */
export const WATERFALL_LABEL_OVERRIDES: Record<string, string> = { mrv: 'Verification' };

/** The line under the waterfall, from its power and build-cost parts. */
export function waterfallNote(capexUsdPerT: number, energyUsdPerT: number): string {
  if (energyUsdPerT >= 0 || capexUsdPerT <= 0) return 'There is no power to sell, so every part of the break-even is a cost.';
  const sold = usdPerT(-energyUsdPerT);
  const build = usdPerT(capexUsdPerT);
  if (-energyUsdPerT >= capexUsdPerT) {
    return `Power sold, ${sold} a tonne, pays for the whole build cost of ${build} and some of the running costs.`;
  }
  return `Power sold, ${sold} a tonne, cancels ${pct(-energyUsdPerT / capexUsdPerT, 0)} of the build cost of ${build}.`;
}

/* ---------- who could pay ---------- */

export function structureLabel(key: StructureKey, fin: FinancingResult): string {
  if (key === 'D') return `A price floor of ${usdPrice(fin.params.floorUsdPerT)}`;
  if (key === 'E') return `A ${pct(fin.params.grantShare, 0)} grant`;
  return FINANCE_STRUCTURES.find((f) => f.key === key)?.title ?? key;
}

export function whoPaysNote(fin: FinancingResult): string {
  const parts: string[] = [];
  const dev = fin.B.breakevenForDeveloperUsdPerT;
  if (dev !== null) parts.push(`A developer needs ${usdPerT(dev)} to earn its ${pct(fin.params.developerHurdleRate, 0)} return`);
  const floor = usdPrice(fin.params.floorUsdPerT);
  if (fin.D.floorCoversAtZero) parts.push(`a ${floor} floor covers the project on its own`);
  else if (fin.D.breakevenUsdPerT !== null) parts.push(`with a ${floor} floor, Coal India needs ${usdPerT(fin.D.breakevenUsdPerT)}`);
  if (parts.length === 0) return '';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/* ---------- what moves it most ---------- */

/** Tornado row names, spelled out (DESIGN_V2 "Copy": spell out acronyms). */
export const TORNADO_LABELS: Record<TornadoKey, string> = {
  power_price: 'Power value',
  engine_capex: 'Engine cost',
  rto_capex: 'Thermal oxidiser cost',
  drained: 'Drained gas',
  closure: 'Closure year',
  discount: 'Discount rate',
  gwp: 'Global warming potential',
  f_amm: 'Gas after closure',
  vam_conc: 'Ventilation methane',
  contingency: 'Contingency',
};

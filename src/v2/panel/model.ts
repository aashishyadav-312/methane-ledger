/*
 * The v2 inputs panel, without React: which input a mine gets (measured record or estimate), the panel's choices on
 * top of it, the link keys, and the rows of the v1 "All assumptions" sheet.
 *
 * Layers, last wins (the same order as the v1 mine page): the data files, the session overrides, the sheet's
 * changes (`x=`, `cm=`), then the panel's own controls. The model itself runs in v1 `useMineModel`.
 */
import { getMine, getTimeline, listMines } from '../../data/load';
import { pickMineInput, type PickedMineInput } from '../../data/estimation';
import { acceptsValue, buildRegistry, valueAt, type RegistryEntry, type ViewKey } from '../../data/registry';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import type { GassinessDegree, MineInput } from '../../model/types';
import { selectTech } from '../../model/technology';
import type { SheetRow } from '../../components/advanced/AssumptionsSheet';
import { DEFAULT_PANEL, mineBase, type ClosureBasis, type MineBase } from '../../pages/MinePage/useMineModel';
import {
  CREDITING_OPTIONS,
  DISCOUNT_OPTIONS,
  DRAINED_SLIDER_MM3_PER_YR,
  GRANT_OPTIONS,
  PRICE_INPUT_USD_PER_T,
  VAM_CONC_OPTIONS,
} from '../../pages/MinePage/controls';
import type { Overrides } from '../../state/session';
import {
  closureRange,
  CUSTOM_BASIS,
  type DrainedUse,
  type MineView,
  type MineViewContext,
  type PanelContext,
  type PanelState,
} from '../../state/url';
import type { MineId } from '../contracts';

/* ---------- the panel's estimate choices ---------- */

/** What the panel sets before the estimate is built. `null` keeps the estimated value. */
export interface EstimateChoices {
  /** Coal output, Mt a year. */
  outputMtPerYr: number | null;
  /** Gassiness grade. Estimates only: a measured record keeps its own. */
  degree: GassinessDegree | null;
  /** Total methane, Mm³ a year (the "Use this" button next to the Global Coal Mine Tracker figure). */
  totalMm3: number | null;
}

export const NO_CHOICES: EstimateChoices = Object.freeze({ outputMtPerYr: null, degree: null, totalMm3: null });

/**
 * Link keys the v2 panel adds to the v1 ones in `src/state/url.ts` (`p`, `d`, `cb`, `close`, `vam`, `use`, `g`, `r`,
 * `gwp`, `n`, `cm`, `x`). `m` repeats the mine id, so a query copied on its own still names the mine.
 */
export const V2_KEYS = { mine: 'm', output: 'out', degree: 'deg', total: 'tot' } as const;

/** Coal output the panel accepts, Mt a year (the largest Coal India mine produces about 70). */
export const OUTPUT_RANGE_MT_PER_YR = { min: 0, max: 200, step: 0.01 } as const;
/** Total methane the panel accepts, Mm³ a year. */
export const TOTAL_RANGE_MM3_PER_YR = { min: 0, max: 2000 } as const;
/** Drained gas the panel accepts, Mm³ a year: from 0 (estimates are often small) to the v1 slider's top. */
export const DRAINED_RANGE_MM3_PER_YR = { min: 0, max: DRAINED_SLIDER_MM3_PER_YR.max } as const;

const GRADES: readonly GassinessDegree[] = [1, 2, 3];

function numIn(query: URLSearchParams, key: string, range: { min: number; max: number }): number | null {
  const text = query.get(key);
  if (text === null || text.trim() === '') return null;
  const x = Number(text);
  return Number.isFinite(x) && x >= range.min && x <= range.max ? x : null;
}

export function decodeChoices(query: URLSearchParams): EstimateChoices {
  const deg = Number(query.get(V2_KEYS.degree));
  return {
    outputMtPerYr: numIn(query, V2_KEYS.output, OUTPUT_RANGE_MT_PER_YR),
    degree: GRADES.find((g) => g === deg) ?? null,
    totalMm3: numIn(query, V2_KEYS.total, TOTAL_RANGE_MM3_PER_YR),
  };
}

/** Adds the v2 keys to `query` (only the choices that are set). */
export function encodeChoices(query: URLSearchParams, id: MineId, choices: EstimateChoices): URLSearchParams {
  query.set(V2_KEYS.mine, id);
  if (choices.outputMtPerYr !== null) query.set(V2_KEYS.output, String(choices.outputMtPerYr));
  if (choices.degree !== null) query.set(V2_KEYS.degree, String(choices.degree));
  if (choices.totalMm3 !== null) query.set(V2_KEYS.total, String(choices.totalMm3));
  return query;
}

/* ---------- the base: input, settings and defaults for one mine ---------- */

/** A mine's model base, or why there is none. */
export interface PanelBase {
  picked: PickedMineInput;
  /** The measured record, when the mine has one (it beats the estimate). */
  record: MineRecord | undefined;
  /** Null when the mine cannot be modelled (`picked.status` is not `ok`). */
  base: MineBase | null;
}

function defaultUse(input: MineInput, tech: MineBase['tech']): DrainedUse {
  const choice = selectTech('drained', input.drainedConc, input.powerOfftake, tech, input.techOverride?.drained);
  return choice.tech === 'flare' ? 'flare' : 'power';
}

/** Total methane of a model input in its first year, Mm³ (drained gas plus ventilation air, or output × rate). */
export function totalMethaneMm3(input: MineInput): number {
  const first = (x: number | number[] | undefined) => (Array.isArray(x) ? (x[0] ?? 0) : (x ?? 0));
  const drained = first(input.drainedMm3PerYr);
  const vam = first(input.vamMm3PerYr);
  if (input.drainedMm3PerYr !== undefined && input.vamMm3PerYr !== undefined) return drained + vam;
  return first(input.productionMtPerYr) * (input.specificEmissionM3PerT ?? 0);
}

/** A record's input with its total methane scaled to `totalMm3`, keeping its split between the streams. */
function withTotalMethane(input: MineInput, totalMm3: number): MineInput {
  const now = totalMethaneMm3(input);
  if (!(now > 0)) return input;
  const f = totalMm3 / now;
  const scale = (x: number | number[] | undefined) => (Array.isArray(x) ? x.map((v) => v * f) : x === undefined ? x : x * f);
  return {
    ...input,
    drainedMm3PerYr: scale(input.drainedMm3PerYr),
    vamMm3PerYr: scale(input.vamMm3PerYr),
    specificEmissionM3PerT: input.specificEmissionM3PerT === undefined ? undefined : input.specificEmissionM3PerT * f,
  };
}

/**
 * Closure bases from the closure timeline: current output, the FY2026-27 target and the environmental clearance
 * capacity, each when the workbook has a year for it. The first is always there, so a link can name it.
 */
export function timelineBases(id: MineId, nowYear: number): ClosureBasis[] {
  const t = getTimeline()[id];
  const out: ClosureBasis[] = [{ id: 'now', label: 'At current output', year: nowYear }];
  if (t?.yearAtTarget != null && t.yearAtTarget !== nowYear)
    out.push({ id: 'target', label: 'At 2026-27 target', year: t.yearAtTarget });
  if (t?.yearAtEc != null && t.yearAtEc !== nowYear && t.yearAtEc !== t.yearAtTarget)
    out.push({ id: 'ec', label: 'At cleared capacity', year: t.yearAtEc });
  return out;
}

/**
 * Any record, for the parts of `mineBase` that do not depend on the mine (settings, technologies, costs, prices
 * with the sheet's changes). `useMineModel` reads none of a base's record fields.
 */
function templateRecord(): MineRecord {
  const first = listMines()[0];
  if (first === undefined) throw new Error('data/mines.json has no records');
  return first;
}

/** The input and defaults for one mine. Undefined for an id with no data at all. */
export function panelBase(
  id: MineId,
  choices: EstimateChoices,
  overrides: Overrides,
  panel: PanelState = DEFAULT_PANEL,
): PanelBase | undefined {
  const est = {
    ...(choices.outputMtPerYr === null ? {} : { outputMtPerYr: choices.outputMtPerYr }),
    ...(choices.degree === null ? {} : { degree: choices.degree }),
    ...(choices.totalMm3 === null ? {} : { totalMm3: choices.totalMm3 }),
  };
  const picked = pickMineInput(id, est);
  if (picked === undefined) return undefined;
  const record = picked.source === 'record' ? getMine(id) : undefined;

  if (record !== undefined) {
    const b = mineBase(record, overrides, panel);
    let input = b.input;
    if (choices.outputMtPerYr !== null) input = { ...input, productionMtPerYr: choices.outputMtPerYr };
    if (choices.totalMm3 !== null) input = withTotalMethane(input, choices.totalMm3);
    const bases = b.bases.length > 0 ? b.bases : [{ id: 'now', label: 'At current output', year: input.closureYear }];
    const defaults: MineView = {
      ...b.defaults,
      closureBasis: 'now',
      drainedMm3PerYr: typeof input.drainedMm3PerYr === 'number' ? input.drainedMm3PerYr : null,
    };
    return { picked, record, base: { ...b, input, bases, defaults } };
  }

  if (picked.input === null) return { picked, record, base: null };
  const shared = mineBase(templateRecord(), overrides, panel);
  const input = picked.input;
  const bases = timelineBases(id, input.closureYear);
  const { settings } = shared;
  const defaults: MineView = {
    priceUsdPerT: settings.creditPriceUsdPerT,
    drainedMm3PerYr: typeof input.drainedMm3PerYr === 'number' ? input.drainedMm3PerYr : null,
    closureBasis: 'now',
    closureYear: input.closureYear,
    vamConc: input.vamConc,
    drainedUse: defaultUse(input, shared.tech),
    grantShare: settings.grantShare,
    discountRate: settings.discountRate,
    gwp: settings.gwp,
    creditingYears: settings.creditingYears,
  };
  return { picked, record, base: { ...shared, input, hasUploadedSeries: false, bases, defaults } };
}

/* ---------- the view (the controls) ---------- */

const withDefault = (options: readonly number[], d: number): number[] =>
  (options.includes(d) ? [...options] : [...options, d]).sort((a, b) => a - b);

/** What a link is checked against: the v1 lists plus each mine's own defaults. */
export function viewContext(base: MineBase): MineViewContext {
  return {
    defaults: base.defaults,
    basisYears: Object.fromEntries(base.bases.map((b) => [b.id, b.year])),
    priceRangeUsdPerT: { min: PRICE_INPUT_USD_PER_T.min, max: PRICE_INPUT_USD_PER_T.max },
    drainedRangeMm3PerYr: {
      min: DRAINED_RANGE_MM3_PER_YR.min,
      max: Math.max(DRAINED_RANGE_MM3_PER_YR.max, base.defaults.drainedMm3PerYr ?? 0),
    },
    startYear: base.settings.startYear,
    vamConcOptions: withDefault(VAM_CONC_OPTIONS, base.defaults.vamConc),
    grantOptions: withDefault(GRANT_OPTIONS, base.defaults.grantShare),
    discountOptions: withDefault(DISCOUNT_OPTIONS, base.defaults.discountRate),
    gwpOptions: withDefault(base.constants.gwpOptions, base.defaults.gwp),
    creditingOptions: CREDITING_OPTIONS,
  };
}

const VIEW_KEYS = [
  'priceUsdPerT',
  'drainedMm3PerYr',
  'closureBasis',
  'closureYear',
  'vamConc',
  'drainedUse',
  'grantShare',
  'discountRate',
  'gwp',
  'creditingYears',
] as const satisfies readonly (keyof MineView)[];

/**
 * After a new estimate (another grade, output or total), each control still on the old default moves to the new
 * default; a control the person set keeps its value.
 */
export function rebaseView(view: MineView, from: MineView, to: MineView): MineView {
  const next = { ...view } as Record<keyof MineView, unknown>;
  for (const k of VIEW_KEYS) if (view[k] === from[k]) next[k] = to[k];
  return next as unknown as MineView;
}

/** The range a custom last year of mining can take: the crediting window (as on the v1 mine page). */
export function closureYearRange(base: MineBase, view: MineView): { min: number; max: number } {
  return closureRange(base.settings.startYear, view.creditingYears);
}

/** The control change for a sheet value with its own control. */
export function viewPatch(key: ViewKey, value: number, bases: readonly ClosureBasis[]): Partial<MineView> {
  if (key === 'closureYear') {
    const basis = bases.find((b) => b.year === value);
    return { closureBasis: basis?.id ?? CUSTOM_BASIS, closureYear: value };
  }
  if (key === 'creditingYears') return { creditingYears: value === 15 ? 15 : 10 };
  return { [key]: value };
}

/* ---------- price chips ---------- */

export interface PriceChipV2 {
  id: string;
  /** "Voluntary avg" */
  label: string;
  priceUsdPerT: number;
  /** The scenario's badge and note, for the chip's title. */
  description: string;
}

export function priceChips(prices: readonly PriceScenario[]): PriceChipV2[] {
  return prices
    .filter((s) => s.chip && s.priceUsdPerT !== null)
    .map((s) => ({
      id: s.id,
      label: s.shortLabel,
      priceUsdPerT: s.priceUsdPerT!.value,
      description: [s.badge?.label, s.note].filter(Boolean).join('. '),
    }));
}

/* ---------- the "All assumptions" sheet ---------- */

/**
 * The registry for a mine. A record lists its own fields. An estimate has no record, so its "Mine and gas" group
 * keeps only the values the panel's controls own; everything else (market, technology, costs, finance) is shared.
 */
export function registryFor(record: MineRecord | undefined): RegistryEntry[] {
  if (record !== undefined) return buildRegistry(record);
  return buildRegistry(templateRecord()).filter((e) => !e.path.startsWith('mine.') || e.view !== undefined);
}

export function sheetContext(entries: readonly RegistryEntry[], defaultCostModel: PanelState['costModel']): PanelContext {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return {
    defaultCostModel,
    accept: (path, value) => {
      const e = byPath.get(path);
      return e !== undefined && e.view === undefined && acceptsValue(e, value);
    },
  };
}

/** One row per registry value, with its value now and its default (the defaults ignore the sheet's changes). */
export function sheetRows(
  entries: readonly RegistryEntry[],
  defaults: MineBase,
  view: MineView,
  panel: PanelState,
  ctx: MineViewContext,
): SheetRow[] {
  const sources: Record<string, unknown> = {
    settings: defaults.settings,
    tech: defaults.tech,
    costs: defaults.costs,
    mine: defaults.input,
    finance: defaults.finance,
    prices: Object.fromEntries(defaults.prices.map((s) => [s.id, s.priceUsdPerT?.value])),
  };
  const options: Partial<Record<ViewKey, readonly number[]>> = {
    vamConc: ctx.vamConcOptions,
    grantShare: ctx.grantOptions,
    discountRate: ctx.discountOptions,
    gwp: ctx.gwpOptions,
    creditingYears: CREDITING_OPTIONS,
  };
  const ranges: Partial<Record<ViewKey, { min: number; max: number }>> = {
    priceUsdPerT: ctx.priceRangeUsdPerT,
    drainedMm3PerYr: ctx.drainedRangeMm3PerYr,
    closureYear: closureRange(ctx.startYear, view.creditingYears),
  };
  const rows: SheetRow[] = [];
  for (const entry of entries) {
    if (entry.view !== undefined) {
      const value = view[entry.view];
      const defaultValue = defaults.defaults[entry.view];
      if (typeof value !== 'number' || typeof defaultValue !== 'number') continue;
      rows.push({ entry, value, defaultValue, options: options[entry.view], range: ranges[entry.view] });
      continue;
    }
    const defaultValue = valueAt(sources, entry.path);
    if (typeof defaultValue !== 'number' && typeof defaultValue !== 'boolean') continue;
    rows.push({ entry, value: panel.changes[entry.path] ?? defaultValue, defaultValue });
  }
  return rows;
}

/* ---------- smog ---------- */

/** Methane of a mine for the smog strength (Appendix D): its record or estimate, else the tracker's figure. */
export function smogMethaneMm3(id: MineId, gemMethaneMm3: number | null): { methaneMm3PerYr: number | null; floor: boolean } {
  const picked = pickMineInput(id);
  if (picked === undefined) return { methaneMm3PerYr: gemMethaneMm3, floor: false };
  const floor = picked.degree === null || picked.degree === 1;
  if (picked.input !== null) return { methaneMm3PerYr: totalMethaneMm3(picked.input), floor };
  const est = picked.estimate?.totalMm3 ?? 0;
  return { methaneMm3PerYr: est > 0 ? est : gemMethaneMm3, floor };
}

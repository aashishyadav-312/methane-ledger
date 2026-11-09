// The numbers behind the Compare page: one `evaluate` run per mine record, then the supply curve and the headline.
// Pure functions only, so the page and its tests share them.
import { evaluate, type MineInput, type Result, type Settings, type StreamKind, type TechLibrary } from '../../model';
import { pct } from '../../lib/format';
import { listMines } from '../../data/load';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import { applyUploadedSeries } from '../DataPage/upload';
import {
  CREDITING_OPTIONS,
  DISCOUNT_OPTIONS,
  DRAINED_SLIDER_MM3_PER_YR,
  GRANT_OPTIONS,
  PRICE_INPUT_USD_PER_T,
  VAM_CONC_OPTIONS,
} from '../MinePage/controls';
import { mineBase, type MineBase } from '../MinePage/useMineModel';
import type { Overrides } from '../../state/session';
import type { MineView, MineViewContext } from '../../state/url';

/** The mine whose own controls come from the link. Every other entry keeps its own defaults. */
export const FOCUS_MINE_ID = 'bccl-moonidih';

/** Most entries the side-by-side table takes (PLAN_V1 Step 10: "two or three"). */
export const MAX_COMPARED = 3;
export const MIN_COMPARED = 2;

const TCO2E_PER_MTCO2E = 1_000_000;

export function mtco2e(tco2e: number): number {
  return tco2e / TCO2E_PER_MTCO2E;
}

export interface CompareEntry {
  id: string;
  name: string;
  kind: MineRecord['kind'];
  subsidiary: string;
  closureYear: number;
  result: Result;
  /** Break-even in US$ per tCO2e, or `null` when the entry has no stream the model can abate. */
  breakevenUsdPerT: number | null;
  /** Credits over the crediting period, tCO2e. */
  erTotalTco2e: number;
  npvUsd: number;
  capexUsd: number;
  /** True when any input of this entry is a placeholder. */
  illustrative: boolean;
  /** Why the entry is not abatable; `null` when it is. */
  reason: string | null;
}

/** The ranges and options a link is checked against, the same as the mine page uses. */
export function viewContext(base: MineBase): MineViewContext {
  const withDefault = (options: readonly number[], d: number) => (options.includes(d) ? options : [...options, d]);
  return {
    defaults: base.defaults,
    basisYears: Object.fromEntries(base.bases.map((b) => [b.id, b.year])),
    priceRangeUsdPerT: { min: PRICE_INPUT_USD_PER_T.min, max: PRICE_INPUT_USD_PER_T.max },
    drainedRangeMm3PerYr: { min: DRAINED_SLIDER_MM3_PER_YR.min, max: DRAINED_SLIDER_MM3_PER_YR.max },
    startYear: base.settings.startYear,
    vamConcOptions: withDefault(VAM_CONC_OPTIONS, base.defaults.vamConc),
    grantOptions: withDefault(GRANT_OPTIONS, base.defaults.grantShare),
    discountOptions: withDefault(DISCOUNT_OPTIONS, base.defaults.discountRate),
    gwpOptions: withDefault(base.constants.gwpOptions, base.defaults.gwp),
    creditingOptions: CREDITING_OPTIONS,
  };
}

/** The mine record the page reads its link with. */
export function focusRecord(): MineRecord {
  const record = listMines().find((m) => m.id === FOCUS_MINE_ID);
  if (record === undefined) throw new Error(`data/mines.json has no record "${FOCUS_MINE_ID}"`);
  return record;
}

/**
 * The view for one entry. The focus mine takes the whole view. Every other entry keeps its own closure year,
 * gas and technology choice, and shares the market and finance settings: price, discount rate, GWP, grant and
 * crediting period.
 */
export function entryView(base: MineBase, focusView: MineView, isFocus: boolean): MineView {
  if (isFocus) return focusView;
  return {
    ...base.defaults,
    priceUsdPerT: focusView.priceUsdPerT,
    discountRate: focusView.discountRate,
    gwp: focusView.gwp,
    grantShare: focusView.grantShare,
    creditingYears: focusView.creditingYears,
  };
}

/** The model input for a view, built the same way as on the mine page. */
export function entryInput(base: MineBase, view: MineView, overrides: Overrides): MineInput {
  const input: MineInput = {
    ...base.input,
    closureYear: view.closureYear,
    vamConc: view.vamConc,
    techOverride: { ...base.input.techOverride, drained: view.drainedUse, amm: view.drainedUse },
  };
  if (view.drainedMm3PerYr !== null) input.drainedMm3PerYr = view.drainedMm3PerYr;
  return applyUploadedSeries(input, overrides);
}

export function entrySettings(base: MineBase, view: MineView): Settings {
  return {
    ...base.settings,
    creditPriceUsdPerT: view.priceUsdPerT,
    discountRate: view.discountRate,
    gwp: view.gwp,
    grantShare: view.grantShare,
    creditingYears: view.creditingYears,
  };
}

const CONC_DIGITS = 2;

function streamConc(kind: StreamKind, input: MineInput): number {
  if (kind === 'drained') return input.drainedConc;
  if (kind === 'vam') return input.vamConc;
  return input.amm?.conc ?? 0;
}

/** Why no stream of an entry can be abated, in words, with the concentrations from its inputs. */
export function notAbatableReason(result: Result, input: MineInput, tech: TechLibrary): string {
  const minConc = Math.min(tech.power.minConc, tech.flare.minConc, tech.rto.minConc);
  const dilute = result.streams.filter((s) => s.status === 'needs_enrichment');
  if (dilute.length === 0) return 'There is no gas to destroy in the crediting period.';
  return dilute
    .map((s) => {
      const conc = streamConc(s.kind, input);
      const label = s.label.charAt(0).toUpperCase() + s.label.slice(1);
      return conc > 0
        ? `${label} is ${pct(conc, CONC_DIGITS)} methane, below the ${pct(minConc, CONC_DIGITS)} the leanest technology needs.`
        : `${label} has no methane concentration to capture.`;
    })
    .join(' ');
}

/** One entry per mine record: real mines first in file order, then archetypes. */
export function buildEntries(
  records: readonly MineRecord[],
  overrides: Overrides,
  focusView: MineView,
  isIllustrative: (record: MineRecord) => boolean,
): CompareEntry[] {
  return records.map((record) => {
    const base = mineBase(record, overrides);
    const view = entryView(base, focusView, record.id === FOCUS_MINE_ID);
    const input = entryInput(base, view, overrides);
    const result = evaluate(input, entrySettings(base, view), base.tech, base.constants);
    const abatable = result.abatable && result.breakevenUsdPerT !== null;
    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      subsidiary: record.subsidiary,
      closureYear: view.closureYear,
      result,
      breakevenUsdPerT: abatable ? result.breakevenUsdPerT : null,
      erTotalTco2e: result.erTotalTco2e,
      npvUsd: result.npvUsd,
      capexUsd: result.capexUsd,
      illustrative: isIllustrative(record),
      reason: abatable ? null : notAbatableReason(result, input, base.tech),
    };
  });
}

/** Abatable entries sorted by break-even, cheapest first (ties keep file order). */
export function rankEntries(entries: readonly CompareEntry[]): CompareEntry[] {
  return entries
    .filter((e) => e.breakevenUsdPerT !== null)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.breakevenUsdPerT! - b.e.breakevenUsdPerT! || a.i - b.i)
    .map(({ e }) => e);
}

export function notAbatable(entries: readonly CompareEntry[]): CompareEntry[] {
  return entries.filter((e) => e.breakevenUsdPerT === null);
}

export function pays(entry: CompareEntry, priceUsdPerT: number): boolean {
  return entry.breakevenUsdPerT !== null && entry.breakevenUsdPerT <= priceUsdPerT;
}

export interface Headline {
  priceUsdPerT: number;
  /** Entries that break even at the price. */
  paying: number;
  /** All entries, abatable or not. */
  total: number;
  /** Credits from the paying entries over the period, MtCO2e. */
  cutMtco2e: number;
  creditingYears: number;
}

export function headline(entries: readonly CompareEntry[], priceUsdPerT: number, creditingYears: number): Headline {
  const paying = entries.filter((e) => pays(e, priceUsdPerT));
  return {
    priceUsdPerT,
    paying: paying.length,
    total: entries.length,
    cutMtco2e: mtco2e(paying.reduce((sum, e) => sum + e.erTotalTco2e, 0)),
    creditingYears,
  };
}

export interface SupplyBar {
  id: string;
  name: string;
  breakevenUsdPerT: number;
  /** Credits over the period, tCO2e (the bar width). */
  erTco2e: number;
  /** Cumulative credits at the left edge of the bar, tCO2e. */
  startTco2e: number;
  pays: boolean;
}

export function supplyBars(entries: readonly CompareEntry[], priceUsdPerT: number): SupplyBar[] {
  let start = 0;
  return rankEntries(entries).map((e) => {
    const bar: SupplyBar = {
      id: e.id,
      name: e.name,
      breakevenUsdPerT: e.breakevenUsdPerT!,
      erTco2e: e.erTotalTco2e,
      startTco2e: start,
      pays: pays(e, priceUsdPerT),
    };
    start += e.erTotalTco2e;
    return bar;
  });
}

export interface ScenarioLine {
  id: string;
  /** For example "CCTS floor est. $11". */
  label: string;
  priceUsdPerT: number;
  badge: string | null;
  benchmark: boolean;
}

/** The scenarios drawn as lines: the ones the price ruler shows on the mine page. */
export function scenarioLines(prices: readonly PriceScenario[], format: (usdPerT: number) => string): ScenarioLine[] {
  return prices
    .filter((s) => s.ruler && s.priceUsdPerT !== null)
    .map((s) => ({
      id: s.id,
      label: `${s.shortLabel} ${format(s.priceUsdPerT!.value)}`,
      priceUsdPerT: s.priceUsdPerT!.value,
      badge: s.badge?.label ?? null,
      benchmark: s.badge?.kind === 'benchmark',
    }));
}

/** Parse the `sel` query value: known ids only, no repeats, at most `MAX_COMPARED`. */
export function parseSelection(text: string | null, knownIds: readonly string[]): string[] | null {
  if (text === null) return null;
  const out: string[] = [];
  for (const id of text.split(',')) {
    if (knownIds.includes(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX_COMPARED);
}

/** The two cheapest abatable entries, shown side by side until the user chooses. */
export function defaultSelection(entries: readonly CompareEntry[]): string[] {
  return rankEntries(entries)
    .slice(0, MIN_COMPARED)
    .map((e) => e.id);
}

const CUT_DIGITS = 2;

/** "At $15 a tonne, 3 of 6 mines and archetypes break even, cutting 4.91 MtCO2e over 10 years." */
export function headlineText(h: Headline, priceText: string): string {
  const head = `At ${priceText} a tonne,`;
  if (h.paying === 0) return `${head} none of the ${h.total} mines and archetypes break even.`;
  const cut = h.cutMtco2e.toLocaleString('en-US', {
    minimumFractionDigits: CUT_DIGITS,
    maximumFractionDigits: CUT_DIGITS,
  });
  return `${head} ${h.paying} of ${h.total} mines and archetypes break even, cutting ${cut} MtCO2e over ${h.creditingYears} years.`;
}

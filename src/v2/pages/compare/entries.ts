// The numbers behind the v2 Compare page: one `evaluate` run per modelled mine, then the supply curve and the
// headline. Pure functions, so the page and its tests share them. No React.
//
// A mine with a measured record (Moonidih) uses the record. Every other mine uses its estimated inputs
// (`pickMineInput`, PLAN_V2 Appendix B), with any uploaded values laid over them.
import { scaleLinear } from 'd3-scale';
import { pickMineInput } from '../../../data/estimation';
import { listMines } from '../../../data/load';
import type { MineRecord } from '../../../data/schemas';
import { evaluate, type MineInput, type Result, type Settings } from '../../../model';
import type { EstimateWarning } from '../../../model/types';
import type { Overrides } from '../../../state/session';
import type { MineView } from '../../../state/url';
import {
  buildEntries as buildArchetypeEntries,
  entryInput,
  entrySettings,
  FOCUS_MINE_ID,
  mtco2e,
} from '../../../pages/ComparePage/compare';
import { mineBase, type MineBase } from '../../../pages/MinePage/useMineModel';
import type { MineV2 } from '../../contracts';
import { listMinesV2 } from '../../map/data';
import { estimateOverridesFor } from '../estimateOverrides';

export { FOCUS_MINE_ID, mtco2e };

/** Most mines the side-by-side table takes (PLAN_V2 Step 8: "up to 3"). */
export const MAX_COMPARED = 3;
export const MIN_COMPARED = 2;
/** The cheapest bars carry a name on the chart. */
export const LABELLED_BARS = 10;

export type EntrySource = 'record' | 'estimate' | 'archetype';

export interface CompareRow {
  id: string;
  name: string;
  /** The subsidiary (BCCL, ECL, ...), or "Archetype". */
  subsidiary: string;
  state: string | null;
  source: EntrySource;
  closureYear: number;
  warnings: EstimateWarning[];
  result: Result;
  /** Break-even in US$ per tCO2e. */
  breakevenUsdPerT: number;
  /** Credits over the crediting period, tCO2e. */
  erTotalTco2e: number;
  npvUsd: number;
  capexUsd: number;
}

export interface ModelledSet {
  /** Abatable mines, cheapest break-even first (ties keep data order). */
  rows: CompareRow[];
  /** Operating mines in the data. */
  mineCount: number;
  /** Mines the model cannot abate (opencast, or too dilute) and mines with no recent output. */
  notAbatableCount: number;
  noOutputCount: number;
}

/** The shared model settings and defaults the Compare page builds every mine from. */
export function compareBase(overrides: Overrides): MineBase {
  const focus = listMines().find((m) => m.id === FOCUS_MINE_ID);
  if (focus === undefined) throw new Error(`data/mines.json has no record "${FOCUS_MINE_ID}"`);
  return mineBase(focus, overrides);
}

/** Rows sorted cheapest first; ties keep their order. */
export function rankRows<T extends { breakevenUsdPerT: number }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.breakevenUsdPerT - b.r.breakevenUsdPerT || a.i - b.i)
    .map(({ r }) => r);
}

/**
 * Every operating mine the model can run, at the market settings of `view`. `source: 'record'` for a mine with
 * measured data (it beats an estimate), `'estimate'` for the rest.
 */
export function modelMines(
  base: MineBase,
  view: MineView,
  overrides: Overrides,
  mines: readonly MineV2[] = listMinesV2(),
): ModelledSet {
  const settings: Settings = entrySettings(base, view);
  const rows: CompareRow[] = [];
  let notAbatableCount = 0;
  let noOutputCount = 0;
  for (const mine of mines) {
    const picked = pickMineInput(mine.id, estimateOverridesFor(mine.id, overrides), base.settings);
    if (picked === undefined) continue;
    if (picked.status === 'no_output') noOutputCount += 1;
    if (picked.status === 'not_abatable') notAbatableCount += 1;
    if (picked.input === null) continue;
    let input: MineInput = picked.input;
    if (picked.source === 'record') {
      // Measured data takes the path the mine page takes, so session overrides and uploaded series apply.
      const record = listMines().find((m) => m.id === mine.id);
      if (record !== undefined) input = entryInput(mineBase(record, overrides), view, overrides);
    }
    const result = evaluate(input, settings, base.tech, base.constants, base.costs);
    if (!result.abatable || result.breakevenUsdPerT === null) {
      notAbatableCount += 1;
      continue;
    }
    rows.push({
      id: mine.id,
      name: mine.name,
      subsidiary: mine.company,
      state: mine.state,
      source: picked.source,
      closureYear: input.closureYear,
      warnings: picked.warnings,
      result,
      breakevenUsdPerT: result.breakevenUsdPerT,
      erTotalTco2e: result.erTotalTco2e,
      npvUsd: result.npvUsd,
      capexUsd: result.capexUsd,
    });
  }
  return { rows: rankRows(rows), mineCount: mines.length, notAbatableCount, noOutputCount };
}

/** The five archetypes as rows (the optional toggle), at the same market settings. */
export function archetypeRows(view: MineView, overrides: Overrides): CompareRow[] {
  const records: MineRecord[] = listMines().filter((m) => m.kind === 'archetype');
  return buildArchetypeEntries(records, overrides, view, () => false).flatMap((e) =>
    e.breakevenUsdPerT === null
      ? []
      : [
          {
            id: e.id,
            name: e.name,
            subsidiary: 'Archetype',
            state: null,
            source: 'archetype' as const,
            closureYear: e.closureYear,
            warnings: [],
            result: e.result,
            breakevenUsdPerT: e.breakevenUsdPerT,
            erTotalTco2e: e.erTotalTco2e,
            npvUsd: e.npvUsd,
            capexUsd: e.capexUsd,
          },
        ],
  );
}

export const paysAt = (row: { breakevenUsdPerT: number }, priceUsdPerT: number): boolean =>
  row.breakevenUsdPerT <= priceUsdPerT;

/** The subsidiaries among the real mines, with how many rows each has, most rows first. */
export function subsidiaryCounts(rows: readonly CompareRow[]): { subsidiary: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.source !== 'archetype') counts.set(r.subsidiary, (counts.get(r.subsidiary) ?? 0) + 1);
  return [...counts.entries()]
    .map(([subsidiary, count]) => ({ subsidiary, count }))
    .sort((a, b) => b.count - a.count || a.subsidiary.localeCompare(b.subsidiary));
}

export interface HeadlineV2 {
  priceUsdPerT: number;
  /** Rows that break even at the price. */
  paying: number;
  /** Rows shown (after any filter). */
  total: number;
  /** Credits from the paying rows over the period, MtCO2e. */
  cutMtco2e: number;
  creditingYears: number;
}

export function headlineFor(rows: readonly CompareRow[], priceUsdPerT: number, creditingYears: number): HeadlineV2 {
  const paying = rows.filter((r) => paysAt(r, priceUsdPerT));
  return {
    priceUsdPerT,
    paying: paying.length,
    total: rows.length,
    cutMtco2e: mtco2e(paying.reduce((sum, r) => sum + r.erTotalTco2e, 0)),
    creditingYears,
  };
}

const CUT_DIGITS = 2;

/** "At $15 a tonne, 4 of 58 mines break even, cutting 7.72 MtCO2e over 10 years." */
export function headlineSentence(h: HeadlineV2, priceText: string, noun: string): string {
  const head = `At ${priceText} a tonne,`;
  if (h.paying === 0) return `${head} none of the ${h.total} ${noun} break even.`;
  const cut = h.cutMtco2e.toLocaleString('en-US', {
    minimumFractionDigits: CUT_DIGITS,
    maximumFractionDigits: CUT_DIGITS,
  });
  return `${head} ${h.paying} of ${h.total} ${noun} break even, cutting ${cut} MtCO2e over ${h.creditingYears} years.`;
}

/** The default side-by-side pair: the two cheapest. */
export function defaultSelection(rows: readonly CompareRow[]): string[] {
  return rankRows(rows)
    .slice(0, MIN_COMPARED)
    .map((r) => r.id);
}

/** Parse the `sel` query value: known ids only, no repeats, at most `MAX_COMPARED`. */
export function parseSelection(text: string | null, knownIds: readonly string[]): string[] | null {
  if (text === null) return null;
  const out: string[] = [];
  for (const id of text.split(',')) if (knownIds.includes(id) && !out.includes(id)) out.push(id);
  return out.slice(0, MAX_COMPARED);
}

export interface SupplyBarV2 {
  id: string;
  name: string;
  subsidiary: string;
  breakevenUsdPerT: number;
  erTco2e: number;
  startTco2e: number;
  pays: boolean;
  /** One of the cheapest `LABELLED_BARS`: the chart writes its name on or beside the bar. */
  labelled: boolean;
  /** A real mine, so a click opens it on the map. An archetype has no place on the map, so its bar is not a link. */
  opens: boolean;
}

export function supplyBarsV2(rows: readonly CompareRow[], priceUsdPerT: number): SupplyBarV2[] {
  let start = 0;
  return rankRows(rows).map((r, i) => {
    const bar: SupplyBarV2 = {
      id: r.id,
      name: r.name,
      subsidiary: r.subsidiary,
      breakevenUsdPerT: r.breakevenUsdPerT,
      erTco2e: r.erTotalTco2e,
      startTco2e: start,
      pays: paysAt(r, priceUsdPerT),
      labelled: i < LABELLED_BARS,
      opens: r.source !== 'archetype',
    };
    start += r.erTotalTco2e;
    return bar;
  });
}

/** The chart shows at least this many dollars a tonne, and twice the chosen price, whichever is higher. */
export const CHART_TOP_MIN_USD_PER_T = 40;
export const CHART_TOP_PRICE_MULTIPLE = 2;
const CHART_TICKS = 5;

/**
 * The price at the top of the supply curve. Most mines break even far above any price in play (the dearest is
 * over $1,000 a tonne), so the chart stops here and marks the bars that run off it.
 */
export function chartTopUsdPerT(priceUsdPerT: number): number {
  const wanted = Math.max(CHART_TOP_MIN_USD_PER_T, priceUsdPerT * CHART_TOP_PRICE_MULTIPLE);
  return scaleLinear().domain([0, wanted]).nice(CHART_TICKS).domain()[1];
}

/*
 * The v2 map data, through one adapter.
 *
 * It reads `src/generated/v2/mines_v2.json` (Step 1: keys mines, closedMines, outline, coalStates, cities, viewBox,
 * coalfieldNames; each mine carries lat, lon, positionQuality and gemMethaneMm3). If the file is missing or does not
 * match, it falls back to the v1 `mines_map.json` and fills the v2 fields (lat and lon null, positionQuality
 * "coalfield", gemMethaneMm3 null, searchKey normalised as in PLAN_V2 Appendix G). `import.meta.glob` keeps the v2
 * file optional at build time.
 *
 * Mine size (for the "largest mines in view" labels) is the latest coal output in `closure_timeline.json`.
 */
import { z } from 'zod';
import minesMapJson from '../../generated/mines_map.json';
import timelineJson from '../../generated/closure_timeline.json';
import type { MineId, MineV2, PositionQuality } from '../contracts';
import type { ViewBox } from './geometry';

export type Band = MineV2['band'];

export interface ClosedMineV2 {
  name: string;
  company: string;
  field: string;
  x: number;
  y: number;
}

export interface City {
  name: string;
  x: number;
  y: number;
  side: string;
}

export interface MapDataV2 {
  source: 'v2' | 'v1';
  viewBox: ViewBox;
  outline: string;
  coalStates: readonly { name: string; d: string }[];
  cities: readonly City[];
  mines: readonly MineV2[];
  closed: readonly ClosedMineV2[];
  /** Latest coal output in Mt a year, by mine id (0 when unknown). */
  outputMt: ReadonlyMap<MineId, number>;
  byId: ReadonlyMap<MineId, MineV2>;
}

const BANDS = ['by2031', 'by2036', 'by2050', 'after2050', 'nodate'] as const;
const TYPES = ['UG', 'OC', 'Mixed'] as const;

const MineSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  state: z.string(),
  type: z.string(),
  field: z.string(),
  band: z.enum(BANDS),
  runoutYear: z.number().nullable(),
  runoutLabel: z.string(),
  x: z.number(),
  y: z.number(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  positionQuality: z.enum(['gem', 'coalfield']).optional(),
  gemMethaneMm3: z.number().nullable().optional(),
  searchKey: z.string().optional(),
});

const ClosedSchema = z.object({
  name: z.string(),
  company: z.string(),
  field: z.string(),
  x: z.number(),
  y: z.number(),
});

const V1Schema = z.object({
  viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  outline: z.string(),
  coalStates: z.array(z.object({ name: z.string(), d: z.string() })),
  cities: z.array(z.object({ name: z.string(), x: z.number(), y: z.number(), side: z.string() })),
  mines: z.array(MineSchema),
  closed: z.array(ClosedSchema),
});

/** Step 1's file: every geometry key is optional and falls back to v1's. */
const V2Schema = z.object({
  viewBox: V1Schema.shape.viewBox.optional(),
  outline: z.string().optional(),
  coalStates: V1Schema.shape.coalStates.optional(),
  cities: V1Schema.shape.cities.optional(),
  mines: z.array(MineSchema),
  closedMines: z.array(ClosedSchema).optional(),
  closed: z.array(ClosedSchema).optional(),
});

const TimelineEntry = z.object({
  outputMt: z.record(z.string(), z.number().nullable()).nullable().optional(),
  rateUsedMtPerYr: z.number().nullable().optional(),
});

/** Tokens Appendix G drops from names, unless the query itself has them (Step 5's ranker handles that case). */
export const SEARCH_STOP_TOKENS: readonly string[] = [
  'colliery',
  'project',
  'mine',
  'mines',
  'ug',
  'oc',
  'ocp',
  'ocm',
  'incline',
  'pit',
  'expn',
  'expansion',
];

/** Appendix G: lower-case, strip accents and punctuation, collapse spaces, drop the stop tokens. */
export function normaliseSearchText(text: string, keepTokens: readonly string[] = []): string {
  const plain = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const keep = new Set(keepTokens);
  return plain
    .split(/\s+/)
    .filter((t) => t !== '' && (keep.has(t) || !SEARCH_STOP_TOKENS.includes(t)))
    .join(' ');
}

const toType = (t: string): MineV2['type'] => ((TYPES as readonly string[]).includes(t) ? (t as MineV2['type']) : 'Mixed');

function latestOutput(id: string, timeline: Record<string, unknown>): number {
  const parsed = TimelineEntry.safeParse(timeline[id]);
  if (!parsed.success) return 0;
  const out = parsed.data.outputMt ?? {};
  const latest = Object.keys(out)
    .sort()
    .reverse()
    .map((k) => out[k])
    .find((v): v is number => typeof v === 'number');
  return latest ?? parsed.data.rateUsedMtPerYr ?? 0;
}

function toMineV2(m: z.infer<typeof MineSchema>): MineV2 {
  const quality: PositionQuality = m.positionQuality ?? 'coalfield';
  return {
    id: m.id,
    name: m.name,
    company: m.company,
    state: m.state,
    type: toType(m.type),
    field: m.field,
    band: m.band,
    runoutYear: m.runoutYear,
    runoutLabel: m.runoutLabel,
    x: m.x,
    y: m.y,
    lat: m.lat ?? null,
    lon: m.lon ?? null,
    positionQuality: quality,
    gemMethaneMm3: m.gemMethaneMm3 ?? null,
    searchKey: m.searchKey ?? normaliseSearchText(m.name),
  };
}

// Optional at build time: an empty record until Step 1 writes the file.
const v2Files = import.meta.glob<unknown>('../../generated/v2/mines_v2.json', { eager: true, import: 'default' });

let cache: MapDataV2 | null = null;

/** The map data, parsed once. */
export function loadMapV2(): MapDataV2 {
  if (cache) return cache;
  const v1 = V1Schema.parse(minesMapJson);
  const v2Raw = Object.values(v2Files)[0];
  const parsed = v2Raw === undefined ? null : V2Schema.safeParse(v2Raw);
  if (parsed && !parsed.success) {
    // A shape this adapter does not know yet: keep the map working on v1 data and say so.
    console.warn('mines_v2.json did not match the map adapter; using mines_map.json.', parsed.error.issues.slice(0, 3));
  }
  const v2 = parsed?.success ? parsed.data : null;
  const mines = (v2?.mines ?? v1.mines).map(toMineV2);
  const timeline = timelineJson as Record<string, unknown>;
  cache = {
    source: v2 ? 'v2' : 'v1',
    viewBox: v2?.viewBox ?? v1.viewBox,
    outline: v2?.outline ?? v1.outline,
    coalStates: v2?.coalStates ?? v1.coalStates,
    cities: v2?.cities ?? v1.cities,
    mines,
    closed: v2?.closedMines ?? v2?.closed ?? v1.closed,
    outputMt: new Map(mines.map((m) => [m.id, latestOutput(m.id, timeline)])),
    byId: new Map(mines.map((m) => [m.id, m])),
  };
  return cache;
}

/** Every operating mine, in data order. */
export function listMinesV2(): readonly MineV2[] {
  return loadMapV2().mines;
}

export function getMineV2(id: MineId): MineV2 | undefined {
  return loadMapV2().byId.get(id);
}

// Upload: read the two template CSVs, check every row with the Step 3 mine schema, and turn the valid rows into
// session overrides. No React here, so the unit tests and the page share it.
//
// - `mine_inputs_template.csv`: one row per mine. Each filled cell becomes `mine.<mine_id>.<inputPath>`.
// - `mine_series_template.csv`: one row per mine and year. A column becomes one per-year array, kept as JSON text
//   at `series.<mine_id>.<field>` because a session override holds one number, flag or string.
// - A row with any bad cell is left out whole. Blank cells keep the default.
import Papa from 'papaparse';
import type { ZodIssue } from 'zod';
import { activeSeries, buildTimeline, type MineInput } from '../../model';
import { getSettings, getTimeline, listMines, unwrapMine } from '../../data/load';
import { MineRecordSchema, type MineRecord } from '../../data/schemas';
import { applyOverrides, getOverrides, setOverride, type OverrideValue, type Overrides } from '../../state/session';
import {
  INPUT_COLUMNS,
  MINE_ID_COLUMN,
  SERIES_COLUMNS,
  SERIES_YEAR_COLUMN,
  UNITS_MARKER,
  type CellKind,
  type InputColumn,
  type SeriesField,
} from './columns';

export const MINE_PREFIX = 'mine';
export const SERIES_PREFIX = 'series';

/** The longest crediting period the site offers; a series may run this many years from the start year. */
const MAX_WINDOW_YEARS = 15;
const UPLOAD_QUALITY = 'estimated';

export interface UploadError {
  /** Line in the file, counting the header as line 1. */
  row: number;
  column: string | null;
  message: string;
}

export interface Assignment {
  /** The override key. */
  path: string;
  /** A number, a flag, or (for a series) the per-year array as JSON text. */
  value: OverrideValue;
  /** False when the value equals what the site already uses without any override. */
  changed: boolean;
  mineId: string;
}

export interface UploadReport {
  kind: 'inputs' | 'series';
  /** Data rows in the file (units row and blank lines not counted). */
  rowsRead: number;
  rowsUsed: number;
  errors: UploadError[];
  assignments: Assignment[];
}

function emptyReport(kind: UploadReport['kind']): UploadReport {
  return { kind, rowsRead: 0, rowsUsed: 0, errors: [], assignments: [] };
}

/* ---------- reading the file ---------- */

type Cells = string[];

function readCsv(text: string): Cells[] {
  const parsed = Papa.parse<Cells>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
  return parsed.data;
}

const isBlankRow = (cells: Cells) => cells.every((c) => c.trim() === '');
const isUnitsRow = (cells: Cells) => cells[0]?.trim().toLowerCase() === UNITS_MARKER;

/** Reads a number, a year or a yes/no cell. Returns the value or a plain-words problem. */
export function parseCell(kind: CellKind, text: string): { value: number | boolean } | { problem: string } {
  const t = text.trim();
  if (kind === 'yesno') {
    const word = t.toLowerCase();
    if (['yes', 'true', '1'].includes(word)) return { value: true };
    if (['no', 'false', '0'].includes(word)) return { value: false };
    return { problem: `"${t}" is not yes or no` };
  }
  const x = Number(t);
  if (t === '' || !Number.isFinite(x)) return { problem: `"${t}" is not a number` };
  if (kind === 'year' && !Number.isInteger(x)) return { problem: `"${t}" is not a whole year` };
  return { value: x };
}

/* ---------- schema issues in plain words ---------- */

function plainIssue(issue: ZodIssue, found: string): string {
  const i = issue as unknown as Record<string, unknown>;
  const code = String(i.code);
  const tail = found === '' ? '' : ` (found ${found})`;
  if (code === 'too_small') {
    const bound = String(i.minimum);
    return (i.inclusive === false ? `must be more than ${bound}` : `must be at least ${bound}`) + tail;
  }
  if (code === 'too_big') {
    const bound = String(i.maximum);
    return (i.inclusive === false ? `must be less than ${bound}` : `must be at most ${bound}`) + tail;
  }
  if (code === 'invalid_type') return `expected ${String(i.expected)}${tail}`;
  return issue.message + tail;
}

function pathStartsWith(path: readonly PropertyKey[], prefix: readonly PropertyKey[]): boolean {
  return prefix.length <= path.length && prefix.every((k, n) => path[n] === k);
}

/* ---------- records ---------- */

function knownRecords(): Map<string, MineRecord> {
  return new Map(listMines().map((m) => [m.id, m]));
}

function unknownMineMessage(id: string, records: Map<string, MineRecord>): string {
  return `unknown mine "${id}"; v1 can change the inputs of: ${[...records.keys()].join(', ')}`;
}

type Wrapper = { value?: unknown; unit?: string; source?: string; quality?: string };

/** Writes `value` into a copy of the record, in the place the column names. Returns false if the place is missing. */
function setCell(record: Record<string, unknown>, c: InputColumn, value: number | boolean, source: string): boolean {
  let node: Record<string, unknown> = record;
  for (const key of c.wrapper.slice(0, -1)) {
    const child = node[key];
    if (typeof child !== 'object' || child === null) return false;
    node = child as Record<string, unknown>;
  }
  const last = c.wrapper[c.wrapper.length - 1];
  const existing = node[last];
  const wrapper: Wrapper =
    typeof existing === 'object' && existing !== null && 'value' in existing
      ? { ...(existing as Wrapper) }
      : { unit: c.unit, quality: UPLOAD_QUALITY };
  wrapper.source = source;
  wrapper.quality = UPLOAD_QUALITY;
  wrapper.unit ??= c.unit;
  if (c.inner === undefined) {
    wrapper.value = value;
  } else {
    wrapper.value = { ...(wrapper.value as Record<string, unknown>), [c.inner]: value };
  }
  node[last] = wrapper;
  return true;
}

function getPath(input: unknown, dotted: string): unknown {
  let node = input;
  for (const key of dotted.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** The column a schema issue belongs to: the longest column path the issue path starts with. */
function columnForIssue(path: readonly PropertyKey[], columns: readonly InputColumn[]): InputColumn | undefined {
  const fullPath = (c: InputColumn) => (c.inner === undefined ? c.wrapper : [...c.wrapper, 'value', c.inner]);
  return columns
    .filter(
      (c) =>
        pathStartsWith(path, fullPath(c)) || (path.length < fullPath(c).length && pathStartsWith(fullPath(c), path)),
    )
    .sort((a, b) => fullPath(b).length - fullPath(a).length)[0];
}

/* ---------- mine inputs ---------- */

/** Default value of each input column for one mine: the data files, with no overrides. */
function defaultInput(record: MineRecord): MineInput {
  return unwrapMine(record, getTimeline());
}

export function checkInputsCsv(text: string): UploadReport {
  const report = emptyReport('inputs');
  const rows = readCsv(text);
  const header = (rows[0] ?? []).map((c) => c.trim());
  const records = knownRecords();

  const idIndex = header.indexOf(MINE_ID_COLUMN);
  if (idIndex < 0) {
    report.errors.push({ row: 1, column: MINE_ID_COLUMN, message: `the header has no "${MINE_ID_COLUMN}" column` });
    return report;
  }
  const byName = new Map(INPUT_COLUMNS.map((c) => [c.name, c]));
  const columnAt: (InputColumn | null)[] = header.map((name, i) => {
    if (i === idIndex) return null;
    const c = byName.get(name);
    if (c === undefined && name !== '') {
      report.errors.push({ row: 1, column: name, message: 'is not a column of the template, so it is ignored' });
    }
    return c ?? null;
  });

  const seen = new Map<string, number>();
  rows.slice(1).forEach((cells, k) => {
    const row = k + 2;
    if (isBlankRow(cells) || (row === 2 && isUnitsRow(cells))) return;
    report.rowsRead += 1;
    const errors: UploadError[] = [];
    const fail = (column: string | null, message: string) => errors.push({ row, column, message });

    if (cells.length > header.length) fail(null, `has ${cells.length} cells but the header has ${header.length}`);
    const id = (cells[idIndex] ?? '').trim();
    const record = records.get(id);
    if (id === '') fail(MINE_ID_COLUMN, 'is empty');
    else if (record === undefined) fail(MINE_ID_COLUMN, unknownMineMessage(id, records));
    else if (seen.has(id)) fail(MINE_ID_COLUMN, `"${id}" already has a row on line ${seen.get(id)}`);
    else seen.set(id, row);
    if (record === undefined) {
      report.errors.push(...errors);
      return;
    }

    const candidate = structuredClone(record) as unknown as Record<string, unknown>;
    const filled: { column: InputColumn; value: number | boolean; text: string }[] = [];
    columnAt.forEach((column, i) => {
      const cell = (cells[i] ?? '').trim();
      if (column === null || cell === '') return;
      const parsed = parseCell(column.kind, cell);
      if ('problem' in parsed) return fail(column.name, parsed.problem);
      if (!setCell(candidate, column, parsed.value, `Uploaded file, line ${row}`)) {
        return fail(column.name, `${record.name} has no abandoned mine methane inputs, so this column cannot be set`);
      }
      filled.push({ column, value: parsed.value, text: cell });
    });

    const checked = MineRecordSchema.safeParse(candidate);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const column = columnForIssue(issue.path, INPUT_COLUMNS);
        const shown = filled.find((f) => f.column === column)?.text ?? '';
        fail(column?.name ?? null, plainIssue(issue, shown));
      }
    }

    if (errors.length > 0) {
      report.errors.push(...errors);
      return;
    }
    report.rowsUsed += 1;
    const base = defaultInput(record);
    for (const f of filled) {
      report.assignments.push({
        mineId: id,
        path: `${MINE_PREFIX}.${id}.${f.column.inputPath}`,
        value: f.value,
        changed: getPath(base, f.column.inputPath) !== f.value,
      });
    }
  });
  return report;
}

/* ---------- mine series ---------- */

function effectiveInput(record: MineRecord, overrides: Overrides): MineInput {
  return applyOverrides(defaultInput(record), overrides, `${MINE_PREFIX}.${record.id}`);
}

export function checkSeriesCsv(text: string, overrides: Overrides = getOverrides()): UploadReport {
  const report = emptyReport('series');
  const rows = readCsv(text);
  const header = (rows[0] ?? []).map((c) => c.trim());
  const records = knownRecords();
  const settings = applyOverrides(getSettings(), overrides, 'settings');
  const firstYear = settings.startYear;
  const lastYear = firstYear + MAX_WINDOW_YEARS - 1;

  const idIndex = header.indexOf(MINE_ID_COLUMN);
  const yearIndex = header.indexOf(SERIES_YEAR_COLUMN);
  for (const [name, index] of [
    [MINE_ID_COLUMN, idIndex],
    [SERIES_YEAR_COLUMN, yearIndex],
  ] as const) {
    if (index < 0) report.errors.push({ row: 1, column: name, message: `the header has no "${name}" column` });
  }
  if (idIndex < 0 || yearIndex < 0) return report;
  const columnAt = header.map((name) => SERIES_COLUMNS.find((c) => c.name === name) ?? null);
  header.forEach((name, i) => {
    if (i !== idIndex && i !== yearIndex && columnAt[i] === null && name !== '') {
      report.errors.push({ row: 1, column: name, message: 'is not a column of the template, so it is ignored' });
    }
  });

  interface Point {
    row: number;
    year: number;
    values: Partial<Record<SeriesField, number>>;
  }
  const points = new Map<string, Point[]>();
  const seenYears = new Map<string, number>();

  rows.slice(1).forEach((cells, k) => {
    const row = k + 2;
    if (isBlankRow(cells) || (row === 2 && isUnitsRow(cells))) return;
    report.rowsRead += 1;
    const errors: UploadError[] = [];
    const fail = (column: string | null, message: string) => errors.push({ row, column, message });

    const id = (cells[idIndex] ?? '').trim();
    const record = records.get(id);
    if (id === '') fail(MINE_ID_COLUMN, 'is empty');
    else if (record === undefined) fail(MINE_ID_COLUMN, unknownMineMessage(id, records));

    const yearText = (cells[yearIndex] ?? '').trim();
    const year = parseCell('year', yearText);
    let yearValue = 0;
    if ('problem' in year) fail(SERIES_YEAR_COLUMN, year.problem);
    else {
      yearValue = Number(year.value);
      if (yearValue < firstYear || yearValue > lastYear) {
        fail(SERIES_YEAR_COLUMN, `${yearValue} is outside the model years ${firstYear} to ${lastYear}`);
      } else if (seenYears.has(`${id}|${yearValue}`)) {
        fail(SERIES_YEAR_COLUMN, `${id} already has ${yearValue} on line ${seenYears.get(`${id}|${yearValue}`)}`);
      }
    }

    const values: Partial<Record<SeriesField, number>> = {};
    if (record !== undefined) {
      const candidate = structuredClone(record) as unknown as Record<string, unknown>;
      const shown = new Map<string, string>();
      columnAt.forEach((column, i) => {
        const cell = (cells[i] ?? '').trim();
        if (column === null || cell === '') return;
        const parsed = parseCell('number', cell);
        if ('problem' in parsed) return fail(column.name, parsed.problem);
        const wrapper = candidate[column.field] as Wrapper;
        candidate[column.field] = {
          ...wrapper,
          value: parsed.value,
          source: `Uploaded file, line ${row}`,
          quality: UPLOAD_QUALITY,
        };
        shown.set(column.field, cell);
        values[column.field] = Number(parsed.value);
      });
      const checked = MineRecordSchema.safeParse(candidate);
      if (!checked.success) {
        for (const issue of checked.error.issues) {
          const column = SERIES_COLUMNS.find((c) => issue.path[0] === c.field);
          fail(column?.name ?? null, plainIssue(issue, shown.get(String(issue.path[0])) ?? ''));
        }
      }
    }

    if (errors.length > 0) {
      report.errors.push(...errors);
      return;
    }
    report.rowsUsed += 1;
    seenYears.set(`${id}|${yearValue}`, row);
    points.set(id, [...(points.get(id) ?? []), { row, year: yearValue, values }]);
  });

  for (const [id, list] of points) {
    const record = records.get(id)!;
    const input = effectiveInput(record, overrides);
    const timeline = buildTimeline(input, settings);
    for (const column of SERIES_COLUMNS) {
      const given = list.filter((p) => p.values[column.field] !== undefined);
      if (given.length === 0) continue;
      const size = Math.max(...list.map((p) => p.year)) - firstYear + 1;
      const perYear = Array.from({ length: size }, () => 0);
      for (const p of list) perYear[p.year - firstYear] = p.values[column.field] ?? 0;
      const baseline = activeSeries(defaultInput(record)[column.field], timeline);
      const candidate = activeSeries(perYear, timeline);
      report.assignments.push({
        mineId: id,
        path: `${SERIES_PREFIX}.${id}.${column.field}`,
        value: JSON.stringify(perYear),
        changed: baseline.some((v, i) => v !== candidate[i]),
      });
    }
  }
  return report;
}

/* ---------- applying ---------- */

/** Writes a report into the session overrides. A value equal to the default clears any earlier override. */
export function applyReport(report: UploadReport): { set: number; cleared: number } {
  let set = 0;
  let cleared = 0;
  for (const a of report.assignments) {
    if (a.changed) {
      setOverride(a.path, a.value);
      set += 1;
    } else {
      setOverride(a.path, undefined);
      cleared += 1;
    }
  }
  return { set, cleared };
}

/** Overrides an upload wrote: every input and series key. */
export function uploadedPaths(overrides: Overrides): string[] {
  return Object.keys(overrides).filter((p) => p.startsWith(`${MINE_PREFIX}.`) || p.startsWith(`${SERIES_PREFIX}.`));
}

export function clearUploaded(): void {
  for (const path of uploadedPaths(getOverrides())) setOverride(path, undefined);
}

const SERIES_FIELDS: readonly SeriesField[] = SERIES_COLUMNS.map((c) => c.field);

/** The per-year arrays an upload stored for a mine, laid over its input. Other inputs are untouched. */
export function applyUploadedSeries(input: MineInput, overrides: Overrides): MineInput {
  let out = input;
  for (const field of SERIES_FIELDS) {
    const text = overrides[`${SERIES_PREFIX}.${input.id}.${field}`];
    if (typeof text !== 'string') continue;
    const parsed = parseSeries(text);
    if (parsed !== null) out = { ...out, [field]: parsed };
  }
  return out;
}

function parseSeries(text: string): number[] | null {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v))
      ? (value as number[])
      : null;
  } catch {
    return null;
  }
}

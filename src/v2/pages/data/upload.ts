// v2 upload (PLAN_V2 Step 8). The inputs file now takes two kinds of row:
//
// - a mine with a record (Moonidih, the archetypes): checked and applied exactly as in v1, by `checkInputsCsv`;
// - an operating mine without a record: its estimate. `closure_year`, `production_mt_per_yr`, `degree` and
//   `methane_mm3` replace the estimated value for that mine in this session, as `estimate.<id>.<field>` overrides.
//
// A row with any bad cell is left out whole, and blank cells keep the default. No React here.
import Papa from 'papaparse';
import { estimateById } from '../../../data/estimation';
import { getDefaultSettings, listMines } from '../../../data/load';
import { INPUT_COLUMNS, MINE_ID_COLUMN, UNITS_MARKER } from '../../../pages/DataPage/columns';
import {
  checkInputsCsv,
  checkSeriesCsv,
  clearUploaded as clearV1,
  uploadedPaths as uploadedPathsV1,
  type Assignment,
  type UploadError,
  type UploadReport,
} from '../../../pages/DataPage/upload';
import { getOverrides, setOverride, type Overrides } from '../../../state/session';
import { getMineV2 } from '../../map/data';
import { ESTIMATE_PREFIX, estimateKey } from '../estimateOverrides';
import { TEMPLATE_SIGNIFICANT_DIGITS } from './templates';
import {
  ADDED_COLUMNS,
  DEGREE_COLUMN,
  ESTIMATE_COLUMNS,
  LAST_CLOSURE_YEAR,
  METHANE_COLUMN,
  type EstimateColumn,
} from './columns';

export type { Assignment, UploadError, UploadReport };

type Cells = string[];

const isBlankRow = (cells: Cells) => cells.every((c) => c.trim() === '');
const isUnitsRow = (cells: Cells) => cells[0]?.trim().toLowerCase() === UNITS_MARKER;

function parseEstimateCell(column: EstimateColumn, text: string): { value: number } | { problem: string } {
  const t = text.trim();
  const x = Number(t);
  if (t === '' || !Number.isFinite(x)) return { problem: `"${t}" is not a number` };
  if (column.kind === 'year') {
    if (!Number.isInteger(x)) return { problem: `"${t}" is not a whole year` };
    const first = getDefaultSettings().startYear;
    if (x < first || x > LAST_CLOSURE_YEAR) return { problem: `must be from ${first} to ${LAST_CLOSURE_YEAR} (found ${t})` };
  }
  if (column.kind === 'degree' && ![1, 2, 3].includes(x)) return { problem: `must be 1, 2 or 3 (found ${t})` };
  if (column.kind === 'number' && x < 0) return { problem: `must be at least 0 (found ${t})` };
  return { value: x };
}

/** The value the site uses for this field with no override: what an unchanged upload must match. */
function estimateDefault(id: string, field: EstimateColumn['field']): number | null | undefined {
  const e = estimateById(id);
  if (e === undefined) return undefined;
  if (field === 'closureYear') return e.closureYear;
  if (field === 'outputMtPerYr') return e.productionMtPerYr;
  if (field === 'degree') return e.degree;
  return e.totalMm3;
}

/** The v1 input columns only a mine with a record reads. */
const V1_COLUMN_NAMES: ReadonlySet<string> = new Set(INPUT_COLUMNS.map((c) => c.name));

/** The template holds estimates to `TEMPLATE_SIGNIFICANT_DIGITS`, so a value that matches at that precision is unchanged. */
function sameValue(current: number | null | undefined, uploaded: number): boolean {
  return current !== null && current !== undefined && Number(current.toPrecision(TEMPLATE_SIGNIFICANT_DIGITS)) === uploaded;
}

const recordIds = (): Set<string> => new Set(listMines().map((m) => m.id));

/** Reads the inputs file. Rows for mines with a record go to the v1 checker; the rest are checked here. */
export function checkInputsCsvV2(text: string): UploadReport {
  const parsed = Papa.parse<Cells>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false }).data;
  const header = (parsed[0] ?? []).map((c) => c.trim());
  const idIndex = header.indexOf(MINE_ID_COLUMN);
  if (idIndex < 0) return checkInputsCsv(text); // the v1 checker words the missing-column problem

  const addedIndex = ADDED_COLUMNS.map((c) => header.indexOf(c.name));
  const isAdded = (i: number) => addedIndex.includes(i);
  const withoutAdded = (cells: Cells) => cells.filter((_, i) => !isAdded(i));
  const records = recordIds();

  const recordErrors: UploadError[] = [];
  let recordRowsFailed = 0;
  const estimateRows: { row: number; cells: Cells }[] = [];
  // The v1 checker reads every row but the estimated ones, which are blanked so line numbers stay true.
  const forV1: Cells[] = parsed.map((cells, i) => {
    if (i === 0) return withoutAdded(cells);
    const row = i + 1;
    if (isBlankRow(cells) || (row === 2 && isUnitsRow(cells))) return withoutAdded(cells);
    const id = (cells[idIndex] ?? '').trim();
    if (!records.has(id)) {
      estimateRows.push({ row, cells });
      return [];
    }
    const misplaced = addedIndex.filter((k) => k >= 0 && (cells[k] ?? '').trim() !== '');
    if (misplaced.length === 0) return withoutAdded(cells);
    // A mine with a record has no estimate to change, so the row is reported and left out whole.
    recordRowsFailed += 1;
    for (const k of misplaced) {
      recordErrors.push({
        row,
        column: header[k],
        message: `${id} has a record, so ${header[k]} does not apply. Use the other columns to change its inputs`,
      });
    }
    return [];
  });

  const base = checkInputsCsv(Papa.unparse(forV1, { newline: '\n' }));
  const report: UploadReport = {
    kind: 'inputs',
    rowsRead: base.rowsRead + recordRowsFailed,
    rowsUsed: base.rowsUsed,
    errors: [...base.errors, ...recordErrors],
    assignments: [...base.assignments],
  };

  const seen = new Map<string, number>();
  const columnAt = header.map((name) => ESTIMATE_COLUMNS.find((c) => c.name === name) ?? null);
  for (const { row, cells } of estimateRows) {
    report.rowsRead += 1;
    const rowErrors: UploadError[] = [];
    const fail = (column: string | null, message: string) => rowErrors.push({ row, column, message });
    const id = (cells[idIndex] ?? '').trim();
    if (id === '') fail(MINE_ID_COLUMN, 'is empty');
    else if (getMineV2(id) === undefined) {
      fail(MINE_ID_COLUMN, `unknown mine "${id}"; use the mine_id of a mine on the map, such as bccl-amp-colliery`);
    } else if (seen.has(id)) fail(MINE_ID_COLUMN, `"${id}" already has a row on line ${seen.get(id)}`);
    else seen.set(id, row);

    const values: { column: EstimateColumn; value: number }[] = [];
    cells.forEach((raw, i) => {
      const text = raw.trim();
      if (i === idIndex || text === '' || header[i] === undefined || header[i] === '') return;
      const column = columnAt[i];
      if (column === null) return; // an unknown column is reported once, with the header, by the v1 checker
      const parsedCell = parseEstimateCell(column, text);
      if ('problem' in parsedCell) fail(column.name, parsedCell.problem);
      else values.push({ column, value: parsedCell.value });
    });
    // Columns that only a mine with a record reads.
    header.forEach((name, i) => {
      if (i === idIndex || columnAt[i] !== null || name === '') return;
      if ((cells[i] ?? '').trim() !== '' && V1_COLUMN_NAMES.has(name)) {
        fail(name, `${id || 'this mine'} has no record, so only closure_year, production_mt_per_yr, ${DEGREE_COLUMN} and ${METHANE_COLUMN} apply`);
      }
    });

    if (rowErrors.length > 0) {
      report.errors.push(...rowErrors);
      continue;
    }
    report.rowsUsed += 1;
    for (const { column, value } of values) {
      report.assignments.push({
        mineId: id,
        path: estimateKey(id, column.field),
        value,
        changed: !sameValue(estimateDefault(id, column.field), value),
      });
    }
  }

  report.errors.sort((a, b) => a.row - b.row);
  return report;
}

/** Yearly series stay with the mines that have a record. The message names what the file can set. */
export function checkSeriesCsvV2(text: string): UploadReport {
  const report = checkSeriesCsv(text);
  return {
    ...report,
    errors: report.errors.map((e) => ({
      ...e,
      message: e.message.replace('v1 can change the inputs of:', 'a yearly series can be set for:'),
    })),
  };
}

/** Overrides an upload wrote: the v1 keys and the estimate keys. */
export function uploadedPathsV2(overrides: Overrides): string[] {
  return [...uploadedPathsV1(overrides), ...Object.keys(overrides).filter((p) => p.startsWith(`${ESTIMATE_PREFIX}.`))];
}

export function clearUploadedV2(): void {
  clearV1();
  for (const path of uploadedPathsV2(getOverrides())) setOverride(path, undefined);
}

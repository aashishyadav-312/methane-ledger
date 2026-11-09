// The two template files, built from the Moonidih record. `public/templates/*.csv` must match these byte for
// byte (tests/ui/upload.test.ts checks it), so a change to the data or the columns shows up as a failing test.
import Papa from 'papaparse';
import { buildTimeline, activeSeries } from '../../model';
import { getSettings, getTimeline, listMines, unwrapMine } from '../../data/load';
import type { MineInput } from '../../model';
import {
  INPUT_COLUMNS,
  MINE_ID_COLUMN,
  SERIES_COLUMNS,
  SERIES_HEADER,
  UNITS_MARKER,
} from './columns';

export const TEMPLATE_MINE_ID = 'bccl-moonidih';
export const INPUTS_TEMPLATE_FILE = 'mine_inputs_template.csv';
export const SERIES_TEMPLATE_FILE = 'mine_series_template.csv';

function templateInput(): MineInput {
  const record = listMines().find((m) => m.id === TEMPLATE_MINE_ID);
  if (record === undefined) throw new Error(`data/mines.json has no record "${TEMPLATE_MINE_ID}"`);
  return unwrapMine(record, getTimeline());
}

function getPath(input: unknown, dotted: string): unknown {
  let node = input;
  for (const key of dotted.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function cellText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/** Header row, units row, then one row for Moonidih. A cell is blank where the record has no such value. */
export function inputsTemplateCsv(): string {
  const input = templateInput();
  const header = [MINE_ID_COLUMN, ...INPUT_COLUMNS.map((c) => c.name)];
  const units = [UNITS_MARKER, ...INPUT_COLUMNS.map((c) => c.unit)];
  const row = [input.id, ...INPUT_COLUMNS.map((c) => cellText(getPath(input, c.inputPath)))];
  return `${Papa.unparse([header, units, row], { newline: '\n' })}\n`;
}

/** One row per active year of Moonidih with its yearly production and gas. */
export function seriesTemplateCsv(): string {
  const input = templateInput();
  const settings = getSettings();
  const timeline = buildTimeline(input, settings);
  const columns = SERIES_COLUMNS.map((c) => activeSeries(input[c.field], timeline));
  const rows = timeline.calendarYears
    .slice(0, timeline.activeYears)
    .map((year, i) => [input.id, year, ...columns.map((series) => series[i])]);
  return `${Papa.unparse([[...SERIES_HEADER], ...rows], { newline: '\n' })}\n`;
}

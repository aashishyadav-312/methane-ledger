// The v2 inputs template: the v1 template (header, units row, the Moonidih record) plus the two optional columns,
// and one estimated mine filled in with its own estimate, so uploading the file unchanged changes nothing.
// `public/templates/v2/mine_inputs_template.csv` must match `inputsTemplateCsvV2()` byte for byte
// (tests/ui/v2/pages-data.test.ts checks it).
import Papa from 'papaparse';
import { estimateById } from '../../../data/estimation';
import { INPUT_COLUMNS, MINE_ID_COLUMN, UNITS_MARKER } from '../../../pages/DataPage/columns';
import { inputsTemplateCsv } from '../../../pages/DataPage/templates';
import { ADDED_COLUMNS, ESTIMATE_COLUMNS } from './columns';

/** The mine whose estimate fills the second template row: the cheapest estimated mine at the default settings. */
export const TEMPLATE_ESTIMATE_MINE_ID = 'bccl-amp-colliery';
export const INPUTS_TEMPLATE_FILE_V2 = 'mine_inputs_template.csv';
/** Folder of the v2 template under `public/templates/`. */
export const INPUTS_TEMPLATE_DIR_V2 = 'templates/v2';

/** Digits kept in the template, so a value reads as a person would write it. `upload.ts` compares to the same precision. */
export const TEMPLATE_SIGNIFICANT_DIGITS = 6;

function cell(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(Number(value.toPrecision(TEMPLATE_SIGNIFICANT_DIGITS)));
}

/** The v1 rows with the added columns appended, then the estimated example mine. */
export function inputsTemplateCsvV2(): string {
  const v1 = Papa.parse<string[]>(inputsTemplateCsv(), { skipEmptyLines: true }).data;
  const [header, units, ...records] = v1;
  const blankAdded = ADDED_COLUMNS.map(() => '');

  const estimate = estimateById(TEMPLATE_ESTIMATE_MINE_ID);
  if (estimate === undefined) throw new Error(`no estimate for "${TEMPLATE_ESTIMATE_MINE_ID}"`);
  const filled: Record<string, string> = {
    closure_year: cell(estimate.closureYear),
    production_mt_per_yr: cell(estimate.productionMtPerYr),
    degree: cell(estimate.degree),
    methane_mm3: cell(estimate.totalMm3),
  };
  const estimateRow = [
    TEMPLATE_ESTIMATE_MINE_ID,
    ...INPUT_COLUMNS.map((c) => (ESTIMATE_COLUMNS.some((e) => e.name === c.name) ? filled[c.name] : '')),
    ...ADDED_COLUMNS.map((c) => filled[c.name]),
  ];

  const rows = [
    [...header, ...ADDED_COLUMNS.map((c) => c.name)],
    [...units, ...ADDED_COLUMNS.map((c) => c.unit)],
    ...records.map((r) => [...r, ...blankAdded]),
    estimateRow,
  ];
  if (header[0] !== MINE_ID_COLUMN || units[0] !== UNITS_MARKER) throw new Error('the v1 template changed shape');
  return `${Papa.unparse(rows, { newline: '\n' })}\n`;
}

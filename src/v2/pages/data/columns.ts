// The v2 upload template adds two optional columns to the v1 inputs template. They set the estimate of a mine that
// has no record: `degree` is its gassiness grade, `methane_mm3` the total methane it liberates in a year.
// A mine without a record also takes `closure_year` and `production_mt_per_yr` from the v1 columns.
import type { EstimateField } from '../estimateOverrides';

export type EstimateCellKind = 'year' | 'number' | 'degree';

export interface EstimateColumn {
  /** Column name in the CSV header. */
  name: string;
  unit: string;
  kind: EstimateCellKind;
  /** The estimate field the value replaces. */
  field: EstimateField;
  /** True for the two columns v2 adds; false for the v1 columns an estimated mine also reads. */
  added: boolean;
}

export const DEGREE_COLUMN = 'degree';
export const METHANE_COLUMN = 'methane_mm3';

/** The two columns v2 appends to the v1 inputs template. */
export const ADDED_COLUMNS: readonly { name: string; unit: string }[] = [
  { name: DEGREE_COLUMN, unit: 'grade 1 to 3' },
  { name: METHANE_COLUMN, unit: 'Mm3 CH4 per year' },
];

/** Every column an estimated mine reads. Any other filled cell on its row is reported and ignored. */
export const ESTIMATE_COLUMNS: readonly EstimateColumn[] = [
  { name: 'closure_year', unit: 'year', kind: 'year', field: 'closureYear', added: false },
  { name: 'production_mt_per_yr', unit: 'Mt per year', kind: 'number', field: 'outputMtPerYr', added: false },
  { name: DEGREE_COLUMN, unit: 'grade 1 to 3', kind: 'degree', field: 'degree', added: true },
  { name: METHANE_COLUMN, unit: 'Mm3 CH4 per year', kind: 'number', field: 'totalMm3', added: true },
];

/** The last closure year an upload may give: the workbook's run-out horizon ("After 2225"). */
export const LAST_CLOSURE_YEAR = 2225;

// The columns of the two upload templates (SPEC_V1 "Upload template"). Each input column names the field of a mine
// record it replaces (`wrapper`), and the path of the same value in the plain `MineInput` (`inputPath`), which is
// also the tail of the session override key: `mine.<mine_id>.<inputPath>`.

export type CellKind = 'number' | 'year' | 'yesno';

export interface InputColumn {
  /** Column name in the CSV header. */
  name: string;
  /** Second header row. */
  unit: string;
  kind: CellKind;
  /** Where the `{ value, unit, source, quality }` wrapper sits in a mine record. */
  wrapper: readonly string[];
  /** Key inside `wrapper.value` for fields that hold an object (`destructionMandated`). */
  inner?: string;
  /** Dotted path of the value in `MineInput`. */
  inputPath: string;
}

const col = (
  name: string,
  unit: string,
  kind: CellKind,
  inputPath: string,
  wrapper: readonly string[] = inputPath.split('.'),
  inner?: string,
): InputColumn => (inner === undefined ? { name, unit, kind, wrapper, inputPath } : { name, unit, kind, wrapper, inner, inputPath });

const FRACTION = 'fraction';

export const MINE_ID_COLUMN = 'mine_id';
export const UNITS_MARKER = 'units';

export const INPUT_COLUMNS: readonly InputColumn[] = [
  col('closure_year', 'year', 'year', 'closureYear'),
  col('production_mt_per_yr', 'Mt per year', 'number', 'productionMtPerYr'),
  col('specific_emission_m3_per_t', 'm3 CH4 per t', 'number', 'specificEmissionM3PerT'),
  col('drained_mm3_per_yr', 'Mm3 CH4 per year', 'number', 'drainedMm3PerYr'),
  col('drained_share', FRACTION, 'number', 'drainedShare'),
  col('drained_conc', FRACTION, 'number', 'drainedConc'),
  col('vam_mm3_per_yr', 'Mm3 CH4 per year', 'number', 'vamMm3PerYr'),
  col('vam_conc', FRACTION, 'number', 'vamConc'),
  col('vam_airflow_m3s', 'm3 per s', 'number', 'vamAirflowM3s'),
  col('has_drainage_system', 'yes or no', 'yesno', 'hasDrainageSystem'),
  col('power_offtake', 'yes or no', 'yesno', 'powerOfftake'),
  col('capture_eff_drained', FRACTION, 'number', 'captureEff.drained'),
  col('capture_eff_vam', FRACTION, 'number', 'captureEff.vam'),
  col('capture_eff_amm', FRACTION, 'number', 'captureEff.amm'),
  col('destruction_mandated_drained', 'yes or no', 'yesno', 'destructionMandated.drained', ['destructionMandated'], 'drained'),
  col('destruction_mandated_vam', 'yes or no', 'yesno', 'destructionMandated.vam', ['destructionMandated'], 'vam'),
  col('destruction_mandated_amm', 'yes or no', 'yesno', 'destructionMandated.amm', ['destructionMandated'], 'amm'),
  col('amm_f_amm', 'fraction of last-year gas', 'number', 'amm.fAmm'),
  col('amm_decline_d', 'per year', 'number', 'amm.declineD'),
  col('amm_hyperbolic_b', 'dimensionless', 'number', 'amm.hyperbolicB'),
  col('amm_conc', FRACTION, 'number', 'amm.conc'),
  col('amm_q0_basis_mm3', 'Mm3 CH4 per year', 'number', 'amm.q0BasisMm3'),
  col('amm_flooding_year', 'year', 'year', 'amm.floodingYear'),
  col('amm_flooding_factor', 'multiplier', 'number', 'amm.floodingFactor'),
  col('amm_q0_mm3', 'Mm3 CH4 per year', 'number', 'amm.q0Mm3'),
  col('amm_years_since_closure', 'years', 'number', 'amm.yearsSinceClosure'),
];

export type SeriesField = 'productionMtPerYr' | 'drainedMm3PerYr' | 'vamMm3PerYr';

export interface SeriesColumn {
  name: string;
  unit: string;
  /** The mine record field (and `MineInput` field) the column fills. */
  field: SeriesField;
}

export const SERIES_YEAR_COLUMN = 'year';

export const SERIES_COLUMNS: readonly SeriesColumn[] = [
  { name: 'production_mt', unit: 'Mt per year', field: 'productionMtPerYr' },
  { name: 'drained_mm3', unit: 'Mm3 CH4 per year', field: 'drainedMm3PerYr' },
  { name: 'vam_mm3', unit: 'Mm3 CH4 per year', field: 'vamMm3PerYr' },
];

/** Header of `mine_series_template.csv`. */
export const SERIES_HEADER: readonly string[] = [MINE_ID_COLUMN, SERIES_YEAR_COLUMN, ...SERIES_COLUMNS.map((c) => c.name)];

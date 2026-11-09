// The annual table as CSV (Step 8): one row per crediting year, straight from `evaluate`'s year rows.
// Always US$ and tCO2e, whatever the page shows, so a spreadsheet gets the model's own units.
import { STREAM_KINDS, STREAM_LABELS } from '../../model/constants';
import { OPEX_TYPES } from '../../model/costs';
import type { OpexType, Result } from '../../model/types';
import { toCsv } from '../../lib/export';

/** Cents and hundredths of a tonne: enough for a spreadsheet, without float noise. */
const CSV_DECIMALS = 2;

function round(x: number): number {
  return Number(x.toFixed(CSV_DECIMALS));
}

/** Running-cost columns on the cost build-up (Appendix G opex types). */
const OPEX_COLUMNS: Record<OpexType, string> = {
  om: 'Operation and maintenance, without staff (USD)',
  overhaul: 'Engine overhauls (USD)',
  staff: 'Staff (USD)',
  insurance: 'Insurance (USD)',
  fan_power: 'Fan power (USD)',
  decommissioning: 'Decommissioning (USD)',
};

/** One row per crediting year. On the cost build-up the running cost is also split by type. */
export function annualCsv(result: Result): string {
  const opex = result.costs?.opexByType;
  const header = [
    'Year',
    ...STREAM_KINDS.map((k) => `${STREAM_LABELS[k]} credits (tCO2e)`),
    'Credit revenue (USD)',
    'Power revenue (USD)',
    'Running cost (USD)',
    ...(opex ? OPEX_TYPES.map((t) => OPEX_COLUMNS[t]) : []),
    'Monitoring and verification (USD)',
    'Cash (USD)',
    'Cumulative cash (USD)',
  ];
  const rows = result.years.map((y, i) => [
    y.year,
    ...STREAM_KINDS.map((k) => round(y.byStream[k].erTco2e)),
    round(y.creditRevUsd),
    round(y.energyRevUsd),
    round(y.opexUsd),
    ...(opex ? OPEX_TYPES.map((t) => round(opex[t][i] ?? 0)) : []),
    round(y.mrvUsd),
    round(y.cashUsd),
    round(y.cumCashUsd),
  ]);
  return toCsv(header, rows);
}

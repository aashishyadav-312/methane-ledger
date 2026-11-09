// The annual table as CSV (Step 8): one row per crediting year, straight from `evaluate`'s year rows.
// Always US$ and tCO2e, whatever the page shows, so a spreadsheet gets the model's own units.
import { STREAM_KINDS, STREAM_LABELS } from '../../model/constants';
import type { Result } from '../../model/types';
import { toCsv } from '../../lib/export';

/** Cents and hundredths of a tonne: enough for a spreadsheet, without float noise. */
const CSV_DECIMALS = 2;

function round(x: number): number {
  return Number(x.toFixed(CSV_DECIMALS));
}

export function annualCsv(result: Result): string {
  const header = [
    'Year',
    ...STREAM_KINDS.map((k) => `${STREAM_LABELS[k]} credits (tCO2e)`),
    'Credit revenue (USD)',
    'Power revenue (USD)',
    'Running cost (USD)',
    'Monitoring and verification (USD)',
    'Cash (USD)',
    'Cumulative cash (USD)',
  ];
  const rows = result.years.map((y) => [
    y.year,
    ...STREAM_KINDS.map((k) => round(y.byStream[k].erTco2e)),
    round(y.creditRevUsd),
    round(y.energyRevUsd),
    round(y.opexUsd),
    round(y.mrvUsd),
    round(y.cashUsd),
    round(y.cumCashUsd),
  ]);
  return toCsv(header, rows);
}

// Number handling for the "All assumptions" sheet: percentages are entered as %, everything else as stored.
import { inrCr, usdPerT } from '../../lib/format';
import type { RegistryEntry } from '../../data/registry';

const PERCENT = 100;
// Rounding for display only, so 0.035 * 100 shows as 3.5 and not 3.5000000000000004.
const SHOW_DECIMALS = 6;
const FACTOR_DECIMALS = 3;

export function clean(x: number): number {
  return Number(x.toFixed(SHOW_DECIMALS));
}

/** Stored value to the number shown in the input. */
export function toShown(entry: RegistryEntry, x: number): number {
  return entry.format === 'pct' ? clean(x * PERCENT) : clean(x);
}

/** Number typed in the input to the stored value. */
export function fromShown(entry: RegistryEntry, x: number): number {
  return entry.format === 'pct' ? clean(x / PERCENT) : x;
}

/** A value as text, for the faint default and for choices: `$1,300`, `15%`, `₹9,00,000`, `0.6`. */
export function formatValue(entry: RegistryEntry, v: number | boolean): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  switch (entry.format) {
    case 'usd':
      return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    case 'usdPerT':
      return usdPerT(v);
    case 'inr':
      return inrCr(v);
    case 'pct':
      return `${toShown(entry, v)}%`;
    case 'factor':
      return String(Number(v.toFixed(FACTOR_DECIMALS)));
    case 'int':
      return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'year':
      return String(v);
  }
}

/** The range as people read it: `from 0% to 50%`. */
export function rangeText(entry: RegistryEntry, range: { min: number; max: number }): string {
  return `from ${formatValue(entry, range.min)} to ${formatValue(entry, range.max)}`;
}

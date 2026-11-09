// Number formatting. Every figure on the site goes through here.
// Negatives use U+2212 (a true minus sign), and a value that rounds to zero never gets a sign.

export const MINUS = '−';
export const DASH = '–';

const THOUSAND = 1_000;
const MILLION = 1_000_000;
const CRORE = 10_000_000;

function digitsText(abs: number, digits: number, locale = 'en-US'): string {
  return abs.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// True when the text, as shown, is zero.
function isZeroText(text: string): boolean {
  return Number(text.replace(/[^0-9.]/g, '')) === 0;
}

function withSign(x: number, text: string, prefix = '', suffix = ''): string {
  const sign = x < 0 && !isZeroText(text) ? MINUS : '';
  return `${sign}${prefix}${text}${suffix}`;
}

/** Price in US dollars per tonne: `$8.33`, `−$4.30`. */
export function usdPerT(x: number): string {
  if (!Number.isFinite(x)) return DASH;
  return withSign(x, digitsText(Math.abs(x), 2), '$');
}

/** An amount in US dollars shown in millions: `$8.6M`, `−$4.3M`. */
export function usdM(x: number): string {
  if (!Number.isFinite(x)) return DASH;
  return withSign(x, digitsText(Math.abs(x) / MILLION, 1), '$', 'M');
}

/** A mass in tonnes: `820 t`, `385k t`, `1.82 Mt`. */
export function tonnes(x: number): string {
  if (!Number.isFinite(x)) return DASH;
  const abs = Math.abs(x);
  const thousands = Math.round(abs / THOUSAND);
  if (abs >= MILLION || thousands >= THOUSAND) {
    return withSign(x, digitsText(abs / MILLION, 2), '', ' Mt');
  }
  if (abs >= THOUSAND) {
    return withSign(x, digitsText(thousands, 0), '', 'k t');
  }
  return withSign(x, digitsText(abs, 0), '', ' t');
}

/** A fraction as a percentage: `pct(0.237, 1)` is `23.7%`. `null` (for example no IRR) is an en dash. */
export function pct(x: number | null, digits = 1): string {
  if (x === null || !Number.isFinite(x)) return DASH;
  return withSign(x, digitsText(Math.abs(x) * 100, digits), '', '%');
}

/**
 * A US dollar amount shown in rupees at `fx` rupees per dollar: `₹708`, `−₹1,25,000`, `₹7.31 crore`.
 * Rupees use Indian digit grouping, and amounts from one crore (10 million rupees) up are shown in crore.
 */
export function inr(usd: number, fx: number): string {
  if (!Number.isFinite(usd) || !Number.isFinite(fx)) return DASH;
  const rupees = Math.abs(usd * fx);
  if (Math.round(rupees) >= CRORE) {
    return withSign(usd * fx, digitsText(rupees / CRORE, 2), '₹', ' crore');
  }
  return withSign(usd * fx, digitsText(rupees, 0, 'en-IN'), '₹');
}

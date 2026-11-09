// The mine page keeps every control in the hash query, for example
// `#/mine/bccl-moonidih?p=15&cb=now&close=2034&vam=0.3&use=power&g=0&r=10&gwp=28&n=10`.
// Writes go through `history.replaceState` (no history entry, no `hashchange`) and are debounced.
// A copied link reproduces the view exactly.

import type { CostModel } from '../model/types';

export type DrainedUse = 'power' | 'flare';

/** Everything the mine page controls set. Fractions are stored as fractions; the URL shows percentages. */
export interface MineView {
  priceUsdPerT: number;
  /** `null` keeps the mine record's own drained gas (for example an archetype that derives it). */
  drainedMm3PerYr: number | null;
  /** `now` (current output), the id of one of the mine's closure alternatives, or `custom`. */
  closureBasis: string;
  /** The last year of mining used by the model. */
  closureYear: number;
  vamConc: number;
  drainedUse: DrainedUse;
  grantShare: number;
  discountRate: number;
  gwp: number;
  creditingYears: 10 | 15;
}

/** What a query is checked against. Values outside these lists or ranges fall back to the defaults. */
export interface MineViewContext {
  defaults: MineView;
  /** Closure year for each basis id other than `custom`, for example `{ now: 2034, target: 2030 }`. */
  basisYears: Record<string, number>;
  priceRangeUsdPerT: { min: number; max: number };
  drainedRangeMm3PerYr: { min: number; max: number };
  /** First year of the crediting window; a custom closure year is kept inside the window. */
  startYear: number;
  vamConcOptions: readonly number[];
  grantOptions: readonly number[];
  discountOptions: readonly number[];
  gwpOptions: readonly number[];
  creditingOptions: readonly (10 | 15)[];
}

export const CUSTOM_BASIS = 'custom';

/** Short query keys. */
export const KEYS = {
  price: 'p',
  drained: 'd',
  basis: 'cb',
  close: 'close',
  vam: 'vam',
  use: 'use',
  grant: 'g',
  discount: 'r',
  gwp: 'gwp',
  crediting: 'n',
} as const;

const PERCENT = 100;
// Rounding for the URL text only, so 0.1 * 100 is written as 10 and not 10.000000000000002.
const URL_DECIMALS = 6;

function clean(x: number): string {
  return String(Number(x.toFixed(URL_DECIMALS)));
}

function num(query: URLSearchParams, key: string): number | null {
  const text = query.get(key);
  if (text === null || text.trim() === '') return null;
  const x = Number(text);
  return Number.isFinite(x) ? x : null;
}

/** The option that matches `x` (to URL precision), or `null`. */
function pick<T extends number>(options: readonly T[], x: number | null): T | null {
  if (x === null) return null;
  return options.find((o) => clean(o) === clean(x)) ?? null;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** The custom closure years the slider offers: the crediting window. */
export function closureRange(startYear: number, creditingYears: number): { min: number; max: number } {
  return { min: startYear, max: startYear + creditingYears - 1 };
}

/** Read the view from a query. Missing or bad values take the defaults. */
export function decodeMineView(query: URLSearchParams, ctx: MineViewContext): MineView {
  const d = ctx.defaults;
  const price = num(query, KEYS.price);
  const drained = num(query, KEYS.drained);
  const vam = pick(ctx.vamConcOptions, mapPct(num(query, KEYS.vam)));
  const grant = pick(ctx.grantOptions, mapPct(num(query, KEYS.grant)));
  const discount = pick(ctx.discountOptions, mapPct(num(query, KEYS.discount)));
  const gwp = pick(ctx.gwpOptions, num(query, KEYS.gwp));
  const crediting = pick(ctx.creditingOptions, num(query, KEYS.crediting));
  const useText = query.get(KEYS.use);
  const creditingYears = crediting ?? d.creditingYears;

  const { basis, year } = decodeClosure(query, ctx, creditingYears);

  return {
    priceUsdPerT: price === null ? d.priceUsdPerT : clamp(price, ctx.priceRangeUsdPerT.min, ctx.priceRangeUsdPerT.max),
    drainedMm3PerYr:
      drained === null ? d.drainedMm3PerYr : clamp(drained, ctx.drainedRangeMm3PerYr.min, ctx.drainedRangeMm3PerYr.max),
    closureBasis: basis,
    closureYear: year,
    vamConc: vam ?? d.vamConc,
    drainedUse: useText === 'power' || useText === 'flare' ? useText : d.drainedUse,
    grantShare: grant ?? d.grantShare,
    discountRate: discount ?? d.discountRate,
    gwp: gwp ?? d.gwp,
    creditingYears,
  };
}

function mapPct(x: number | null): number | null {
  return x === null ? null : x / PERCENT;
}

function decodeClosure(
  query: URLSearchParams,
  ctx: MineViewContext,
  creditingYears: number,
): { basis: string; year: number } {
  const basisText = query.get(KEYS.basis);
  const close = num(query, KEYS.close);
  const range = closureRange(ctx.startYear, creditingYears);
  const custom = (y: number) => ({ basis: CUSTOM_BASIS, year: clamp(Math.round(y), range.min, range.max) });

  if (basisText !== null && basisText in ctx.basisYears) return { basis: basisText, year: ctx.basisYears[basisText] };
  if (basisText === CUSTOM_BASIS && close !== null) return custom(close);
  if (basisText === null && close !== null) {
    // A link with only a year: use the basis that gives that year, if there is one.
    const match = Object.entries(ctx.basisYears).find(([, y]) => y === close);
    return match ? { basis: match[0], year: match[1] } : custom(close);
  }
  return { basis: ctx.defaults.closureBasis, year: ctx.defaults.closureYear };
}

/** Write the view as a query. Every control is written, so the link does not depend on today's defaults. */
export function encodeMineView(view: MineView): URLSearchParams {
  const q = new URLSearchParams();
  q.set(KEYS.price, clean(view.priceUsdPerT));
  if (view.drainedMm3PerYr !== null) q.set(KEYS.drained, clean(view.drainedMm3PerYr));
  q.set(KEYS.basis, view.closureBasis);
  q.set(KEYS.close, String(view.closureYear));
  q.set(KEYS.vam, clean(view.vamConc * PERCENT));
  q.set(KEYS.use, view.drainedUse);
  q.set(KEYS.grant, clean(view.grantShare * PERCENT));
  q.set(KEYS.discount, clean(view.discountRate * PERCENT));
  q.set(KEYS.gwp, clean(view.gwp));
  q.set(KEYS.crediting, String(view.creditingYears));
  return q;
}

/** The query part of the current hash. */
export function currentQuery(): URLSearchParams {
  const hash = window.location.hash;
  const i = hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
}

/** The path part of the current hash, without `#` or the query. */
export function currentHashPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const i = hash.indexOf('?');
  return i >= 0 ? hash.slice(0, i) : hash;
}

export const URL_WRITE_DELAY_MS = 150;

export interface QueryWriter {
  /** Schedule a write; a later call within the delay replaces it. */
  write: (path: string, query: URLSearchParams) => void;
  /** Drop a scheduled write (on unmount, or when the user loads another link). */
  cancel: () => void;
  /** Write a scheduled change now. */
  flush: () => void;
}

/**
 * A debounced writer for the hash query. It writes with `history.replaceState`, and only while the hash still
 * shows `path`, so a late write can never pull the user back to a page they have left.
 */
export function createQueryWriter(delayMs = URL_WRITE_DELAY_MS): QueryWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  const flush = () => {
    const run = pending;
    cancel();
    run?.();
  };
  const write = (path: string, query: URLSearchParams) => {
    cancel();
    pending = () => {
      if (currentHashPath() !== path) return;
      const text = query.toString();
      const next = `#${path}${text ? `?${text}` : ''}`;
      if (window.location.hash !== next) window.history.replaceState(window.history.state, '', next);
    };
    timer = setTimeout(flush, delayMs);
  };
  return { write, cancel, flush };
}

/* ---------- "All assumptions" panel (Step 13b) ---------- */

export type PanelValue = number | boolean;
/** Registry path to value, holding only the values that differ from the defaults. */
export type PanelChanges = Readonly<Record<string, PanelValue>>;
export type CostBasis = CostModel;

/** What the "All assumptions" sheet sets beyond the short-key controls. */
export interface PanelState {
  costModel: CostBasis;
  changes: PanelChanges;
}

export const PANEL_KEYS = { costModel: 'cm', changes: 'x' } as const;

export interface PanelContext {
  /** The cost basis in `data/settings.default.json`. A link writes `cm=` only when the view uses the other one. */
  defaultCostModel: CostBasis;
  /** True when `value` is a valid value for `path` (a known registry path, the right type, in range). */
  accept: (path: string, value: unknown) => boolean;
}

function base64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(text: string): string | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** `x=`: base64url of a JSON object of path to value. Paths are sorted, so the same changes give the same link. */
export function encodeChanges(changes: PanelChanges): string {
  const sorted = Object.fromEntries(Object.entries(changes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return base64urlEncode(JSON.stringify(sorted));
}

/** Reads `x=`. Unknown paths and bad values are dropped; a broken value gives no changes. */
export function decodeChanges(text: string | null, accept: PanelContext['accept']): PanelChanges {
  if (text === null || text === '') return {};
  const json = base64urlDecode(text);
  if (json === null) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, PanelValue> = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (accept(path, value)) out[path] = value as PanelValue;
    }
    return out;
  } catch {
    return {};
  }
}

export function decodePanel(query: URLSearchParams, ctx: PanelContext): PanelState {
  const cm = query.get(PANEL_KEYS.costModel);
  return {
    costModel: cm === 'v1' || cm === 'buildup' ? cm : ctx.defaultCostModel,
    changes: decodeChanges(query.get(PANEL_KEYS.changes), ctx.accept),
  };
}

/** Adds `cm=` (only when it differs from the default) and `x=` (only when something changed) to `query`. */
export function encodePanel(panel: PanelState, defaultCostModel: CostBasis, query: URLSearchParams): URLSearchParams {
  if (panel.costModel !== defaultCostModel) query.set(PANEL_KEYS.costModel, panel.costModel);
  if (Object.keys(panel.changes).length > 0) query.set(PANEL_KEYS.changes, encodeChanges(panel.changes));
  return query;
}

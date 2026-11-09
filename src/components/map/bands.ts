import type { BandKey, MapMine } from '../../data/schemas';
import type { SwatchToken } from '../../ui';

/** Closure bands, labels and colour tokens (PLAN_V1 Appendix A). The legend lists them in this order. */
export const LEGEND_ORDER: readonly BandKey[] = ['by2031', 'by2036', 'by2050', 'after2050', 'nodate', 'closed'];

export const BAND_LABEL: Record<BandKey, string> = {
  by2031: 'By 2031',
  by2036: '2032 to 2036',
  by2050: '2037 to 2050',
  after2050: 'After 2050',
  nodate: 'No date',
  closed: 'Already closed',
};

export const BAND_TOKEN: Record<BandKey, SwatchToken> = {
  by2031: 'band-2031',
  by2036: 'band-2036',
  by2050: 'band-2050',
  after2050: 'band-after',
  nodate: 'band-nodate',
  closed: 'band-closed',
};

/** Map draw order, back to front (DESIGN.md › Map). The start mine is drawn last, on its own. */
export const DRAW_ORDER: readonly BandKey[] = ['closed', 'nodate', 'after2050', 'by2050', 'by2036', 'by2031'];

/** Mine type codes in `mines_map.json`, in words. */
const TYPE_LABEL: Record<string, string> = {
  UG: 'underground',
  OC: 'opencast',
  Mixed: 'opencast and underground',
};

export function typeLabel(code: string): string {
  return TYPE_LABEL[code] ?? code;
}

/** Coal India subsidiaries, spelled out for `<abbr>` titles and the phone start card. */
const SUBSIDIARY_NAME: Record<string, string> = {
  BCCL: 'Bharat Coking Coal',
  CCL: 'Central Coalfields',
  ECL: 'Eastern Coalfields',
  MCL: 'Mahanadi Coalfields',
  NCL: 'Northern Coalfields',
  NEC: 'North Eastern Coalfields',
  SECL: 'South Eastern Coalfields',
  WCL: 'Western Coalfields',
};

export function subsidiaryName(code: string): string {
  return SUBSIDIARY_NAME[code] ?? code;
}

/** Status lines worth showing beside the run-out year (Appendix A). "Producing" needs no note. */
export function statusNote(mine: Pick<MapMine, 'status'>): string | null {
  return mine.status === 'Producing' ? null : mine.status;
}

/** CSS custom property for a band colour, for inline `color` or `background`. */
export function bandVar(band: BandKey): string {
  return `var(--${BAND_TOKEN[band]})`;
}

import { BAND_KEYS, type BandKey, type MapMine } from '../../data/schemas';

export type OperatingBand = (typeof BAND_KEYS)[number];
export type SortKey = 'name' | 'runout';
export type SortDir = 'asc' | 'desc';

/**
 * Run-out order: dated mines by year, then "After 2225" (no year, band after 2050), then "No date".
 * "No date" stays last in both directions, as it has no year to sort by.
 */
function runoutRank(m: MapMine): number {
  if (m.runoutYear !== null) return 0;
  return m.band === 'nodate' ? 2 : 1;
}

export function sortMines(mines: readonly MapMine[], key: SortKey, dir: SortDir): MapMine[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: MapMine, b: MapMine) => a.name.localeCompare(b.name, 'en');
  return [...mines].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b) || a.id.localeCompare(b.id);
    const ra = runoutRank(a);
    const rb = runoutRank(b);
    if (ra === 2 || rb === 2) return ra - rb || byName(a, b);
    const byYear = ra !== rb ? ra - rb : (a.runoutYear ?? 0) - (b.runoutYear ?? 0);
    return sign * byYear || byName(a, b);
  });
}

/** Mines in the chosen bands. No band chosen means every band. */
export function filterMines(mines: readonly MapMine[], bands: ReadonlySet<BandKey>): MapMine[] {
  return bands.size === 0 ? [...mines] : mines.filter((m) => bands.has(m.band));
}

export const OPERATING_BANDS: readonly OperatingBand[] = BAND_KEYS;

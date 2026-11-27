// Facts about the v2 mine list that the About pages state in words. Counts are read from the data, never typed.
import minesV2Json from '../../generated/v2/mines_v2.json';
import { listMinesV2 } from '../map/data';

const NAMES = (minesV2Json as { coalfieldNames?: Record<string, string> }).coalfieldNames ?? {};

/** "South Karanpura" for `s_karanpura`; the key itself, spaced, when the name is not in the data. */
export function coalfieldDisplayName(key: string): string {
  return NAMES[key] ?? key.replace(/_/g, ' ');
}

export interface PositionCounts {
  /** Mines placed at GEM coordinates. */
  gem: number;
  /** Mines placed by coalfield. */
  coalfield: number;
  total: number;
}

export function positionCounts(): PositionCounts {
  const mines = listMinesV2();
  const gem = mines.filter((m) => m.positionQuality === 'gem').length;
  return { gem, coalfield: mines.length - gem, total: mines.length };
}

/**
 * The Global Energy Monitor line the data build recorded, with its release and licence (for example
 * "Global Energy Monitor, Global Coal Mine Tracker, August 2026 release, CC BY 4.0 (...)").
 */
export function gemSource(): string {
  const sources = (minesV2Json as { sources?: string[] }).sources ?? [];
  return sources.find((s) => s.startsWith('Global Energy Monitor')) ?? 'Global Energy Monitor, Global Coal Mine Tracker.';
}

// Emitter strength (PLAN_V2 Appendix D): s = log10(1 + methane) / max over mines of log10(1 + methane),
// with a floor for opencast and Degree I mines (and mines with no methane figure), and a fixed value for closed mines.
import type { MineId } from '../contracts';
import { SMOG_STRENGTH_CLOSED, SMOG_STRENGTH_FLOOR } from '../motion/tokens';

export interface SmogEmitter {
  id: MineId;
  /** Position in map units (the map's viewBox space). */
  x: number;
  y: number;
  /** 0 to 1. */
  strength: number;
}

export interface EmitterSource {
  id: MineId;
  x: number;
  y: number;
  /** Methane in Mm³ a year (the mine's estimate or record). Null when unknown. */
  methaneMm3PerYr: number | null;
  /** Opencast or Degree I: gets the floor whatever its methane. */
  floor?: boolean;
  /** Closed mine: faint wisps of abandoned mine methane. */
  closed?: boolean;
}

const logMethane = (m: number | null) => (m !== null && Number.isFinite(m) && m > 0 ? Math.log10(1 + m) : 0);

/** Turns mines into emitters with Appendix D strengths. */
export function emittersFromSources(sources: readonly EmitterSource[]): SmogEmitter[] {
  let maxLog = 0;
  for (const s of sources) if (!s.closed && !s.floor) maxLog = Math.max(maxLog, logMethane(s.methaneMm3PerYr));
  return sources.map((s) => {
    let strength: number;
    if (s.closed) strength = SMOG_STRENGTH_CLOSED;
    else if (s.floor || maxLog === 0) strength = SMOG_STRENGTH_FLOOR;
    else strength = Math.max(SMOG_STRENGTH_FLOOR, logMethane(s.methaneMm3PerYr) / maxLog);
    return { id: s.id, x: s.x, y: s.y, strength };
  });
}

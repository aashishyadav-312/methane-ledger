import type { MineInput, Settings } from './types';

export interface Timeline {
  /** Crediting period N. */
  years: number;
  /** Calendar year of each model year t = 1..N. */
  calendarYears: number[];
  /** Years of the window in which the mine still produces (closes at the end of `closureYear`). */
  activeYears: number;
  /** Years of the window after closure. */
  postYears: number;
  /** True when the closure year is not inside the crediting window. */
  closureOutsideWindow: boolean;
}

/** activeYears = clamp(closureYear - startYear + 1, 0, N); postYears = N - activeYears (Appendix B1). */
export function buildTimeline(mine: Pick<MineInput, 'closureYear'>, settings: Settings): Timeline {
  const years = settings.creditingYears;
  const raw = mine.closureYear - settings.startYear + 1;
  const activeYears = Math.min(Math.max(raw, 0), years);
  return {
    years,
    calendarYears: Array.from({ length: years }, (_, i) => settings.startYear + i),
    activeYears,
    postYears: years - activeYears,
    closureOutsideWindow: raw < 1 || raw > years,
  };
}

/**
 * A per-year series over the window: a number is held flat over the active years, an array is read by year
 * index (missing entries are 0). Every year after closure is 0.
 */
export function activeSeries(value: number | number[] | undefined, timeline: Timeline): number[] {
  return Array.from({ length: timeline.years }, (_, i) => {
    if (i >= timeline.activeYears || value === undefined) return 0;
    return typeof value === 'number' ? value : (value[i] ?? 0);
  });
}

/** Production P_t in Mt a year. */
export function productionMtByYear(mine: MineInput, timeline: Timeline): number[] {
  return activeSeries(mine.productionMtPerYr, timeline);
}

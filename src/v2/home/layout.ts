/*
 * The home's layout numbers, each with its source. Timings and easings come from `src/v2/motion/tokens.ts`.
 */
import { PHONE_MAX_W_PX } from '../motion/tokens';

/** PLAN_V2 Step 6: the phone layout applies below 768px (`PHONE_MAX_W_PX`). */
export const HOME_PHONE_QUERY = `(max-width: ${PHONE_MAX_W_PX - 0.02}px)`;

/**
 * V2-Home: the header is 72px and the headline column is 440px wide at 48px from the left, with 32px of air
 * before the map. The fitted India view keeps clear of both.
 */
export const HOME_INSETS_DESKTOP = { top: 72, left: 48 + 440 + 32, right: 0, bottom: 0 } as const;
/** V2-Phone: the map starts under the headline and the search box, 150px from the top. */
export const HOME_INSETS_PHONE = { top: 150, left: 0, right: 0, bottom: 0 } as const;

/** PLAN_V2 Step 6 item 4: input changes after the first run recompute live, debounced 150 ms. */
export const RECOMPUTE_DEBOUNCE_MS = 150;

/** The panel's width, from the DESIGN_V2 token `--panel-w` (460px), read where the panel is laid out. */
export function panelWidthPx(el: Element = document.documentElement): number {
  const w = parseFloat(getComputedStyle(el).getPropertyValue('--panel-w'));
  return Number.isFinite(w) ? w : 0;
}

/** Appendix E: docking progress p = clamp((scrollY − (resultsTop − viewportH)) / viewportH, 0, 1). */
export function dockProgressAt(scrollY: number, resultsTop: number, viewportH: number): number {
  if (!(viewportH > 0)) return 0;
  const p = (scrollY - (resultsTop - viewportH)) / viewportH;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

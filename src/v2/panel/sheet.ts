/*
 * The phone bottom sheet (PLAN_V2 Step 6, V2-Phone): snap points, velocity projection and rubber-banding, without
 * React. Timings come from `src/v2/motion/tokens.ts`; the numbers here are the sheet's own geometry and physics.
 */

export type SheetSnap = 'peek' | 'half' | 'full';
export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

/** PLAN_V2 Step 6: the peek shows 180px of the sheet (name, the result and the main button). */
export const SHEET_PEEK_PX = 180;
/** Half: this share of the stage's height. */
export const SHEET_HALF_SHARE = 0.5;
/** Full: the sheet stops this far below the top of the stage, under the 60px phone header (V2-Phone). */
export const SHEET_FULL_TOP_PX = 64;
/**
 * apple-design "momentum": UIScrollView's normal deceleration rate. A release at velocity v (px/ms) is projected
 * to travel v × rate / (1 − rate).
 */
export const SHEET_DECELERATION_RATE = 0.998;
/** apple-design "rubber-banding": UIScrollView's constant; past an edge the sheet moves less and less. */
export const SHEET_RUBBER_BAND = 0.55;
/** Pointer travel before a press on the sheet's head counts as a drag (the 4px base grid of DESIGN.md). */
export const SHEET_DRAG_SLOP_PX = 4;
/** Velocity is measured over the pointer samples of the last this many ms. */
export const SHEET_VELOCITY_WINDOW_MS = 100;

/** The visible height of the sheet at each snap point, for a stage of `stageH` px. */
export function snapHeights(stageH: number): Record<SheetSnap, number> {
  const full = Math.max(SHEET_PEEK_PX, stageH - SHEET_FULL_TOP_PX);
  const half = Math.min(full, Math.max(SHEET_PEEK_PX, Math.round(stageH * SHEET_HALF_SHARE)));
  return { peek: Math.min(SHEET_PEEK_PX, full), half, full };
}

/** Distance a release at `velocityPxPerMs` carries on for (apple-design `project`). */
export function project(velocityPxPerMs: number, rate = SHEET_DECELERATION_RATE): number {
  return (velocityPxPerMs * rate) / (1 - rate);
}

/** Rubber band: an overshoot of `offset` px past an edge shows as less, never more than `dimension`. */
export function rubberBand(offset: number, dimension: number, c = SHEET_RUBBER_BAND): number {
  if (dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * (1 - 1 / ((x * c) / dimension + 1)) * dimension;
}

/** The visible height while dragging, rubber-banded past the peek and full snap points. */
export function dragHeight(raw: number, heights: Record<SheetSnap, number>): number {
  if (raw > heights.full) return heights.full + rubberBand(raw - heights.full, heights.full);
  if (raw < heights.peek) return heights.peek - rubberBand(heights.peek - raw, heights.peek);
  return raw;
}

/** The snap point nearest to where a release at this height and velocity (px/ms, up is positive) would come to rest. */
export function snapFor(heightPx: number, velocityUpPxPerMs: number, heights: Record<SheetSnap, number>): SheetSnap {
  const target = heightPx + project(velocityUpPxPerMs);
  let best: SheetSnap = 'peek';
  for (const s of SHEET_SNAPS) if (Math.abs(heights[s] - target) < Math.abs(heights[best] - target)) best = s;
  return best;
}

/** The next snap point for the grabber button: peek, half, full, then back to peek. */
export function nextSnap(s: SheetSnap): SheetSnap {
  return SHEET_SNAPS[(SHEET_SNAPS.indexOf(s) + 1) % SHEET_SNAPS.length];
}

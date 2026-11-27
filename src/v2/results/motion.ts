// The dashboard's motion (DESIGN_V2 "Motion", chart rows): each chart draws once when 40% of it is on screen, its
// numbers count up once, and a re-run morphs values in place. Every timing is a token from src/v2/motion/tokens.ts.
//
// Animation state is a clock, not a CSS transition: a chart is drawn from "milliseconds since it was revealed", so
// a frozen clock (`?freeze=<s>`) renders exactly that frame, and reduced motion is simply "the end".
import { useCallback, useEffect, useState } from 'react';
import {
  CHART_BAR_GROW_MS,
  CHART_BAR_STAGGER_MAX,
  CHART_BAR_STAGGER_MS,
  CHART_LINE_DRAW_MS,
  CHART_MORPH_MS,
  CHART_REVEAL_THRESHOLD,
  COUNT_UP_MS,
  clamp01,
  easeOut,
  lerp,
  useFrozenClock,
  useReducedMotion,
} from '../motion';

const MS_PER_S = 1000;

/** The reveal is over when the slowest part (a line, the last staggered bar, or a count-up) has finished. */
export const REVEAL_DONE_MS = Math.max(
  CHART_LINE_DRAW_MS,
  CHART_BAR_GROW_MS + CHART_BAR_STAGGER_MS * (CHART_BAR_STAGGER_MAX - 1),
  COUNT_UP_MS,
);

/** Elapsed time that means "fully drawn". */
export const REVEALED = Number.POSITIVE_INFINITY;

/** IntersectionObserver steps, so tall charts (more than 2.5 screens) still reveal once 40% of the screen is chart. */
const OBSERVER_STEPS = 10;
const THRESHOLDS = Array.from({ length: OBSERVER_STEPS + 1 }, (_, i) => i / OBSERVER_STEPS);

function enoughInView(e: IntersectionObserverEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= CHART_REVEAL_THRESHOLD) return true;
  const viewH = e.rootBounds?.height ?? 0;
  return viewH > 0 && e.intersectionRect.height >= CHART_REVEAL_THRESHOLD * viewH;
}

/**
 * Milliseconds since the element first came 40% into view: 0 before that, `REVEALED` once the reveal is over, under
 * reduced motion, or where there is no IntersectionObserver. With `?freeze=<s>` every chart is treated as revealed
 * at t = 0, so the frame at s seconds is the same for every chart wherever it sits on the page.
 */
export function useRevealClock<T extends Element>(): [(el: T | null) => void, number] {
  const reduced = useReducedMotion();
  const frozenS = useFrozenClock();
  const [el, setEl] = useState<T | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(false);
  const canObserve = typeof IntersectionObserver !== 'undefined';
  const live = !reduced && frozenS === null && canObserve;

  useEffect(() => {
    if (el === null || startedAt !== null || !live) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some(enoughInView)) return;
        io.disconnect();
        const t = performance.now();
        setNow(t);
        setStartedAt(t);
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, startedAt, live]);

  useEffect(() => {
    if (startedAt === null || done || !live) return;
    let raf = 0;
    const tick = (t: number) => {
      if (t - startedAt >= REVEAL_DONE_MS) {
        setDone(true);
        return;
      }
      setNow(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, done, live]);

  const ref = useCallback((node: T | null) => setEl(node), []);
  if (frozenS !== null) return [ref, frozenS * MS_PER_S];
  if (!live || done) return [ref, REVEALED];
  if (startedAt === null) return [ref, 0];
  return [ref, Math.max(0, now - startedAt)];
}

/** How far a line has drawn (stroke-dashoffset), 0 to 1. */
export function lineProgress(elapsedMs: number): number {
  return easeOut(clamp01(elapsedMs / CHART_LINE_DRAW_MS));
}

/** How far bar `index` has grown from its baseline, 0 to 1. Only the first ten bars are staggered. */
export function barProgress(elapsedMs: number, index: number): number {
  const delay = Math.min(index, CHART_BAR_STAGGER_MAX - 1) * CHART_BAR_STAGGER_MS;
  return easeOut(clamp01((elapsedMs - delay) / CHART_BAR_GROW_MS));
}

/** How far a number has counted up from 0, 0 to 1. */
export function countProgress(elapsedMs: number): number {
  return easeOut(clamp01(elapsedMs / COUNT_UP_MS));
}

/* ---------- morph on re-run ---------- */

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

interface Tween {
  from: readonly number[];
  to: readonly number[];
  /** rAF time the tween started; null until its first frame. */
  start: number | null;
}

function at(tw: Tween, now: number): readonly number[] {
  if (tw.start === null || tw.from.length !== tw.to.length) return tw.start === null ? tw.from : tw.to;
  const k = easeOut(clamp01((now - tw.start) / CHART_MORPH_MS));
  if (k >= 1) return tw.to;
  // NaN marks a gap (no value); a gap appearing or closing jumps rather than morphing.
  return tw.to.map((v, i) => (Number.isNaN(v) || Number.isNaN(tw.from[i]) ? v : lerp(tw.from[i], v, k)));
}

/**
 * Values that morph to `target` over CHART_MORPH_MS whenever it changes, starting from what is on screen now (so a
 * second re-run mid-morph carries on from there). Jumps when the length changes, under reduced motion and with a
 * frozen clock. Use NaN for "no value".
 */
export function useMorph(target: readonly number[]): readonly number[] {
  const reduced = useReducedMotion();
  const frozen = useFrozenClock() !== null;
  const animate = !reduced && !frozen;
  const [tween, setTween] = useState<Tween>({ from: target, to: target, start: null });
  const [now, setNow] = useState(0);

  // A new target: start from the values on screen. Setting state while rendering is React's pattern for
  // "adjust state when a prop changes"; it re-renders before the browser paints.
  if (!sameValues(tween.to, target)) {
    const shown = at(tween, now);
    setTween({ from: animate && shown.length === target.length ? shown : target, to: target, start: null });
  }

  const running = animate && !sameValues(tween.from, tween.to);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) {
        start = t;
        setTween((tw) => ({ ...tw, start: t }));
      }
      setNow(t);
      if (t - start >= CHART_MORPH_MS) {
        setTween((tw) => ({ from: tw.to, to: tw.to, start: null }));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, tween.from, tween.to]);

  if (!animate) return target;
  return at(tween, now);
}

/** `useMorph` for one value. */
export function useMorphValue(target: number): number {
  return useMorph([target])[0];
}

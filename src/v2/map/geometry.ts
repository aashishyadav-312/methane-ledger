/*
 * Pure map maths: fitting, pan limits, fly-to paths, label picking and scroll docking. No React, no DOM, so the e2e
 * spec can test it in Node as well.
 *
 * A transform {k, x, y} maps map units (the 0..906 × 0..1016 viewBox) to pixels inside the map container:
 * screen = (x + k · mapX, y + k · mapY). This is the `MapTransform` that `MapApi.getTransform()` and `onTransform()`
 * report. The zoom level of DESIGN_V2 (1 to 24, labels at 4, fly-to at 6) is k divided by the fitted k.
 */
import { interpolateZoom, type ZoomInterpolator, type ZoomView } from 'd3-interpolate';

// d3-interpolate puts `rho` on the zoom interpolator factory; @types/d3-interpolate puts it on the interpolator.
type ZoomFactory = ((a: ZoomView, b: ZoomView) => ZoomInterpolator) & { rho(r: number): ZoomFactory };
const zoomWithRho = (rho: number) => (interpolateZoom as unknown as ZoomFactory).rho(rho);
import type { MapTransform } from '../contracts';
import { DOCK, FLY, LABELS, PAN_MARGIN_FRACTION } from './motion';

export type ViewBox = readonly [number, number, number, number];
export interface Size {
  width: number;
  height: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export type Extent = [[number, number], [number, number]];

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The transform that fits the whole viewBox inside the container, less the insets, centred. */
export function fitTransform(viewBox: ViewBox, size: Size, insets: Insets = NO_INSETS): MapTransform {
  const [vx, vy, vw, vh] = viewBox;
  const aw = Math.max(1, size.width - insets.left - insets.right);
  const ah = Math.max(1, size.height - insets.top - insets.bottom);
  const k = Math.min(aw / vw, ah / vh);
  return {
    k,
    x: insets.left + (aw - vw * k) / 2 - vx * k,
    y: insets.top + (ah - vh * k) / 2 - vy * k,
  };
}

/** India plus the pan margin, in map units: d3-zoom's translate extent. */
export function panExtent(viewBox: ViewBox, margin = PAN_MARGIN_FRACTION): Extent {
  const [vx, vy, vw, vh] = viewBox;
  return [
    [vx - vw * margin, vy - vh * margin],
    [vx + vw * (1 + margin), vy + vh * (1 + margin)],
  ];
}

function constrainAxis(t: number, k: number, v0: number, v1: number, e0: number, e1: number): number {
  const s0 = t + e0 * k;
  const s1 = t + e1 * k;
  if (s1 - s0 <= v1 - v0) {
    // The extent is smaller than the viewport: it may sit anywhere inside it (so an inset fit view stays put).
    if (s0 < v0) return v0 - s0;
    if (s1 > v1) return v1 - s1;
    return 0;
  }
  // Larger than the viewport: the viewport stays inside the extent.
  if (s0 > v0) return v0 - s0;
  if (s1 < v1) return v1 - s1;
  return 0;
}

/**
 * Pan limits. d3's default constrain centres the map whenever it is smaller than the viewport, which would undo a
 * fit that leaves room for the headline; this one only keeps India plus its margin on screen.
 */
export function constrainTransform(t: MapTransform, viewport: Extent, extent: Extent): MapTransform {
  const dx = constrainAxis(t.x, t.k, viewport[0][0], viewport[1][0], extent[0][0], extent[1][0]);
  const dy = constrainAxis(t.y, t.k, viewport[0][1], viewport[1][1], extent[0][1], extent[1][1]);
  return dx || dy ? { k: t.k, x: t.x + dx, y: t.y + dy } : t;
}

export function toScreen(t: MapTransform, x: number, y: number): { x: number; y: number } {
  return { x: t.x + t.k * x, y: t.y + t.k * y };
}

/**
 * Appendix F: the screen point a flown-to mine lands on. The centre of the map area left of the panel (offsetRight)
 * and above a phone sheet's peek (offsetBottom), below the header (insets.top).
 */
export function flyAnchor(size: Size, top: number, offsetRight = 0, offsetBottom = 0): [number, number] {
  const w = Math.max(1, size.width - offsetRight);
  const h = Math.max(1, size.height - top - offsetBottom);
  return [w / 2, top + h / 2];
}

/** The transform that puts map point (px, py) at the anchor at scale k. */
export function centredAt(px: number, py: number, k: number, anchor: [number, number]): MapTransform {
  return { k, x: anchor[0] - px * k, y: anchor[1] - py * k };
}

export interface FlyPath {
  durationMs: number;
  /** The transform at path parameter u in 0..1 (van Wijk's own pacing: callers step u linearly in time). */
  at(u: number): MapTransform;
}

/**
 * Appendix F: van Wijk and Nuij's smooth zoom (`d3.interpolateZoom`, rho 1.2) between two transforms, about a fixed
 * screen anchor. Views are [mapX at the anchor, mapY at the anchor, map width of the container].
 */
export function flyPath(from: MapTransform, to: MapTransform, anchor: [number, number], width: number): FlyPath {
  const view = (t: MapTransform): [number, number, number] => [
    (anchor[0] - t.x) / t.k,
    (anchor[1] - t.y) / t.k,
    width / t.k,
  ];
  const interp = zoomWithRho(FLY.rho)(view(from), view(to));
  const durationMs = clamp(interp.duration * FLY.durationFactor, FLY.minMs, FLY.maxMs);
  return {
    durationMs,
    at(u: number) {
      if (u >= 1) return to;
      const [ux, uy, w] = interp(clamp(u, 0, 1));
      const k = width / w;
      return { k, x: anchor[0] - ux * k, y: anchor[1] - uy * k };
    },
  };
}

/** Dots are drawn at r / sqrt(zoom) in map units, so on screen they grow only as sqrt(zoom). */
export function dotScale(zoom: number): number {
  return 1 / Math.sqrt(Math.max(zoom, 1e-6));
}

export interface LabelCandidate {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Larger first: coal output in Mt a year. */
  size: number;
}

export interface PlacedLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  selected: boolean;
  /** Distance from the dot's centre to the text, in px. */
  gapPx: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * DESIGN_V2 "Map" labels: the selected mine always, then up to 12 of the largest mines in view at zoom ≥ 4, placed
 * greedily (largest first) to the right of the dot or else to its left, skipping any that would overlap.
 */
export function pickLabels(opts: {
  candidates: readonly LabelCandidate[];
  selected: LabelCandidate | null;
  transform: MapTransform;
  zoom: number;
  viewport: Size;
  dotRadiusPx: (id: string) => number;
  measure: (text: string, selected: boolean) => number;
}): PlacedLabel[] {
  const { candidates, selected, transform, zoom, viewport, dotRadiusPx, measure } = opts;
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [];

  const tryPlace = (c: LabelCandidate, isSelected: boolean, force: boolean) => {
    const p = toScreen(transform, c.x, c.y);
    const fontPx = isSelected ? LABELS.selectedFontPx : LABELS.fontPx;
    const w = measure(c.name, isSelected);
    const r = dotRadiusPx(c.id);
    const gap = r + LABELS.gapPx;
    const half = (fontPx * LABELS.lineHeightEm) / 2;
    const right: Box = { x0: p.x + gap, y0: p.y - half, x1: p.x + gap + w, y1: p.y + half };
    const left: Box = { x0: p.x - gap - w, y0: p.y - half, x1: p.x - gap, y1: p.y + half };
    const inside = (b: Box) => b.x0 >= 0 && b.x1 <= viewport.width && b.y0 >= 0 && b.y1 <= viewport.height;
    const free = (b: Box) => inside(b) && !boxes.some((o) => overlaps(o, b));
    let box: Box | null = null;
    let anchor: 'start' | 'end' = 'start';
    if (free(right)) box = right;
    else if (free(left)) {
      box = left;
      anchor = 'end';
    } else if (force) {
      // The selected mine is always labelled: on the side that stays on screen.
      const useLeft = right.x1 > viewport.width;
      box = useLeft ? left : right;
      anchor = useLeft ? 'end' : 'start';
    }
    if (!box) return;
    boxes.push(box);
    // A labelled dot is an obstacle too, so no later label covers it.
    if (!isSelected) boxes.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });
    placed.push({ id: c.id, name: c.name, x: c.x, y: c.y, anchor, selected: isSelected, gapPx: gap });
  };

  if (selected) {
    // The selected mine's ring is an obstacle for every other label.
    const p = toScreen(transform, selected.x, selected.y);
    const r = dotRadiusPx(selected.id);
    boxes.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });
    tryPlace(selected, true, true);
  }
  if (zoom < LABELS.minZoom) return placed;

  const inView = candidates.filter((c) => {
    if (selected && c.id === selected.id) return false;
    const p = toScreen(transform, c.x, c.y);
    return p.x >= 0 && p.x <= viewport.width && p.y >= 0 && p.y <= viewport.height;
  });
  inView.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  for (const c of inView.slice(0, LABELS.count)) tryPlace(c, false, false);
  return placed;
}

/** A CSS cubic-bezier(x1, y1, x2, y2) easing as a function of progress, solved by Newton then bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sy = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sx(s) - t;
      if (Math.abs(err) < 1e-6) return sy(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      const v = sx(s);
      if (Math.abs(v - t) < 1e-6) break;
      if (v < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sy(s);
  };
}

const dockEase = cubicBezier(...DOCK.ease);

export interface DockRest {
  /** The map wrapper's untransformed box, in viewport pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DockFrame {
  scale: number;
  tx: number;
  ty: number;
  /** Radius of the inner clip, in the wrapper's own (unscaled) pixels, so that it shows as radiusPx on screen. */
  clipRadius: number;
  /** Opacity of the card's border and shadow. */
  chrome: number;
  /** The eased progress. */
  eased: number;
}

/** True when the phone dock sizes apply. */
export const isPhoneWidth = (viewportWidth: number) => viewportWidth < DOCK.phoneMaxWidthPx;

/**
 * Appendix E: the map wrapper at docking progress p, with `transform-origin: top right`. The wrapper scales from 1
 * to miniW / mapW and its top-right corner travels from its rest position to (viewportW − inset.right, inset.top).
 */
export function dockFrame(p: number, rest: DockRest, viewportWidth: number): DockFrame {
  const phone = isPhoneWidth(viewportWidth);
  const miniW = phone ? DOCK.phoneMiniWidthPx : DOCK.miniWidthPx;
  const inset = phone ? DOCK.insetPhone : DOCK.insetDesktop;
  const e = dockEase(clamp(p, 0, 1));
  const scale = lerp(1, miniW / Math.max(1, rest.width), e);
  const restRight = rest.left + rest.width;
  return {
    scale,
    tx: lerp(0, viewportWidth - inset.right - restRight, e),
    ty: lerp(0, inset.top - rest.top, e),
    clipRadius: (DOCK.radiusPx * e) / scale,
    chrome: clamp((p - DOCK.shadowFrom) / (1 - DOCK.shadowFrom), 0, 1),
    eased: e,
  };
}

/** The final mini-card scale, for sizing the card's border and shadow once. */
export function dockedScale(restWidth: number, viewportWidth: number): number {
  const miniW = isPhoneWidth(viewportWidth) ? DOCK.phoneMiniWidthPx : DOCK.miniWidthPx;
  return miniW / Math.max(1, restWidth);
}

/** Appendix E hysteresis: docked from p ≥ 0.98, back in flow below 0.95. */
export function nextDocked(wasDocked: boolean, p: number): boolean {
  return wasDocked ? p >= DOCK.undockBelow : p >= DOCK.dockAt;
}

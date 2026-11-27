// Map units to CSS pixels inside the smog slot. The map is an <svg viewBox> (preserveAspectRatio xMidYMid meet)
// whose zoom group carries the d3-zoom transform {k, x, y} in viewBox user units, so
// screen = offset + fit × (k × p + (x, y) − viewBoxMin).
import type { MapTransform } from '../contracts';

export type ViewBox = readonly [number, number, number, number];

export interface Projection {
  /** CSS px per map unit at the current zoom (fit × k). */
  scalePx: number;
  /** CSS px per map unit at k = 1 (fit alone). */
  basePx: number;
  /** Screen position of map point (0, 0), CSS px. */
  originX: number;
  originY: number;
}

export function fitViewBox(viewBox: ViewBox, widthPx: number, heightPx: number) {
  const [minX, minY, w, h] = viewBox;
  const fit = w > 0 && h > 0 ? Math.min(widthPx / w, heightPx / h) : 1;
  return { fit, offsetX: (widthPx - w * fit) / 2 - minX * fit, offsetY: (heightPx - h * fit) / 2 - minY * fit };
}

export function projectionFor(viewBox: ViewBox, widthPx: number, heightPx: number, t: MapTransform): Projection {
  const { fit, offsetX, offsetY } = fitViewBox(viewBox, widthPx, heightPx);
  return { scalePx: fit * t.k, basePx: fit, originX: offsetX + fit * t.x, originY: offsetY + fit * t.y };
}

export const IDENTITY_TRANSFORM: MapTransform = { k: 1, x: 0, y: 0 };

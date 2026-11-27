// Map units to CSS pixels inside the smog slot.
//
// The transform is the map's own (`MapApi.getTransform()` / `onTransform`, from <MineMapV2>): an absolute d3-zoom
// transform in CSS px of the map surface, so screen = (x, y) + k × p, and k already includes the fit of India to the
// container. Without a map (null) the smog assumes India fitted and centred in the slot.
import type { MapTransform } from '../contracts';

export type ViewBox = readonly [number, number, number, number];

export interface Projection {
  /** CSS px per map unit at the current zoom. */
  scalePx: number;
  /** CSS px per map unit with India fitted to the slot (zoom 1); particle sizes and noise sampling use it. */
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

/** The map transform that fits the viewBox into the slot, centred: what the smog uses when there is no map. */
export function fitTransformFor(viewBox: ViewBox, widthPx: number, heightPx: number): MapTransform {
  const { fit, offsetX, offsetY } = fitViewBox(viewBox, widthPx, heightPx);
  return { k: fit, x: offsetX, y: offsetY };
}

export function projectionFor(
  viewBox: ViewBox,
  widthPx: number,
  heightPx: number,
  t: MapTransform | null,
): Projection {
  const { fit } = fitViewBox(viewBox, widthPx, heightPx);
  const m = t ?? fitTransformFor(viewBox, widthPx, heightPx);
  return { scalePx: m.k, basePx: fit, originX: m.x, originY: m.y };
}

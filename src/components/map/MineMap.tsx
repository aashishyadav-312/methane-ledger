import { useMemo, useRef, type PointerEvent } from 'react';
import type { MapData, MapMine } from '../../data/schemas';
import { hoverPoints, nearestPoint } from './geometry';
import { hoverStore } from './hoverStore';
import { MapSvg } from './MapSvg';
import { MapTooltip } from './MapTooltip';
import { StartPin } from './StartPin';

export interface MineMapProps {
  data: MapData;
  startMine: MapMine;
  lensLabel: string;
  ariaLabel: string;
}

/** How close the pointer must come to a dot to show its tooltip, in CSS pixels. */
const HIT_PX = 9;

export const MAP_FRAME_ID = 'mine-map';

/**
 * The map frame: the SVG (drawn once), the start pin and the tooltip. Pointer events are handled here and find the
 * nearest dot, so small dots are easy to hit and the SVG needs no per-dot listeners.
 */
export function MineMap({ data, startMine, lensLabel, ariaLabel }: MineMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const points = useMemo(() => hoverPoints(data), [data]);
  const [vx, vy, vw, vh] = data.viewBox;

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    if (!frame) return;
    if ((e.target as Element).closest('.start-pin')) {
      hoverStore.set(null);
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    const unitsPerPx = vw / rect.width;
    const x = vx + (e.clientX - rect.left) * unitsPerPx;
    const y = vy + (e.clientY - rect.top) * (vh / rect.height);
    const hit = nearestPoint(points, x, y, HIT_PX * unitsPerPx);
    hoverStore.set(hit ? { key: hit.key, target: hit.target, x: hit.x, y: hit.y, source: 'pointer' } : null);
  }

  function onLeave(e: PointerEvent<HTMLDivElement>) {
    // A touch pointer "leaves" as the finger lifts; keep the tooltip it opened until the next tap.
    if (e.pointerType === 'touch') return;
    if (hoverStore.get()?.source === 'pointer') hoverStore.set(null);
  }

  return (
    <div
      ref={frameRef}
      id={MAP_FRAME_ID}
      className="map-frame"
      style={{ aspectRatio: `${vw} / ${vh}` }}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={onLeave}
    >
      <MapSvg data={data} startMine={startMine} lensLabel={lensLabel} ariaLabel={ariaLabel} />
      <StartPin data={data} mine={startMine} />
      <MapTooltip data={data} startId={startMine.id} />
    </div>
  );
}

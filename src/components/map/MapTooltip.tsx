import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { MapData } from '../../data/schemas';
import { BAND_LABEL, bandVar, statusNote, typeLabel } from './bands';
import { hoverStore, type HoverState } from './hoverStore';

/** Gap between the dot and the tooltip, in CSS pixels. */
const GAP_PX = 12;

function TooltipBody({ hover, startId }: { hover: HoverState; startId: string }) {
  const { target } = hover;
  if (target.kind === 'closed') {
    const m = target.mine;
    return (
      <>
        <span className="map-tip-name">{m.name}</span>
        <span className="map-tip-meta">{m.company}</span>
        <span className="map-tip-row">
          <span className="map-tip-swatch" style={{ background: bandVar('closed') }} aria-hidden="true" />
          {BAND_LABEL.closed}
        </span>
      </>
    );
  }
  const m = target.mine;
  const note = statusNote(m);
  return (
    <>
      <span className="map-tip-name">{m.name}</span>
      <span className="map-tip-meta">
        {m.company} · {typeLabel(m.type)}
      </span>
      <span className="map-tip-row">
        <span
          className={m.band === 'nodate' ? 'map-tip-swatch map-tip-swatch-hollow' : 'map-tip-swatch'}
          style={m.band === 'nodate' ? undefined : { background: bandVar(m.band) }}
          aria-hidden="true"
        />
        {m.runoutYear === null ? (
          m.runoutLabel
        ) : (
          <>
            Run-out year <span className="num">{m.runoutLabel}</span>
          </>
        )}
      </span>
      {note ? <span className="map-tip-note">{note}</span> : null}
      <span className="map-tip-foot">
        {m.id === startId || m.modelled
          ? 'Model built: open it from the Start here pin'
          : 'Model not built for this mine yet'}
      </span>
    </>
  );
}

/**
 * The hover tooltip and the ring around the hovered dot. Only this component re-renders on hover; it is placed
 * with `transform`, measured against the map frame it sits in.
 */
export function MapTooltip({ data, startId }: { data: Pick<MapData, 'viewBox'>; startId: string }) {
  const hover = useSyncExternalStore(hoverStore.subscribe, hoverStore.get, hoverStore.get);
  const tipRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const [vx, vy, vw, vh] = data.viewBox;

  useLayoutEffect(() => {
    const tip = tipRef.current;
    const ring = ringRef.current;
    const frame = tip?.parentElement;
    if (!hover || !tip || !ring || !frame) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const px = ((hover.x - vx) / vw) * fw;
    const py = ((hover.y - vy) / vh) * fh;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = px + GAP_PX;
    if (left + w > fw) left = Math.max(0, px - GAP_PX - w);
    let top = py - GAP_PX - h;
    if (top < 0) top = Math.min(fh - h, py + GAP_PX);
    tip.style.transform = `translate(${left}px, ${top}px)`;
    ring.style.transform = `translate(${px}px, ${py}px)`;
  }, [hover, vx, vy, vw, vh]);

  // Escape dismisses the tooltip (WCAG 1.4.13), and so does a tap or click outside the map.
  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hoverStore.set(null);
    };
    const onDown = (e: globalThis.PointerEvent) => {
      const frame = tipRef.current?.parentElement;
      if (frame && !frame.contains(e.target as Node)) hoverStore.set(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [hover]);

  if (!hover) return null;
  return (
    <>
      <span ref={ringRef} className="map-hover-ring" aria-hidden="true" />
      <div ref={tipRef} className="map-tip" role="tooltip" id="map-tooltip">
        <TooltipBody hover={hover} startId={startId} />
      </div>
    </>
  );
}

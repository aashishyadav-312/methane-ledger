import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { BAND_LABEL, bandVar, typeLabel } from '../../components/map/bands';
import type { MineV2 } from '../contracts';
import type { ClosedMineV2 } from './data';
import { TOOLTIP_GAP_PX } from './motion';

export type HoverTarget = { kind: 'mine'; mine: MineV2 } | { kind: 'closed'; mine: ClosedMineV2 };

export interface HoverState {
  target: HoverTarget;
  /** Screen point of the dot inside the map container. */
  x: number;
  y: number;
}

/** A tiny external store: only the tooltip re-renders on hover. */
export function createHoverStore() {
  let state: HoverState | null = null;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(next: HoverState | null) {
      if (next === state) return;
      state = next;
      for (const s of subs) s();
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
export type HoverStore = ReturnType<typeof createHoverStore>;

function Body({ target }: { target: HoverTarget }) {
  if (target.kind === 'closed') {
    const m = target.mine;
    return (
      <>
        <span className="mmv2-tip-name">{m.name}</span>
        <span className="mmv2-tip-meta">{m.company}</span>
        <span className="mmv2-tip-row">
          <span className="mmv2-tip-swatch" style={{ background: bandVar('closed') }} aria-hidden="true" />
          {BAND_LABEL.closed}
        </span>
      </>
    );
  }
  const m = target.mine;
  const hollow = m.band === 'nodate';
  return (
    <>
      <span className="mmv2-tip-name">{m.name}</span>
      <span className="mmv2-tip-meta">
        {m.company}, {typeLabel(m.type)}
      </span>
      <span className="mmv2-tip-row">
        <span
          className={hollow ? 'mmv2-tip-swatch is-hollow' : 'mmv2-tip-swatch'}
          style={hollow ? undefined : { background: bandVar(m.band) }}
          aria-hidden="true"
        />
        {m.runoutYear === null ? (
          m.runoutLabel
        ) : (
          <>
            Runs out <span className="num">{m.runoutLabel}</span>
          </>
        )}
      </span>
      {m.positionQuality === 'coalfield' ? <span className="mmv2-tip-note">Approximate position</span> : null}
    </>
  );
}

/**
 * The hover tooltip. It fades in over 125 ms the first time, then moves between dots with no delay or fade while it
 * stays open (DESIGN_V2 "Motion", hover). Placed with `transform`, origin at the dot.
 */
export function MapTooltipV2({ store }: { store: HoverStore }) {
  const hover = useSyncExternalStore(store.subscribe, store.get, store.get);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    const frame = tip?.parentElement;
    if (!hover || !tip || !frame) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = hover.x + TOOLTIP_GAP_PX;
    let originX = 'left';
    if (left + w > fw) {
      left = Math.max(0, hover.x - TOOLTIP_GAP_PX - w);
      originX = 'right';
    }
    let top = hover.y - TOOLTIP_GAP_PX - h;
    let originY = 'bottom';
    if (top < 0) {
      top = Math.min(fh - h, hover.y + TOOLTIP_GAP_PX);
      originY = 'top';
    }
    tip.style.transform = `translate(${left}px, ${top}px)`;
    tip.style.transformOrigin = `${originY} ${originX}`;
  }, [hover]);

  if (!hover) return null;
  return (
    <div ref={ref} className="mmv2-tip" role="tooltip">
      <Body target={hover.target} />
    </div>
  );
}

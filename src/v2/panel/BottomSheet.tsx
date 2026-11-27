import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { EASE_DRAWER_BEZIER, PANEL_SLIDE_MS } from '../motion/tokens';
import {
  dragHeight,
  nextSnap,
  SHEET_DRAG_SLOP_PX,
  SHEET_VELOCITY_WINDOW_MS,
  snapFor,
  snapHeights,
  type SheetSnap,
} from './sheet';

export interface BottomSheetProps {
  /** Height of the stage the sheet sits in, px. */
  stageHeight: number;
  /** False while the sheet slides out before it unmounts. */
  open: boolean;
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  /** No travel: the sheet jumps between snap points. */
  still: boolean;
  /** Start at the snap point instead of sliding in (a mine opened from a link: only the map animates on load). */
  instant?: boolean;
  labelledBy: string;
  /** The panel content; it receives the grabber to place above its heading. */
  children: (handle: ReactNode) => ReactNode;
}

interface Drag {
  pointerId: number;
  startY: number;
  startH: number;
  dragging: boolean;
  samples: { t: number; h: number }[];
}

/**
 * The phone bottom sheet (V2-Phone): three snap points, peek, half and full. Drag the head with velocity
 * projection and rubber-banding (apple-design). Every move starts from the on-screen height, so a drag catches a
 * sheet that is still settling.
 */
export function BottomSheet({
  stageHeight,
  open,
  snap,
  onSnap,
  still,
  instant = false,
  labelledBy,
  children,
}: BottomSheetProps) {
  const heights = snapHeights(stageHeight);
  const target = open ? heights[snap] : 0;
  const h = useMotionValue(still || instant ? target : 0);
  const y = useTransform(h, (v) => heights.full - v);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<Drag | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const settle = (to: number) => {
    anim.current?.stop();
    if (still) {
      h.jump(to);
      return;
    }
    anim.current = animate(h, to, { duration: PANEL_SLIDE_MS / 1000, ease: [...EASE_DRAWER_BEZIER] });
  };

  useEffect(() => {
    if (drag.current?.dragging) return;
    anim.current?.stop();
    if (still) h.jump(target);
    else anim.current = animate(h, target, { duration: PANEL_SLIDE_MS / 1000, ease: [...EASE_DRAWER_BEZIER] });
  }, [target, still, h]);

  useEffect(() => () => anim.current?.stop(), []);

  // The body scrolls inside what is visible at the current snap point.
  useEffect(() => {
    sheetRef.current?.style.setProperty('--v2-sheet-visible', `${heights[snap]}px`);
  }, [heights, snap]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !open) return;
    if ((e.target as HTMLElement).closest('.v2-panel-body')) return;
    anim.current?.stop();
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startH: h.get(), dragging: false, samples: [] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = d.startY - e.clientY;
    if (!d.dragging) {
      if (Math.abs(dy) < SHEET_DRAG_SLOP_PX) return;
      d.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const next = dragHeight(d.startH + dy, heights);
    h.set(next);
    d.samples.push({ t: e.timeStamp, h: next });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > SHEET_VELOCITY_WINDOW_MS) d.samples.shift();
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.dragging) {
      settle(target);
      return;
    }
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = last && first ? last.t - first.t : 0;
    const v = dt > 0 ? (last.h - first.h) / dt : 0;
    const s = snapFor(h.get(), e.type === 'pointercancel' ? 0 : v, heights);
    if (s === snap) settle(heights[s]);
    else onSnap(s);
  };

  const expanded = snap === 'full';
  const handle = (
    <button
      type="button"
      className="v2-sheet-grabber"
      aria-label={expanded ? 'Show less of the panel' : 'Show more of the panel'}
      onClick={() => onSnap(nextSnap(snap))}
    >
      <span aria-hidden="true" />
    </button>
  );

  return (
    <motion.div
      ref={sheetRef}
      className="v2-sheet"
      role="region"
      aria-labelledby={labelledBy}
      data-snap={snap}
      style={{ y, height: heights.full }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {children(handle)}
    </motion.div>
  );
}

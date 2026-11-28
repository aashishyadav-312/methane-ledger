// Mounts the smog canvas into the map's smogSlot and keeps it in step with the map, the mode, the tab and motion
// settings. All animation lives in the engine; this component only wires it to the page.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { createPortal } from 'react-dom';
import type { MapApi, SmogApi, SmogMode } from '../contracts';
import {
  PHONE_MAX_W_PX,
  SMOG_BUDGET_DESKTOP,
  SMOG_BUDGET_PHONE,
  SMOG_DEFAULT_SEED,
  SMOG_STILL_T_S,
  useFrozenClock,
  useReducedMotion,
} from '../motion/tokens';
import { createSmogEngine, type SmogEngine, type SmogStats } from './engine';
import type { ViewBox } from './projection';
import type { SmogEmitter } from './strength';

export interface SmogLayerHandle extends SmogApi {
  stats(): SmogStats | null;
}

export interface SmogLayerProps {
  emitters: readonly SmogEmitter[];
  /** The map's viewBox, in map units. */
  viewBox: ViewBox;
  mode: SmogMode;
  /**
   * The map (<MineMapV2>'s `MapApi`), for its transform in CSS px of the map surface. Without it the smog assumes
   * India fitted and centred in the slot.
   */
  map?: Pick<MapApi, 'getTransform' | 'onTransform'> | null;
  /** The map's smogSlot element. Without it the canvas renders in place (fills its positioned parent). */
  slot?: HTMLElement | null;
  seed?: number;
  /**
   * CSS scale applied to the map from outside (the docked card). If absent it is measured from the canvas's
   * on-screen size while docked.
   */
  displayScale?: number;
  ref?: Ref<SmogLayerHandle>;
}

const canvasStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  mixBlendMode: 'multiply',
  zIndex: 'var(--z-smog, 1)',
} as const;

const modeKeyOf = (m: SmogMode) => (m.kind === 'overview' ? 'overview' : `${m.kind}:${m.id}`);

function budgetForViewport(): number {
  const w = typeof window === 'undefined' ? Infinity : window.innerWidth;
  return w < PHONE_MAX_W_PX ? SMOG_BUDGET_PHONE : SMOG_BUDGET_DESKTOP;
}

/** `?perf=1` (in the query or inside the hash route): the engine's per-frame cost goes to `window.__smogFrameMs`. */
function perfProbe(): ((ms: number) => void) | undefined {
  if (typeof window === 'undefined') return undefined;
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '';
  const on = (q: string) => new URLSearchParams(q).get('perf') === '1';
  if (!on(location.search) && !on(hashQuery)) return undefined;
  const w = window as Window & { __smogFrameMs?: number[] };
  const frames: number[] = (w.__smogFrameMs = []);
  return (ms) => {
    frames.push(ms);
  };
}

export function SmogLayer({ emitters, viewBox, mode, map, slot, seed, displayScale, ref }: SmogLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SmogEngine | null>(null);
  const reduced = useReducedMotion();
  const frozenS = useFrozenClock();
  // Still frame instead of motion: reduced motion renders t = 8 s; ?freeze=s renders t = s.
  const stillS = frozenS ?? (reduced ? SMOG_STILL_T_S : null);
  // Compared by value, so a new array with the same numbers rebuilds nothing.
  const vbKey = viewBox.join(',');
  const modeKey = modeKeyOf(mode);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  });

  // One engine per canvas (the slot remounts it), viewBox and seed. Then the wiring: size, transform,
  // visibility, emitters, and the run-or-still decision.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createSmogEngine({
      canvas,
      emitters,
      viewBox: vbKey.split(',').map(Number) as unknown as ViewBox,
      seed: seed ?? SMOG_DEFAULT_SEED,
      budget: budgetForViewport(),
      onFrameMs: perfProbe(),
    });
    engineRef.current = engine;

    let visible = document.visibilityState !== 'hidden';
    let onScreen = true;
    const measure = () => {
      const parent = canvas.parentElement;
      const box = parent?.getBoundingClientRect();
      engine.setViewport({
        widthPx: parent?.clientWidth || box?.width || 0,
        heightPx: parent?.clientHeight || box?.height || 0,
        dpr: window.devicePixelRatio || 1,
      });
      engine.setBudget(budgetForViewport());
    };
    const sync = () => {
      if (stillS === null && visible && onScreen) engine.start();
      else engine.stop();
    };

    measure();
    engine.setTransform(map?.getTransform() ?? null);
    engine.setMode(modeRef.current);
    if (stillS !== null) engine.renderStill(stillS);
    sync();

    const unTransform = map?.onTransform((t) => {
      engine.setTransform(t);
      // The live loop picks the transform up on its next frame; a still redraws now.
      if (stillS !== null) engine.draw();
    });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      let first = true;
      ro = new ResizeObserver(() => {
        if (first) {
          first = false;
          return;
        }
        measure();
        // Resizing clears the canvas: a still is simulated again for the new size, a live view redraws next frame.
        if (stillS !== null) engine.renderStill(stillS);
      });
      ro.observe(canvas.parentElement);
    }

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      });
      io.observe(canvas);
    }

    const onVisibility = () => {
      visible = document.visibilityState !== 'hidden';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unTransform?.();
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      engine.destroy();
      engineRef.current = null;
    };
  }, [emitters, map, stillS, seed, vbKey, slot]);

  // Mode changes ease inside the engine; a still re-renders at once.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || modeKeyOf(engine.getMode()) === modeKey) return;
    engine.setMode(modeRef.current);
    if (stillS !== null) engine.renderStill(stillS);
  }, [modeKey, stillS]);

  // Docked particles keep their spec size on the scaled-down card.
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const measured = () => (canvas.offsetWidth > 0 ? canvas.getBoundingClientRect().width / canvas.offsetWidth : 1);
    if (displayScale !== undefined) {
      engine.setDisplayScale(displayScale);
    } else if (mode.kind !== 'docked') {
      engine.setDisplayScale(1);
    } else if (stillS !== null) {
      engine.setDisplayScale(measured());
      engine.draw();
    } else {
      // The card's scale follows scroll; read it each frame while docked and live.
      let handle = 0;
      const tick = () => {
        engine.setDisplayScale(measured());
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(handle);
    }
  }, [mode.kind, displayScale, stillS, emitters, map, seed, vbKey, slot]);

  useImperativeHandle(
    ref,
    () => ({
      setMode: (m) => engineRef.current?.setMode(m),
      setClock: (now) => engineRef.current?.setClock(now),
      renderStill: (t) => {
        engineRef.current?.stop();
        engineRef.current?.renderStill(t);
      },
      destroy: () => engineRef.current?.destroy(),
      stats: () => engineRef.current?.stats() ?? null,
    }),
    [],
  );

  const canvas = <canvas ref={canvasRef} className="v2-smog" aria-hidden="true" style={canvasStyle} data-smog="" />;
  return slot ? createPortal(canvas, slot) : canvas;
}

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { MapApi, MapTransform, MineId } from '../contracts';
import { MapController, type WheelMode } from './controller';
import { loadMapV2, type MapDataV2 } from './data';
import { Dock } from './dock';
import { NO_INSETS, pickLabels, toScreen, type Insets, type LabelCandidate, type PlacedLabel } from './geometry';
import { BaseLayer, CitiesLayer, DotsLayer, dotRadius, LabelsLayer, SelectedLayer } from './layers';
import { createHoverStore, MapTooltipV2, type HoverTarget } from './MapTooltipV2';
import {
  DOT_SIZES,
  EASE_OUT,
  HIT_PX,
  HOVER,
  KEY_PAN_FRACTION,
  LABELS,
  PRESS,
  readFreezeSeconds,
  SELECT,
  ZOOM_STEP_FACTOR,
} from './motion';
import './map.css';

/** What the map's ref exposes: the `MapApi` contract plus a few extras for the zoom buttons and the smog layer. */
export interface MineMapHandle extends MapApi {
  /** Fly back to all of India (the "Show all of India" button). */
  showAll(): Promise<void>;
  /** Zoom relative to the fitted India view, 1 to 24 (DESIGN_V2's k). */
  getZoomLevel(): number;
  /** The fitted India view as a `MapTransform`. */
  getFitTransform(): MapTransform;
  /** The positioned div the smog canvas mounts into (Step 4). */
  getSmogSlot(): HTMLDivElement | null;
}

/** A motion value, or anything with the same two methods (so this file does not depend on motion's types). */
export interface ProgressSource {
  get(): number;
  on(event: 'change', cb: (v: number) => void): () => void;
}

export interface MineMapV2Props {
  ref?: Ref<MineMapHandle>;
  /** Defaults to the adapter's data (`loadMapV2()`). */
  data?: MapDataV2;
  selectedId?: MineId | null;
  /** A click or tap on an operating mine. */
  onSelect?: (id: MineId) => void;
  /** Room the fitted India view leaves for the header and floating UI, in px. `top` is also the header height. */
  insets?: Partial<Insets>;
  /** "modifier": the wheel scrolls the page unless Ctrl or ⌘ is held (pinch still zooms). */
  wheel?: WheelMode;
  /** Appendix E docking progress, 0 to 1. A motion value is applied without re-rendering. */
  dockProgress?: number | ProgressSource;
  /** The docked card is a link back to the map. Defaults to scrolling to the top. */
  onDockClick?: () => void;
  /** Frozen clock for tests (`?freeze=<s>`). Defaults to the URL's value. */
  freezeSeconds?: number | null;
  /** Overrides `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  /** Rendered inside the smog slot, between the land and the dots. */
  smog?: ReactNode;
  /** Floating controls (zoom buttons, legend): over the map, not zoomed, faded out while docking. */
  children?: ReactNode;
  label?: string;
  className?: string;
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(cb: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => typeof matchMedia === 'function' && matchMedia(REDUCED_QUERY).matches;

/** `prefers-reduced-motion`, live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

/** Label width in px, measured with the label's own font (an estimate when no canvas is available). */
function measureLabel(text: string, selected: boolean): number {
  const key = `${selected ? 's' : 'n'}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const fontPx = selected ? LABELS.selectedFontPx : LABELS.fontPx;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  let w: number;
  if (measureCtx) {
    measureCtx.font = selected
      ? `italic 500 ${fontPx}px Newsreader, Georgia, serif`
      : `500 ${fontPx}px "Instrument Sans", system-ui, sans-serif`;
    w = measureCtx.measureText(text).width;
  } else {
    w = text.length * fontPx * LABELS.avgCharEm;
  }
  widthCache.set(key, w);
  return w;
}

/** Timings and sizes for map.css, from motion.ts. */
const CSS_VARS = {
  '--mmv2-hover-ms': `${HOVER.ms}ms`,
  '--mmv2-hover-scale': String(HOVER.scale),
  '--mmv2-tip-ms': `${HOVER.tooltipFadeMs}ms`,
  '--mmv2-dim': String(SELECT.dimOpacity),
  '--mmv2-dim-ms': `${SELECT.fadeMs}ms`,
  '--mmv2-ease-out': `cubic-bezier(${EASE_OUT.join(', ')})`,
  '--mmv2-press-ms': `${PRESS.ms}ms`,
  '--mmv2-press-scale': String(PRESS.scale),
  '--mmv2-label-px': `${LABELS.fontPx}px`,
  '--mmv2-sel-label-px': `${LABELS.selectedFontPx}px`,
  '--mmv2-halo-em': `${LABELS.haloEm}em`,
} as CSSProperties;

const resolveInsets =(i: Partial<Insets> | undefined): Insets => ({ ...NO_INSETS, ...i });

/**
 * The v2 zoomable map (PLAN_V2 Step 3). Land, coal states and the ink boundary; a smog slot; then the dots, city
 * markers and labels. Zoom and pan with d3-zoom; `ref` exposes `MapApi`.
 */
export function MineMapV2({
  ref,
  data: dataProp,
  selectedId = null,
  onSelect,
  insets: insetsProp,
  wheel = 'zoom',
  dockProgress = 0,
  onDockClick,
  freezeSeconds,
  reducedMotion: reducedProp,
  smog,
  children,
  label = 'Map of India with Coal India mines coloured by when their coal runs out',
  className,
}: MineMapV2Props) {
  const data = useMemo(() => dataProp ?? loadMapV2(), [dataProp]);
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedProp ?? prefersReduced;
  const freeze = useMemo(() => (freezeSeconds === undefined ? readFreezeSeconds() : freezeSeconds), [freezeSeconds]);
  const insets = resolveInsets(insetsProp);
  const insetsKey = `${insets.top},${insets.right},${insets.bottom},${insets.left}`;

  const anchorRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const baseGRef = useRef<SVGGElement>(null);
  const overGRef = useRef<SVGGElement>(null);
  const dotsGRef = useRef<SVGGElement>(null);
  const smogRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MapController | null>(null);
  const dockCtl = useRef<Dock | null>(null);
  const hover = useMemo(() => createHoverStore(), []);
  const [labels, setLabels] = useState<readonly PlacedLabel[]>([]);
  const [docked, setDocked] = useState(false);
  const descId = useId();

  const selected = selectedId ? (data.byId.get(selectedId) ?? null) : null;

  const candidates = useMemo<LabelCandidate[]>(
    () => data.mines.map((m) => ({ id: m.id, name: m.name, x: m.x, y: m.y, size: data.outputMt.get(m.id) ?? 0 })),
    [data],
  );

  // Latest values for the imperative callbacks.
  const live = useRef({ selected, candidates, onSelect, onDockClick });
  useLayoutEffect(() => {
    live.current = { selected, candidates, onSelect, onDockClick };
  });

  const relabel = useCallback(() => {
    const ctl = ctrlRef.current;
    if (!ctl) return;
    const t = ctl.get();
    const zoom = ctl.zoomLevel();
    const k = t.k;
    const sel = live.current.selected;
    const scale = 1 / Math.sqrt(zoom);
    const next = pickLabels({
      candidates: live.current.candidates,
      selected: sel ? { id: sel.id, name: sel.name, x: sel.x, y: sel.y, size: 0 } : null,
      transform: t,
      zoom,
      viewport: ctl.getSize(),
      // The selected label clears the ring; the others clear their dot.
      dotRadiusPx: (id) => {
        const m = data.byId.get(id);
        const r = sel && sel.id === id ? DOT_SIZES.operating * DOT_SIZES.ringRatio : m ? dotRadius(m) : DOT_SIZES.operating;
        return r * scale * k;
      },
      measure: measureLabel,
    });
    setLabels((prev) =>
      prev.length === next.length &&
      prev.every((p, i) => p.id === next[i].id && p.anchor === next[i].anchor && p.gapPx === next[i].gapPx)
        ? prev
        : next,
    );
  }, [data]);

  // The zoom engine: created once per data set.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const baseG = baseGRef.current;
    const overG = overGRef.current;
    const dotsG = dotsGRef.current;
    if (!surface || !baseG || !overG || !dotsG) return;
    const ctl = new MapController({
      surface,
      layers: [baseG, overG],
      overlay: overG,
      dots: dotsG,
      textLayers: [...overG.querySelectorAll<SVGGElement>('.mmv2-cities, .mmv2-labels')],
      viewBox: data.viewBox,
      onSettle: relabel,
    });
    ctrlRef.current = ctl;
    const unsubscribe = ctl.onTransform(() => {
      // Keep an open tooltip on its dot while the map moves.
      const h = hover.get();
      if (!h) return;
      const p = toScreen(ctl.get(), h.target.mine.x, h.target.mine.y);
      hover.set({ ...h, x: p.x, y: p.y });
    });
    return () => {
      unsubscribe();
      ctl.destroy();
      ctrlRef.current = null;
    };
  }, [data, hover, relabel]);

  useLayoutEffect(() => {
    const ctl = ctrlRef.current;
    if (!ctl) return;
    ctl.setReducedMotion(reduced);
    ctl.freezeSeconds = freeze;
    ctl.setWheelMode(wheel);
  }, [reduced, freeze, wheel, data]);

  // Size and insets.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const ctl = ctrlRef.current;
    if (!surface || !ctl) return;
    const [top, right, bottom, left] = insetsKey.split(',').map(Number);
    const apply = () => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      if (width > 0 && height > 0) ctl.layout({ width, height }, { top, right, bottom, left });
      dockCtl.current?.refresh();
    };
    apply();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(apply);
    ro.observe(surface);
    return () => ro.disconnect();
  }, [insetsKey, data]);

  // A new selection re-labels at once.
  useEffect(() => {
    relabel();
  }, [selectedId, relabel]);

  // Docking.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const dock = dockRef.current;
    const clip = clipRef.current;
    const chrome = chromeRef.current;
    if (!anchor || !dock || !clip || !chrome) return;
    const d = new Dock(
      { anchor, dock, clip, chrome, controls: controlsRef.current },
      {
        onActive: (active) => {
          ctrlRef.current?.setEnabled(!active);
          anchor.classList.toggle('is-docking', active);
          if (active) hover.set(null);
        },
        onDocked: setDocked,
      },
    );
    dockCtl.current = d;
    return () => {
      dockCtl.current = null;
    };
  }, [hover]);

  useLayoutEffect(() => {
    const d = dockCtl.current;
    if (!d) return;
    d.reducedMotion = reduced;
    if (typeof dockProgress === 'number') {
      d.set(dockProgress, true);
      return;
    }
    d.set(dockProgress.get(), true);
    return dockProgress.on('change', (v) => d.set(v));
  }, [dockProgress, reduced]);

  useImperativeHandle(
    ref,
    (): MineMapHandle => ({
      flyTo(id, opts) {
        const ctl = ctrlRef.current;
        const m = data.byId.get(id);
        if (!ctl || !m) return Promise.resolve();
        return ctl.flyToPoint(m.x, m.y, opts?.offsetRight ?? 0, opts?.offsetBottom ?? 0);
      },
      reset: () => ctrlRef.current?.reset() ?? Promise.resolve(),
      showAll: () => ctrlRef.current?.showAll() ?? Promise.resolve(),
      zoomBy(factor) {
        ctrlRef.current?.zoomBy(factor);
      },
      getScreenPoint(id) {
        const ctl = ctrlRef.current;
        const m = data.byId.get(id);
        return ctl && m ? toScreen(ctl.get(), m.x, m.y) : null;
      },
      getTransform: () => ctrlRef.current?.get() ?? { k: 1, x: 0, y: 0 },
      onTransform: (cb) => ctrlRef.current?.onTransform(cb) ?? (() => {}),
      getZoomLevel: () => ctrlRef.current?.zoomLevel() ?? 1,
      getFitTransform: () => ctrlRef.current?.getFit() ?? { k: 1, x: 0, y: 0 },
      getSmogSlot: () => smogRef.current,
    }),
    [data],
  );

  // Hover and click: the nearest dot within HIT_PX of the pointer.
  const hitTest = useCallback(
    (clientX: number, clientY: number, withClosed: boolean): HoverTarget | null => {
      const ctl = ctrlRef.current;
      const surface = surfaceRef.current;
      if (!ctl || !surface) return null;
      const rect = surface.getBoundingClientRect();
      const t = ctl.get();
      const mx = (clientX - rect.left - t.x) / t.k;
      const my = (clientY - rect.top - t.y) / t.k;
      const r = HIT_PX / t.k;
      let best: HoverTarget | null = null;
      let bestD2 = r * r;
      if (withClosed) {
        for (const m of data.closed) {
          const d2 = (m.x - mx) ** 2 + (m.y - my) ** 2;
          if (d2 <= bestD2) {
            best = { kind: 'closed', mine: m };
            bestD2 = d2;
          }
        }
      }
      // Operating mines win ties: they are drawn on top.
      for (const m of data.mines) {
        const d2 = (m.x - mx) ** 2 + (m.y - my) ** 2;
        if (d2 <= bestD2) {
          best = { kind: 'mine', mine: m };
          bestD2 = d2;
        }
      }
      return best;
    },
    [data],
  );

  const hoverEls = useRef<{ key: string; els: Element[] }>({ key: '', els: [] });
  const coolEls = useRef<Element[]>([]);
  const setHoverClass = useCallback(
    (target: HoverTarget | null) => {
      const root = dotsGRef.current;
      let key = '';
      let els: Element[] = [];
      if (root && target) {
        if (target.kind === 'mine') {
          const id = CSS.escape(target.mine.id);
          key = `m:${target.mine.id}`;
          els = [...root.querySelectorAll(`[data-id="${id}"], [data-hole="${id}"]`)];
        } else {
          const i = data.closed.indexOf(target.mine);
          key = `c:${i}`;
          els = [...root.querySelectorAll(`[data-closed="${i}"]`)];
        }
      }
      if (key === hoverEls.current.key) return;
      // Only the dot going up and the one coming down carry a transition ("is-hot"): a transition declared on every
      // dot makes each zoom frame's style update several times slower.
      for (const el of coolEls.current) el.classList.remove('is-hot');
      coolEls.current = hoverEls.current.els;
      for (const el of coolEls.current) el.classList.remove('is-hover');
      for (const el of els) el.classList.add('is-hot', 'is-hover');
      hoverEls.current = { key, els };
    },
    [data],
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.buttons) return;
    const target = hitTest(e.clientX, e.clientY, true);
    setHoverClass(target);
    if (!target) {
      hover.set(null);
      return;
    }
    const prev = hover.get();
    if (prev && prev.target.mine === target.mine) return;
    const ctl = ctrlRef.current;
    if (!ctl) return;
    const p = toScreen(ctl.get(), target.mine.x, target.mine.y);
    hover.set({ target, x: p.x, y: p.y });
  };

  const onPointerLeave = () => {
    setHoverClass(null);
    hover.set(null);
  };

  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = hitTest(e.clientX, e.clientY, false);
    if (target?.kind === 'mine') live.current.onSelect?.(target.mine.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const ctl = ctrlRef.current;
    if (!ctl || e.altKey || e.ctrlKey || e.metaKey) return;
    const { width, height } = ctl.getSize();
    const stepX = width * KEY_PAN_FRACTION;
    const stepY = height * KEY_PAN_FRACTION;
    switch (e.key) {
      case '+':
      case '=':
        ctl.zoomBy(ZOOM_STEP_FACTOR);
        break;
      case '-':
      case '_':
        ctl.zoomBy(1 / ZOOM_STEP_FACTOR);
        break;
      case '0':
        ctl.showAllNow();
        break;
      case 'ArrowLeft':
        ctl.panBy(stepX, 0);
        break;
      case 'ArrowRight':
        ctl.panBy(-stepX, 0);
        break;
      case 'ArrowUp':
        ctl.panBy(0, stepY);
        break;
      case 'ArrowDown':
        ctl.panBy(0, -stepY);
        break;
      case 'Escape':
        if (!hover.get()) return;
        setHoverClass(null);
        hover.set(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const backToMap = () => {
    const cb = live.current.onDockClick;
    if (cb) cb();
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  const rootClass = ['mmv2', reduced ? 'is-reduced' : '', className ?? ''].filter(Boolean).join(' ');

  return (
    <div ref={anchorRef} className={rootClass} style={CSS_VARS} data-docked={docked ? 'true' : undefined}>
      <div ref={dockRef} className="mmv2-dock">
        <div ref={chromeRef} className="mmv2-chrome" aria-hidden="true" />
        <div ref={clipRef} className="mmv2-clip">
          <div
            ref={surfaceRef}
            className="mmv2-surface"
            role="application"
            aria-label={label}
            aria-describedby={descId}
            aria-roledescription="map"
            tabIndex={docked ? -1 : 0}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onClick}
            onKeyDown={onKeyDown}
          >
            <svg className="mmv2-svg mmv2-base" aria-hidden="true">
              <g ref={baseGRef}>
                <BaseLayer data={data} />
              </g>
            </svg>
            <div ref={smogRef} className="mmv2-smog" data-smog-slot="">
              {smog}
            </div>
            <svg className="mmv2-svg mmv2-over" aria-hidden="true">
              <g ref={overGRef} className={selected ? 'mmv2-over-g has-sel' : 'mmv2-over-g'}>
                <g ref={dotsGRef} className="mmv2-dots">
                  <g className="mmv2-dimmable">
                    <CitiesLayer data={data} />
                    <DotsLayer data={data} selectedId={selected?.id ?? null} />
                  </g>
                  <SelectedLayer mine={selected} />
                </g>
                <LabelsLayer labels={labels} />
              </g>
            </svg>
            <MapTooltipV2 store={hover} />
          </div>
        </div>
        {docked ? (
          <button
            type="button"
            className="mmv2-docklink"
            aria-label={selected ? `Back to the map, ${selected.name} selected` : 'Back to the map'}
            onClick={backToMap}
          />
        ) : null}
      </div>
      <div ref={controlsRef} className="mmv2-controls">
        {children}
      </div>
      <p id={descId} className="sr-only">
        Plus and minus zoom, the arrow keys pan, and 0 shows all of India. Use the search to choose a mine.
      </p>
      <p className="sr-only" aria-live="polite">
        {selected ? `${selected.name} selected` : ''}
      </p>
    </div>
  );
}

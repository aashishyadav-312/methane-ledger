import { useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from 'react';
import { mineHref, useRouteLocation } from '../../app/router';
import type { MineId, SmogMode } from '../contracts';
import { loadMapV2, MineMapV2, ZoomControls, type MineMapHandle } from '../map';
import { nextDocked } from '../map/geometry';
import {
  DOCK_SPRING,
  EASE_DRAWER_CSS,
  EASE_OUT_CSS,
  PANEL_SLIDE_MS,
  REDUCED_CROSSFADE_MS,
  RESULTS_SHEET_RADIUS_PX,
  RESULTS_SHEET_SHADOW,
  SCROLL_CUE_RISE_PX,
  useFrozenClock,
  useReducedMotion,
} from '../motion/tokens';
import { SHEET_PEEK_PX, smogMethaneMm3, V2_KEYS } from '../panel';
import { MineSearch } from '../search';
import { useMediaQuery } from '../shell/useMediaQuery';
import { emittersFromSources, SmogLayer } from '../smog';
import { dockProgressAt, HOME_INSETS_DESKTOP, HOME_INSETS_PHONE, HOME_PHONE_QUERY, panelWidthPx } from './layout';
import { Legend } from './Legend';
import { playLoad, playRipple, RIPPLE_DIAMETER_PX } from './motion';
import './home.css';

// The panel, the model run and the results load when a mine is first chosen or opened by link.
const MineSession = lazy(() => import('./MineSession').then((m) => ({ default: m.MineSession })));

const OVERVIEW: SmogMode = { kind: 'overview' };

/** Timings for home.css, from the motion tokens. */
const CSS_VARS = {
  '--v2h-panel-ms': `${PANEL_SLIDE_MS}ms`,
  '--v2h-fade-ms': `${REDUCED_CROSSFADE_MS}ms`,
  '--v2h-ease-drawer': EASE_DRAWER_CSS,
  '--v2h-ease-out': EASE_OUT_CSS,
  '--v2h-cue-rise': `${SCROLL_CUE_RISE_PX}px`,
  '--v2h-ripple-d': `${RIPPLE_DIAMETER_PX}px`,
  '--v2h-sheet-radius': `${RESULTS_SHEET_RADIUS_PX}px`,
  '--v2h-sheet-shadow': RESULTS_SHEET_SHADOW,
  '--v2h-peek': `${SHEET_PEEK_PX}px`,
} as CSSProperties;

interface Shown {
  id: MineId;
  closing: boolean;
}

interface ResultsGeom {
  top: number;
  vh: number;
}

/**
 * The v2 home (PLAN_V2 Step 6, V2-Home, V2-Mine-Open, V2-Phone): the full-screen map with its smog, the headline and
 * search, and, once a mine is chosen (search, map click or `#/mine/:id`), the fly-to, the inputs panel, the run and
 * the results below the map, which docks into the mini-map card as the results scroll over it.
 */
export function HomeV2() {
  const { route, query } = useRouteLocation();
  const data = useMemo(() => loadMapV2(), []);
  const routeId = route.name === 'mine' && data.byId.has(route.id) ? route.id : null;
  const phone = useMediaQuery(HOME_PHONE_QUERY);
  const reduced = useReducedMotion();
  const freeze = useFrozenClock();
  const still = reduced || freeze !== null;

  // `#/?m=<id>` (a query copied with its mine key) opens the mine like `#/mine/<id>`.
  const aliasId = route.name === 'map' ? query.get(V2_KEYS.mine) : null;
  useEffect(() => {
    if (aliasId === null || !data.byId.has(aliasId)) return;
    window.location.replace(`${mineHref(aliasId)}?${query.toString()}`);
  }, [aliasId, data, query]);

  // The mine on screen. It stays while its panel slides out after a close.
  const [shown, setShown] = useState<Shown | null>(routeId ? { id: routeId, closing: false } : null);
  // The mine the page was opened on: it runs at once and jumps there, since nothing but the map animates on load.
  const [deepLink, setDeepLink] = useState<MineId | null>(routeId);
  const [prevRoute, setPrevRoute] = useState(routeId);
  if (routeId !== prevRoute) {
    setPrevRoute(routeId);
    setDeepLink(null);
    if (routeId) setShown({ id: routeId, closing: false });
    else if (shown && !shown.closing) setShown({ ...shown, closing: true });
  }
  const open = shown !== null && !shown.closing;
  const selectedId = open ? shown.id : null;

  useEffect(() => {
    if (!shown?.closing) return;
    const t = setTimeout(() => setShown(null), still ? 0 : PANEL_SLIDE_MS);
    return () => clearTimeout(t);
  }, [shown, still]);

  const mapRef = useRef<MineMapHandle | null>(null);
  const [mapApi, setMapApi] = useState<MineMapHandle | null>(null);
  const setMap = useCallback((h: MineMapHandle | null) => {
    mapRef.current = h;
    setMapApi(h);
  }, []);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const [jump, setJump] = useState(routeId !== null);

  // Select: fly the mine to the centre of the map area left of the panel (or above the phone sheet), then the
  // ripple. Close: back to the view before the first fly-to.
  const flownTo = useRef<MineId | null>(null);
  useEffect(() => {
    if (!mapApi) return;
    const before = flownTo.current;
    flownTo.current = routeId;
    if (routeId) {
      let live = true;
      const opts = phone ? { offsetBottom: SHEET_PEEK_PX } : { offsetRight: panelWidthPx() };
      void mapApi.flyTo(routeId, opts).then(() => {
        if (!live) return;
        setJump(false);
        if (still || jump) return;
        const p = mapApi.getScreenPoint(routeId);
        if (p) playRipple(rippleRef.current, p.x, p.y);
      });
      return () => {
        live = false;
      };
    }
    if (before) void mapApi.reset();
    // `jump` and `still` only shape the first move; a change to them is not a new selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, mapApi, phone]);

  // The page-load sequence, once.
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  useLayoutEffect(() => {
    if (played.current) return;
    played.current = true;
    playLoad(mapWrapRef.current, leadRef.current, freeze, reduced);
  }, [freeze, reduced]);

  const emitters = useMemo(
    () =>
      emittersFromSources([
        ...data.mines.map((m) => ({ id: m.id, x: m.x, y: m.y, ...smogMethaneMm3(m.id, m.gemMethaneMm3) })),
        ...data.closed.map((c, i) => ({ id: `closed-${i}`, x: c.x, y: c.y, methaneMm3PerYr: null, closed: true })),
      ]),
    [data],
  );

  // Stage height, for the phone sheet's snap points.
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const [stageH, setStageH] = useState(0);
  useEffect(() => {
    if (!stageEl || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setStageH(stageEl.clientHeight));
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  // Appendix E: the results' top and the viewport height give the docking progress p.
  const [resultsSlot, setResultsSlot] = useState<HTMLDivElement | null>(null);
  const [geom, setGeom] = useState<ResultsGeom | null>(null);
  useEffect(() => {
    if (!resultsSlot) return;
    const measure = () => {
      const top = resultsSlot.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      const next = resultsSlot.offsetHeight > 0 ? { top, vh } : null;
      setGeom((g) => (g === next || (g && next && g.top === next.top && g.vh === next.vh) ? g : next));
    };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(resultsSlot);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [resultsSlot]);

  const { scrollY } = useScroll();
  const rawP = useTransform(scrollY, (y) => (geom ? dockProgressAt(y, geom.top, geom.vh) : 0));
  const dockP = useSpring(rawP, DOCK_SPRING);
  const [docked, setDocked] = useState(false);
  useMotionValueEvent(dockP, 'change', (v) => setDocked((d) => nextDocked(d, v)));

  const smogMode: SmogMode = selectedId
    ? docked
      ? { kind: 'docked', id: selectedId }
      : { kind: 'focus', id: selectedId }
    : OVERVIEW;

  const select = useCallback((id: MineId) => {
    const href = mineHref(id);
    if (window.location.hash !== href) window.location.hash = href;
  }, []);
  const close = useCallback(() => {
    window.location.hash = '#/';
  }, []);

  // Esc closes the mine, unless something on top of it (the search, a menu, the assumptions sheet) took it.
  useEffect(() => {
    if (!routeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.target instanceof Element && e.target.closest('.v2-header')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [routeId, close]);

  const behavior: ScrollBehavior = still ? 'auto' : 'smooth';
  const scrollToResults = () => {
    if (!resultsSlot) return;
    window.scrollTo({ top: resultsSlot.getBoundingClientRect().top + window.scrollY, behavior });
  };
  const scrollToTop = () => window.scrollTo({ top: 0, behavior });

  return (
    <div
      className="v2-home"
      style={CSS_VARS}
      data-open={open ? 'true' : undefined}
      data-phone={phone ? 'true' : undefined}
      data-still={still ? 'true' : undefined}
      data-docked={docked ? 'true' : undefined}
    >
      <section ref={setStageEl} className="v2-home-stage" aria-label="Map and inputs">
        <div ref={mapWrapRef} className="v2-home-map">
          <MineMapV2
            ref={setMap}
            data={data}
            selectedId={selectedId}
            onSelect={select}
            insets={phone ? HOME_INSETS_PHONE : HOME_INSETS_DESKTOP}
            wheel={geom ? 'modifier' : 'zoom'}
            dockProgress={dockP}
            reducedMotion={reduced || jump}
            smog={<SmogLayer emitters={emitters} viewBox={data.viewBox} mode={smogMode} map={mapApi} />}
          >
            {!phone && !open ? <Legend data={data} /> : null}
            {!phone ? <ZoomControls map={mapRef} /> : null}
          </MineMapV2>
        </div>
        <span ref={rippleRef} className="v2-ripple" aria-hidden="true" />

        <div ref={leadRef} className="v2-home-lead" data-compact={open ? 'true' : undefined}>
          {open ? null : (
            <>
              <h1 className="v2-home-h1">Which closing mines can pay for their own methane?</h1>
              {phone ? null : (
                <p className="v2-home-lede">
                  Find any of Coal India&apos;s {data.mines.length} operating mines, by name or on the map. Open one to
                  see what capturing its methane would cost, and the carbon credit price that would cover it.
                </p>
              )}
            </>
          )}
          <div className="v2-home-searchrow">
            <MineSearch
              mines={data.mines}
              onSelect={select}
              placeholder={phone ? `Search ${data.mines.length} mines` : undefined}
              className="v2-home-search"
            />
            {open && !phone ? (
              <button type="button" className="v2-home-all v2-press" onClick={close}>
                All of India
              </button>
            ) : null}
          </div>
        </div>

        {shown ? (
          <Suspense fallback={null}>
            <MineSession
              key={shown.id}
              mine={data.byId.get(shown.id)!}
              initialRan={shown.id === deepLink}
              closing={shown.closing}
              phone={phone}
              still={still}
              stageHeight={stageH}
              resultsSlot={resultsSlot}
              onClose={close}
              onScrollToResults={scrollToResults}
              onScrollToTop={scrollToTop}
            />
          </Suspense>
        ) : null}
      </section>
      <div
        ref={setResultsSlot}
        className="v2-home-results"
        data-testid="v2-results"
        aria-label="Results"
        role="region"
      />
    </div>
  );
}

// Smog test harness: the v1 map land with the smog layer between land and dots, for e2e and stills.
// Not part of the app build (vite only builds index.html); e2e/v2/smog.spec.ts builds it on its own.
// Query: ?mode=overview|focus|docked&id=<mine id>&freeze=<s>&dots=0
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../styles/tokens.css';
import type { MapApi, MapTransform, SmogMode } from '../../contracts';
import { FLY_TARGET_K, MINI_W_PX, DOCK_MARGIN_RIGHT_PX, DOCK_MARGIN_TOP_PX, DOCK_RADIUS_PX } from '../../motion/tokens';
import { fitViewBox } from '../projection';
import { SmogLayer, type SmogLayerHandle } from '../SmogLayer';
import { demoEmitters, demoMap, demoProbePoints, demoViewBox } from './demoEmitters';

/** Mine panel width on desktop (`--panel-w`); the focused mine sits in the area left of it. */
const PANEL_W_PX = 460;

interface HarnessWindow {
  __smog?: {
    stats: () => ReturnType<SmogLayerHandle['stats']>;
    setTransform: (t: MapTransform) => void;
    toScreen: (p: { x: number; y: number }) => { x: number; y: number };
    probes: ReturnType<typeof demoProbePoints>;
  };
}

/**
 * A stand-in for <MineMapV2>'s MapApi. The harness SVGs use a viewBox, so their zoom group's transform `t` is in
 * viewBox units; the API reports it as the real map does, in CSS px of the surface (k includes the fit).
 */
function makeMap(initial: MapTransform, toSurface: (t: MapTransform) => MapTransform) {
  let t = initial;
  const subs = new Set<(t: MapTransform) => void>();
  const api: Pick<MapApi, 'getTransform' | 'onTransform'> & { set(t: MapTransform): void; get(): MapTransform } = {
    getTransform: () => toSurface(t),
    get: () => t,
    onTransform(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    set(next) {
      t = next;
      subs.forEach((cb) => cb(toSurface(t)));
    },
  };
  return api;
}

function Harness() {
  const params = new URLSearchParams(location.search);
  const kind = params.get('mode') ?? 'overview';
  const id = params.get('id') ?? 'bccl-moonidih';
  const showDots = params.get('dots') !== '0';
  const mode: SmogMode = kind === 'focus' || kind === 'docked' ? { kind, id } : { kind: 'overview' };
  const emitters = useMemo(() => demoEmitters(), []);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { fit, offsetX, offsetY } = fitViewBox(demoViewBox, W, H);

  const initial = useMemo<MapTransform>(() => {
    if (mode.kind === 'overview') return { k: 1, x: 0, y: 0 };
    const m = emitters.find((e) => e.id === mode.id) ?? emitters[0];
    const k = FLY_TARGET_K;
    const cx = ((W > PANEL_W_PX * 2 ? (W - PANEL_W_PX) / 2 : W / 2) - offsetX) / fit;
    const cy = (H / 2 - offsetY) / fit;
    return { k, x: cx - k * m.x, y: cy - k * m.y };
    // The harness reads its query once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const map = useMemo(
    () => makeMap(initial, (v) => ({ k: fit * v.k, x: offsetX + fit * v.x, y: offsetY + fit * v.y })),
    // The harness reads its size once, like its query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial],
  );
  const [t, setT] = useState(initial);
  const handle = useRef<SmogLayerHandle>(null);

  useEffect(() => {
    (window as HarnessWindow).__smog = {
      stats: () => handle.current?.stats() ?? null,
      setTransform: (next) => {
        map.set(next);
        setT(next);
      },
      toScreen: (p) => {
        const cur = map.getTransform();
        return { x: cur.x + cur.k * p.x, y: cur.y + cur.k * p.y };
      },
      probes: demoProbePoints(),
    };
  }, [map, fit, offsetX, offsetY]);

  const g = `translate(${t.x},${t.y}) scale(${t.k})`;
  const docked = mode.kind === 'docked';
  const s = MINI_W_PX / W;
  const wrapper: React.CSSProperties = docked
    ? {
        position: 'absolute',
        inset: 0,
        transformOrigin: 'top right',
        transform: `translate(${-DOCK_MARGIN_RIGHT_PX}px, ${DOCK_MARGIN_TOP_PX}px) scale(${s})`,
        borderRadius: DOCK_RADIUS_PX / s,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px var(--line)',
        background: 'var(--paper)',
      }
    : { position: 'absolute', inset: 0 };
  const layer: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--paper)', overflow: 'hidden' }}>
      <div style={wrapper} data-testid="map">
        <svg viewBox={demoViewBox.join(' ')} style={layer} aria-hidden="true">
          <g transform={g}>
            <path d={demoMap.outline} fill="var(--land)" />
            {demoMap.coalStates.map((st) => (
              <path
                key={st.name}
                d={st.d}
                fill="var(--land-coal)"
                stroke="#CFC7B4"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={demoMap.outline}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
        <div style={layer} data-testid="smog-slot">
          <SmogLayer ref={handle} emitters={emitters} viewBox={demoViewBox} mode={mode} map={map} />
        </div>
        {showDots && (
          <svg viewBox={demoViewBox.join(' ')} style={layer} aria-hidden="true">
            <g transform={g}>
              {demoMap.mines.map((m) => (
                <circle
                  key={m.id}
                  cx={m.x}
                  cy={m.y}
                  r={2.4 / Math.sqrt(t.k)}
                  fill={m.id === id && mode.kind !== 'overview' ? 'var(--ink)' : 'var(--band-after)'}
                  opacity={mode.kind !== 'overview' && m.id !== id ? 0.45 : 0.9}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);

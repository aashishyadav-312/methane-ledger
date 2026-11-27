/*
 * Harness for the Step 3 map engine, until the v2 home (Step 6) composes it. e2e/v2/map.spec.ts builds this page on
 * its own; the app build never includes it.
 *
 * Query: ?fly=<id> flies there on load (and selects it), ?select=<id>, ?offsetRight=<px> (with ?panel to draw the
 * panel's area), ?layout=home (insets for the header and the headline column), ?dock=<0..1>, ?freeze=<s>,
 * ?reduced=1, ?wheel=modifier.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../styles/tokens.css';
import '../../../styles/global.css';
import type { MineId } from '../../contracts';
import { MineMapV2, type MineMapHandle } from '../MineMapV2';
import { ZoomControls } from '../ZoomControls';

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = Number(q.get(key));
  return q.has(key) && Number.isFinite(v) ? v : fallback;
};

/** V2-Home: the header is 72px and the headline column ends at 48 + 440px. */
const HOME_INSETS = { top: 72, left: 48 + 440 + 32, right: 0, bottom: 0 };

declare global {
  interface Window {
    __map?: { api: MineMapHandle | null; select(id: MineId | null): void; selected(): MineId | null };
  }
}

function Harness() {
  const map = useRef<MineMapHandle>(null);
  const fly = q.get('fly');
  const [selected, setSelected] = useState<MineId | null>(fly ?? q.get('select'));
  const selectedRef = useRef(selected);
  const offsetRight = num('offsetRight', 0);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    window.__map = { api: map.current, select: setSelected, selected: () => selectedRef.current };
    if (fly) void map.current?.flyTo(fly, { offsetRight });
  }, [fly, offsetRight]);

  const reduced = q.get('reduced') === '1' ? true : undefined;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--paper)' }}>
      <MineMapV2
        ref={map}
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id);
          void map.current?.flyTo(id, { offsetRight });
        }}
        insets={q.get('layout') === 'home' ? HOME_INSETS : undefined}
        dockProgress={num('dock', 0)}
        reducedMotion={reduced}
        wheel={q.get('wheel') === 'modifier' ? 'modifier' : 'zoom'}
      >
        <ZoomControls map={map} className={offsetRight ? 'harness-zoom' : undefined} />
      </MineMapV2>
      {q.has('panel') && offsetRight > 0 ? (
        <aside
          aria-label="Panel area"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: offsetRight,
            background: 'var(--card)',
            borderLeft: '1px solid var(--line)',
            zIndex: 20,
          }}
        />
      ) : null}
      <style>{`.harness-zoom { right: ${offsetRight + 32}px; }`}</style>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);

// The test route `#/__results?m=<mine id>` (PLAN_V2 Step 7, item 4): `ResultsV2` on its own, for one mine at the
// default settings. It is for dev and test builds only: the e2e spec and screenshots mount it through
// src/v2/results/harness, and the app does not route to it.
//
// Query: m=<id> (default Moonidih), p=<price, US$ a tonne>, mini=0 hides the stand-in for the docked mini map,
// freeze=<s> (frozen clock, read by the motion hooks).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getConstants, getCosts, getDefaultSettings, getTech } from '../../data/load';
import { pickMineInput } from '../../data/estimation';
import { evaluate } from '../../model/evaluate';
import { getMineV2 } from '../map/data';
import { DOCK_MARGIN_RIGHT_PX, DOCK_MARGIN_TOP_PX, MINI_W_PX } from '../motion';
import { settingsAtPrice } from './model';
import { ResultsV2 } from './ResultsV2';

export const RESULTS_TEST_PATH = '/__results';
const DEFAULT_MINE = 'bccl-moonidih';

export interface ResultsTestQuery {
  mineId: string;
  priceUsdPerT: number | null;
  showMini: boolean;
}

/** Reads `#/__results?m=...&p=...`; null when the hash is another route. */
export function parseResultsTestHash(hash: string): ResultsTestQuery | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  if (path !== RESULTS_TEST_PATH) return null;
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  const p = Number(params.get('p'));
  return {
    mineId: params.get('m') || DEFAULT_MINE,
    priceUsdPerT: params.has('p') && Number.isFinite(p) && p >= 0 ? p : null,
    showMini: params.get('mini') !== '0',
  };
}

declare global {
  interface Window {
    /** Test hooks: re-run at another price (to see the morph), and how often Edit inputs was pressed. */
    __results?: { setPrice(usdPerT: number): void; editCount(): number };
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

let editPresses = 0;

export function ResultsTestRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const query = parseResultsTestHash(hash) ?? parseResultsTestHash(`#${RESULTS_TEST_PATH}`)!;
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const priceUsdPerT = priceOverride ?? query.priceUsdPerT ?? getDefaultSettings().creditPriceUsdPerT;
  const settings = useMemo(() => settingsAtPrice(priceUsdPerT), [priceUsdPerT]);
  const picked = useMemo(() => pickMineInput(query.mineId, {}, settings), [query.mineId, settings]);
  const mine = getMineV2(query.mineId);
  const result = useMemo(
    () => (picked?.input ? evaluate(picked.input, settings, getTech(), getConstants(), getCosts()) : null),
    [picked, settings],
  );

  useEffect(() => {
    window.__results = { setPrice: setPriceOverride, editCount: () => editPresses };
  }, []);

  if (!mine || !picked || !picked.input || !result) {
    return (
      <p className="v2r-test-missing" data-testid="results-missing">
        {picked?.reason ?? `No mine with the id ${query.mineId}.`}
      </p>
    );
  }
  return (
    <>
      <ResultsV2
        mine={mine}
        input={picked.input}
        result={result}
        source={picked.source}
        priceUsdPerT={priceUsdPerT}
        settings={settings}
        onEditInputs={() => {
          editPresses += 1;
        }}
      />
      {query.showMini ? (
        <div
          aria-hidden="true"
          data-testid="mini-standin"
          style={{
            position: 'fixed',
            top: DOCK_MARGIN_TOP_PX,
            right: DOCK_MARGIN_RIGHT_PX,
            width: MINI_W_PX,
            aspectRatio: '906 / 1016',
            boxSizing: 'border-box',
            border: '1px dashed var(--line-strong)',
            borderRadius: 16,
            background: 'var(--card)',
            zIndex: 'var(--z-mini)',
          }}
        />
      ) : null}
    </>
  );
}

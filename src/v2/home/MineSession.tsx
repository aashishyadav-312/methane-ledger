import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AssumptionsSheet } from '../../components/advanced/AssumptionsSheet';
import type { RegistryGroup } from '../../data/registry';
import { DEFAULT_PANEL } from '../../pages/MinePage/useMineModel';
import { getOverrides, subscribe as subscribeOverrides, type Overrides } from '../../state/session';
import {
  createQueryWriter,
  currentHashPath,
  currentQuery,
  decodeMineView,
  decodePanel,
  encodeMineView,
  encodePanel,
  type MineView,
  type PanelState,
  type PanelValue,
} from '../../state/url';
import type { MineV2 } from '../contracts';
import { BottomSheet, MinePanel } from '../panel';
import {
  decodeChoices,
  encodeChoices,
  panelBase,
  rebaseView,
  registryFor,
  sheetContext,
  sheetRows,
  viewContext,
  viewPatch,
  type EstimateChoices,
} from '../panel/model';
import type { SheetSnap } from '../panel/sheet';
import { ModelRun } from './ModelRun';

export interface MineSessionProps {
  mine: MineV2;
  /** Opened from a link on page load: run at once and show the results. */
  initialRan: boolean;
  /** The panel slides out; the session unmounts after the slide. */
  closing: boolean;
  phone: boolean;
  /** Reduced motion or a frozen clock: no travel. */
  still: boolean;
  /** The stage's height in px, for the phone sheet's snap points. */
  stageHeight: number;
  resultsSlot: HTMLElement | null;
  onClose: () => void;
  onScrollToResults: () => void;
  onScrollToTop: () => void;
}

const DEFAULT_COST_MODEL = DEFAULT_PANEL.costModel;

interface LinkState {
  choices: EstimateChoices;
  panel: PanelState;
  view: MineView | null;
}

/** The panel state a link describes, checked against this mine's own options. */
function readLink(id: string, overrides: Overrides, query: URLSearchParams): LinkState {
  const choices = decodeChoices(query);
  const plain = panelBase(id, choices, overrides, DEFAULT_PANEL);
  const panel = decodePanel(query, sheetContext(registryFor(plain?.record), DEFAULT_COST_MODEL));
  const pb = panelBase(id, choices, overrides, panel);
  return { choices, panel, view: pb?.base ? decodeMineView(query, viewContext(pb.base)) : null };
}

function linkQuery(id: string, s: LinkState): URLSearchParams {
  const q = encodePanel(s.panel, DEFAULT_COST_MODEL, s.view ? encodeMineView(s.view) : new URLSearchParams());
  return encodeChoices(q, id, s.choices);
}

/**
 * One open mine: its controls (kept in the link), the panel or phone sheet, the "All assumptions" sheet, the run
 * and the results. Keyed by mine id, so another mine starts from its own defaults.
 */
export function MineSession({
  mine,
  initialRan,
  closing,
  phone,
  still,
  stageHeight,
  resultsSlot,
  onClose,
  onScrollToResults,
  onScrollToTop,
}: MineSessionProps) {
  const id = mine.id;
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const [state, setState] = useState<LinkState>(() => readLink(id, overrides, currentQuery()));
  const { choices, panel, view } = state;
  const [ran, setRan] = useState(initialRan);
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetGroup, setSheetGroup] = useState<RegistryGroup>('Market');
  const headingId = `v2-panel-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const path = `/mine/${encodeURIComponent(id)}`;
  const writer = useMemo(() => createQueryWriter(), []);

  const pb = useMemo(() => panelBase(id, choices, overrides, panel), [id, choices, overrides, panel]);
  const defaultPb = useMemo(() => panelBase(id, choices, overrides, DEFAULT_PANEL), [id, choices, overrides]);
  const entries = useMemo(() => registryFor(pb?.record), [pb?.record]);
  const base = pb?.base ?? null;
  const ctx = useMemo(() => (base ? viewContext(base) : null), [base]);
  const rows = useMemo(
    () => (base && view && ctx && defaultPb?.base ? sheetRows(entries, defaultPb.base, view, panel, ctx) : []),
    [base, view, ctx, defaultPb, entries, panel],
  );

  // The latest state, for the sheet's delayed changes: two quick edits in different rows must both land.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  const commit = (next: LinkState) => {
    latest.current = next;
    setState(next);
    writer.write(path, linkQuery(id, next));
  };

  // Another link for this mine (paste, back or forward): read the controls again.
  useEffect(() => {
    const onHash = () => {
      if (currentHashPath() !== path) return;
      writer.cancel();
      const next = readLink(id, getOverrides(), currentQuery());
      latest.current = next;
      setState(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [id, path, writer]);

  // The link names every input from the start, so a copied link reproduces the view even with no change made.
  useEffect(() => {
    writer.write(path, linkQuery(id, latest.current));
    return () => writer.cancel();
  }, [id, path, writer]);

  if (pb === undefined) return null;

  const onView = (patch: Partial<MineView>) => {
    const now = latest.current;
    if (now.view) commit({ ...now, view: { ...now.view, ...patch } });
  };

  const onChoices = (patch: Partial<EstimateChoices>) => {
    const now = latest.current;
    const nextChoices = { ...now.choices, ...patch };
    const before = panelBase(id, now.choices, overrides, now.panel)?.base ?? null;
    const after = panelBase(id, nextChoices, overrides, now.panel)?.base ?? null;
    let nextView: MineView | null = null;
    if (after) nextView = now.view && before ? rebaseView(now.view, before.defaults, after.defaults) : after.defaults;
    commit({ ...now, choices: nextChoices, view: nextView });
  };

  const changeValue = (p: string, value: PanelValue) => {
    const row = rows.find((r) => r.entry.path === p);
    const now = latest.current;
    if (row === undefined || !base || !now.view) return;
    const key = row.entry.view;
    if (key !== undefined) {
      if (typeof value === 'number') commit({ ...now, view: { ...now.view, ...viewPatch(key, value, base.bases) } });
      return;
    }
    const changes: Record<string, PanelValue> = { ...now.panel.changes };
    if (value === row.defaultValue) delete changes[p];
    else changes[p] = value;
    commit({ ...now, panel: { ...now.panel, changes } });
  };

  const editInputs = () => {
    onScrollToTop();
    if (phone) setSnap('full');
    document.getElementById(headingId)?.focus({ preventScroll: true });
  };

  const footer =
    base && view ? (
      <ModelRun
        mine={mine}
        base={base}
        view={view}
        source={pb.picked.source}
        ran={ran}
        onRun={() => setRan(true)}
        resultsSlot={resultsSlot}
        onEditInputs={editInputs}
      />
    ) : null;

  const content = (handle?: ReactNode) => (
    <MinePanel
      mine={mine}
      pb={pb}
      view={view}
      choices={choices}
      onView={onView}
      onChoices={onChoices}
      onClose={onClose}
      onOpenAll={() => {
        setSheetGroup('Market');
        setSheetOpen(true);
      }}
      allCount={rows.length}
      sheetOpen={sheetOpen}
      footer={footer}
      variant={phone ? 'sheet' : 'side'}
      headingId={headingId}
      handle={handle}
    />
  );

  const showCue = ran && base !== null && view !== null && !closing;

  return (
    <>
      {phone ? (
        <div className="v2-sheet-clip">
          <BottomSheet
            stageHeight={stageHeight}
            open={!closing}
            snap={snap}
            onSnap={setSnap}
            still={still}
            instant={initialRan}
            labelledBy={headingId}
          >
            {(handle) => content(handle)}
          </BottomSheet>
        </div>
      ) : (
        <aside
          className="v2-home-panel"
          aria-labelledby={headingId}
          data-closing={closing ? 'true' : undefined}
          data-instant={initialRan ? 'true' : undefined}
          data-testid="v2-panel"
        >
          {content()}
        </aside>
      )}
      {showCue ? (
        <button type="button" className="v2-cue v2-press" onClick={onScrollToResults} data-testid="v2-cue">
          Results are ready. Scroll to see them
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4" />
          </svg>
        </button>
      ) : null}
      {base && view ? (
        <AssumptionsSheet
          open={sheetOpen}
          initialGroup={sheetGroup}
          onClose={() => setSheetOpen(false)}
          rows={rows}
          costModel={panel.costModel}
          defaultCostModel={DEFAULT_COST_MODEL}
          onCostModel={(costModel) => commit({ ...latest.current, panel: { ...latest.current.panel, costModel } })}
          onChange={changeValue}
          onResetAll={() => {
            const d = defaultPb?.base?.defaults ?? null;
            commit({ choices: latest.current.choices, panel: DEFAULT_PANEL, view: d });
          }}
        />
      ) : null}
    </>
  );
}

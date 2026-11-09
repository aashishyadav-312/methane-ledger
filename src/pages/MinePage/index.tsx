import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useRouteLocation } from '../../app/router';
import type { PriceChip } from '../../components/inputs/PriceControl';
import type { RulerTick } from '../../components/charts/PriceRuler';
import {
  getConstantsRecord,
  getCostsRecord,
  getDefaultSettings,
  getMapData,
  getMine,
  getSettingsRecord,
  getTechRecord,
  getTimeline,
} from '../../data/load';
import { acceptsValue, buildRegistry, valueAt, type RegistryEntry, type ViewKey } from '../../data/registry';
import { AssumptionsSheet, type SheetRow } from '../../components/advanced/AssumptionsSheet';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import { listDummyFields } from '../../data/unwrap';
import {
  closureRange,
  createQueryWriter,
  currentHashPath,
  currentQuery,
  CUSTOM_BASIS,
  decodeMineView,
  decodePanel,
  encodePanel,
  type CostBasis,
  type MineView,
  type MineViewContext,
  type PanelContext,
  type PanelState,
  type PanelValue,
} from '../../state/url';
import { FIN_DEFAULTS } from '../../model/financing';
import { downloadCsv, fileName } from '../../lib/export';
import { getOverrides, reset as resetOverrides, subscribe as subscribeOverrides } from '../../state/session';
import { Tag } from '../../ui';
import { AssumptionsPanel } from './AssumptionsPanel';
import {
  CREDITING_OPTIONS,
  DISCOUNT_OPTIONS,
  DRAINED_SLIDER_MM3_PER_YR,
  GRANT_OPTIONS,
  PRICE_INPUT_USD_PER_T,
  PRICE_SLIDER_USD_PER_T,
  VAM_CONC_OPTIONS,
} from './controls';
import { BAND_CHIP, metaLine, usdPrice } from './copy';
import { CostCard } from './CostCard';
import { annualCsv } from './csv';
import { decodePageView, encodePage, type PageView, type StructureKey } from './pageState';
import { Charts, Metrics, MoreCharts, ResultCard, StreamTable, WhoPays } from './Results';
import { structureView } from './structures';
import { makeUnits } from './units';
import { mineBase, useMineModel, type MineBase } from './useMineModel';
import './mine.css';

export function MinePage() {
  const { route } = useRouteLocation();
  const id = route.name === 'mine' ? route.id : '';
  const record = getMine(id);
  if (record === undefined) return <MineMissing id={id} />;
  // A new mine starts from its own defaults and its own link.
  return <MineScreen key={record.id} record={record} />;
}

function MineMissing({ id }: { id: string }) {
  const onMap = getMapData().mines.find((m) => m.id === id);
  return (
    <div className="page-width mine-missing">
      <a className="mine-back" href="#/">
        <BackIcon />
        All mines
      </a>
      <h1 className="t-mine-title">{onMap ? onMap.name : 'Mine not found'}</h1>
      <p className="t-lede">
        {onMap
          ? 'This mine is on the closure map, but it has no gas or cost inputs yet, so there is no model for it.'
          : 'There is no mine with this address. Go back to the map to choose one.'}
      </p>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 8H3M7 4L3 8l4 4" />
    </svg>
  );
}

function viewContext(base: MineBase): MineViewContext {
  const withDefault = (options: readonly number[], d: number) => (options.includes(d) ? options : [...options, d]);
  return {
    defaults: base.defaults,
    basisYears: Object.fromEntries(base.bases.map((b) => [b.id, b.year])),
    priceRangeUsdPerT: { min: PRICE_INPUT_USD_PER_T.min, max: PRICE_INPUT_USD_PER_T.max },
    drainedRangeMm3PerYr: { min: DRAINED_SLIDER_MM3_PER_YR.min, max: DRAINED_SLIDER_MM3_PER_YR.max },
    startYear: base.settings.startYear,
    vamConcOptions: withDefault(VAM_CONC_OPTIONS, base.defaults.vamConc),
    grantOptions: withDefault(GRANT_OPTIONS, base.defaults.grantShare),
    discountOptions: withDefault(DISCOUNT_OPTIONS, base.defaults.discountRate),
    gwpOptions: withDefault(base.constants.gwpOptions, base.defaults.gwp),
    creditingOptions: CREDITING_OPTIONS,
  };
}

function priceChips(prices: PriceScenario[]): PriceChip[] {
  return prices
    .filter((s) => s.chip && s.priceUsdPerT !== null)
    .map((s) => {
      const p = s.priceUsdPerT!.value;
      const benchmark = s.badge?.kind === 'benchmark';
      return {
        id: s.id,
        text: `${s.shortLabel} ${usdPrice(p)}`,
        srText: benchmark && s.badge ? `, ${s.badge.label.toLowerCase()}` : undefined,
        priceUsdPerT: p,
        description: [s.badge?.label, s.note].filter(Boolean).join('. ') + '.',
      };
    });
}

function rulerTicks(prices: PriceScenario[]): RulerTick[] {
  return prices
    .filter((s) => s.ruler && s.priceUsdPerT !== null)
    .map((s) => ({
      id: s.id,
      label: `${s.shortLabel} ${usdPrice(s.priceUsdPerT!.value)}`,
      priceUsdPerT: s.priceUsdPerT!.value,
      badge: s.badge?.label ?? null,
    }));
}

function offScaleNote(prices: PriceScenario[]): string | null {
  const off = prices.filter(
    (s) => s.priceUsdPerT !== null && s.priceUsdPerT.value > PRICE_SLIDER_USD_PER_T.max && s.badge !== null,
  );
  if (off.length === 0) return null;
  return off
    .map(
      (s) => `${s.shortLabel} ${usdPrice(s.priceUsdPerT!.value)} is off this scale (${s.badge!.label.toLowerCase()}).`,
    )
    .join(' ');
}

/** Mine fields each control replaces, so a control the user has moved no longer counts as a dummy input. */
const CONTROLLED_MINE_PATHS: Partial<Record<keyof MineView, string>> = {
  drainedMm3PerYr: 'drainedMm3PerYr',
  vamConc: 'vamConc',
  closureYear: 'closureYear',
};

function hasIllustrativeInputs(
  record: MineRecord,
  view: MineView,
  defaults: MineView,
  costModel: CostBasis,
): boolean {
  const replaced = new Set(
    Object.entries(CONTROLLED_MINE_PATHS)
      .filter(([k]) => view[k as keyof MineView] !== defaults[k as keyof MineView])
      .map(([, path]) => path),
  );
  const mineDummies = listDummyFields(record).filter((f) => !replaced.has(f.path.split('.')[0]));
  return (
    mineDummies.length > 0 ||
    listDummyFields(getTechRecord()).length > 0 ||
    listDummyFields(getSettingsRecord()).length > 0 ||
    listDummyFields(getConstantsRecord()).length > 0 ||
    (costModel === 'buildup' && listDummyFields(getCostsRecord()).length > 0)
  );
}

/** The cost basis in `data/settings.default.json` ("buildup"): the mine page's default. */
const DEFAULT_COST_MODEL: CostBasis = getDefaultSettings().costModel ?? 'v1';
const DEFAULT_PANEL: PanelState = Object.freeze({ costModel: DEFAULT_COST_MODEL, changes: Object.freeze({}) });

function panelContext(entries: RegistryEntry[]): PanelContext {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return {
    defaultCostModel: DEFAULT_COST_MODEL,
    accept: (path, value) => {
      const e = byPath.get(path);
      // Values with their own short key never ride in `x=`.
      return e !== undefined && e.view === undefined && acceptsValue(e, value);
    },
  };
}

/** The value each registry path takes with no panel changes. */
function defaultSources(base: MineBase): Record<string, unknown> {
  return {
    settings: base.settings,
    tech: base.tech,
    costs: base.costs,
    mine: base.input,
    finance: base.finance,
    prices: Object.fromEntries(base.prices.map((s) => [s.id, s.priceUsdPerT?.value])),
  };
}

function sheetRows(
  entries: RegistryEntry[],
  defaults: MineBase,
  view: MineView,
  panel: PanelState,
  ctx: MineViewContext,
): SheetRow[] {
  const sources = defaultSources(defaults);
  const options: Partial<Record<ViewKey, readonly number[]>> = {
    vamConc: [...ctx.vamConcOptions].sort((a, b) => a - b),
    grantShare: [...ctx.grantOptions].sort((a, b) => a - b),
    discountRate: [...ctx.discountOptions].sort((a, b) => a - b),
    gwp: [...ctx.gwpOptions].sort((a, b) => a - b),
    creditingYears: CREDITING_OPTIONS,
  };
  const ranges: Partial<Record<ViewKey, { min: number; max: number }>> = {
    priceUsdPerT: ctx.priceRangeUsdPerT,
    drainedMm3PerYr: ctx.drainedRangeMm3PerYr,
    closureYear: closureRange(ctx.startYear, view.creditingYears),
  };
  const rows: SheetRow[] = [];
  for (const entry of entries) {
    if (entry.view !== undefined) {
      const value = view[entry.view];
      const defaultValue = defaults.defaults[entry.view];
      if (typeof value !== 'number' || typeof defaultValue !== 'number') continue;
      rows.push({ entry, value, defaultValue, options: options[entry.view], range: ranges[entry.view] });
      continue;
    }
    const defaultValue = valueAt(sources, entry.path);
    if (typeof defaultValue !== 'number' && typeof defaultValue !== 'boolean') continue;
    rows.push({ entry, value: panel.changes[entry.path] ?? defaultValue, defaultValue });
  }
  return rows;
}

/** The control change for a value with its own short key. */
function viewPatch(key: ViewKey, value: number, bases: MineBase['bases']): Partial<MineView> {
  if (key === 'closureYear') {
    const basis = bases.find((b) => b.year === value);
    return { closureBasis: basis?.id ?? CUSTOM_BASIS, closureYear: value };
  }
  if (key === 'creditingYears') return { creditingYears: value === 15 ? 15 : 10 };
  return { [key]: value };
}

/** The grant control in the panel; structure E links to it. */
const GRANT_CONTROL_ID = 'mine-grant';

// Dev-only timing of one control move: from the input event to the committed DOM.
let moveStartMs: number | null = null;

function MineScreen({ record }: { record: MineRecord }) {
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const entries = useMemo(() => buildRegistry(record), [record]);
  const panelCtx = useMemo(() => panelContext(entries), [entries]);
  const [panel, setPanel] = useState<PanelState>(() => decodePanel(currentQuery(), panelCtx));
  const base = useMemo(() => mineBase(record, overrides, panel), [record, overrides, panel]);
  const defaultBase = useMemo(() => mineBase(record, overrides, DEFAULT_PANEL), [record, overrides]);
  const ctx = useMemo(() => viewContext(base), [base]);
  const [path] = useState(currentHashPath);
  const [view, setView] = useState<MineView>(() => decodeMineView(currentQuery(), ctx));
  const [page, setPage] = useState<PageView>(() => decodePageView(currentQuery()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const writer = useMemo(() => createQueryWriter(), []);

  // The user loads another link for this mine (paste, back or forward): read the controls again.
  useEffect(() => {
    const onHash = () => {
      if (currentHashPath() !== path) return;
      writer.cancel();
      const query = currentQuery();
      const nextPanel = decodePanel(query, panelCtx);
      setPanel(nextPanel);
      setView(decodeMineView(query, viewContext(mineBase(record, overrides, nextPanel))));
      setPage(decodePageView(query));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [panelCtx, record, overrides, path, writer]);

  useEffect(() => () => writer.cancel(), [writer]);

  const model = useMineModel(base, view);
  const { result } = model;

  useLayoutEffect(() => {
    if (!import.meta.env.DEV || moveStartMs === null) return;
    console.debug(`[mine] control move to DOM: ${(performance.now() - moveStartMs).toFixed(2)} ms`);
    moveStartMs = null;
  });

  const commit = (next: MineView, nextPage: PageView = page, nextPanel: PanelState = panel) => {
    if (import.meta.env.DEV) moveStartMs = performance.now();
    setView(next);
    setPage(nextPage);
    setPanel(nextPanel);
    writer.write(path, encodePanel(nextPanel, DEFAULT_COST_MODEL, encodePage(next, nextPage)));
  };

  const rows = useMemo(
    () => sheetRows(entries, defaultBase, view, panel, ctx),
    [entries, defaultBase, view, panel, ctx],
  );
  const changeValue = (p: string, value: PanelValue) => {
    const row = rows.find((r) => r.entry.path === p);
    if (row === undefined) return;
    const key = row.entry.view;
    if (key !== undefined) {
      if (typeof value === 'number') commit({ ...view, ...viewPatch(key, value, base.bases) });
      return;
    }
    const changes: Record<string, PanelValue> = { ...panel.changes };
    if (value === row.defaultValue) delete changes[p];
    else changes[p] = value;
    commit(view, page, { ...panel, changes });
  };

  const units = useMemo(
    () => makeUnits(page.currency, page.tonnes, base.settings.usdToInr, view.gwp, base.constants),
    [page.currency, page.tonnes, base.settings.usdToInr, view.gwp, base.constants],
  );
  const structure = useMemo(() => structureView(model.finance, page.structure), [model.finance, page.structure]);
  const structurePaybackYear =
    structure.paybackIndex === null ? null : base.settings.startYear - 1 + structure.paybackIndex;

  // Structure E is public money toward the build cost, so choosing it turns the grant control on if it is off.
  const pickStructure = (key: StructureKey) => {
    const grantOn =
      key === 'E' && view.grantShare === 0 && ctx.grantOptions.includes(FIN_DEFAULTS.grantShare)
        ? { grantShare: FIN_DEFAULTS.grantShare }
        : {};
    commit({ ...view, ...grantOn }, { ...page, structure: key });
  };
  const showGrant = () => {
    const group = document.getElementById(GRANT_CONTROL_ID);
    group?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    group?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
  };
  const fileStem = ['methane-ledger', record.name];
  const saveCsv = () => downloadCsv(fileName([...fileStem, 'annual'], 'csv'), annualCsv(result));

  const prices = base.prices;
  const chips = useMemo(() => priceChips(prices), [prices]);
  const ticks = useMemo(() => rulerTicks(prices), [prices]);
  const offScale = useMemo(() => offScaleNote(prices), [prices]);

  const timelineEntry = getTimeline()[record.id];
  const mapEntry = getMapData().mines.find((m) => m.id === record.id);
  const band = mapEntry ? BAND_CHIP[mapEntry.band] : undefined;
  const illustrative = hasIllustrativeInputs(record, view, base.defaults, panel.costModel);
  const basis = base.bases.find((b) => b.id === view.closureBasis);

  return (
    <div className="page-width mine-page">
      <div className="mine-title-block">
        <a className="mine-back" href="#/">
          <BackIcon />
          All mines
        </a>
        <div className="mine-title-row">
          <div className="mine-title-text">
            <h1 className="t-mine-title">{record.name}</h1>
            <p className="mine-meta">{metaLine(record)}</p>
          </div>
          <div className="mine-chips">
            {band ? (
              <span className="mine-chip">
                <span className="mine-chip-dot" style={{ '--dot': `var(--${band.token})` } as CSSProperties} />
                {band.label}
              </span>
            ) : null}
            {timelineEntry?.reserveLeft2026Mt != null ? (
              <span className="mine-chip num">{timelineEntry.reserveLeft2026Mt.toFixed(2)} Mt reserve left</span>
            ) : null}
            {illustrative ? <Tag kind="illustrative" /> : null}
          </div>
        </div>
      </div>

      <div className="mine-layout">
        <AssumptionsPanel
          mineName={record.name}
          view={view}
          defaults={base.defaults}
          drainedShownMm3PerYr={result.years[0]?.byStream.drained.ch4Mm3 ?? 0}
          bases={base.bases}
          startYear={base.settings.startYear}
          gwpOptions={base.constants.gwpOptions}
          chips={chips}
          overrideCount={Object.keys(overrides).length}
          grantControlId={GRANT_CONTROL_ID}
          onChange={(patch) => commit({ ...view, ...patch })}
          onReset={() => commit(base.defaults)}
          onClearOverrides={resetOverrides}
          allCount={rows.length}
          allOpen={sheetOpen}
          onOpenAll={() => setSheetOpen(true)}
        />
        <AssumptionsSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          rows={rows}
          costModel={panel.costModel}
          defaultCostModel={DEFAULT_COST_MODEL}
          onCostModel={(costModel) => commit(view, page, { ...panel, costModel })}
          onChange={changeValue}
          onResetAll={() => commit(defaultBase.defaults, page, DEFAULT_PANEL)}
        />

        <div className="mine-results">
          <ResultCard
            result={result}
            structure={structure}
            structureKey={page.structure}
            paybackYear={structurePaybackYear}
            priceUsdPerT={view.priceUsdPerT}
            creditingYears={view.creditingYears}
            ticks={ticks}
            offScaleNote={offScale}
            units={units}
            onUnits={(patch) => commit(view, { ...page, ...patch })}
            explanation={model.explanation}
          />
          {base.hasUploadedSeries ? (
            <p className="control-note" data-testid="uploaded-series-note">
              Yearly series you uploaded on the Data page are used for this mine in this browser session, in place of
              the defaults they replace.
            </p>
          ) : null}
          {result.warnings.includes('closure_outside_window') ? (
            <p className="control-note">
              The last year of mining, {view.closureYear}, is outside the crediting period from {result.years[0]?.year}{' '}
              to {result.years[result.years.length - 1]?.year}.
            </p>
          ) : null}
          <Metrics
            result={result}
            structure={structure}
            structureKey={page.structure}
            paybackYear={structurePaybackYear}
            grantShare={view.grantShare}
            units={units}
          />
          <WhoPays
            fin={model.finance}
            structureKey={page.structure}
            priceUsdPerT={view.priceUsdPerT}
            units={units}
            onPick={pickStructure}
            onShowGrant={showGrant}
          />
          <Charts
            result={result}
            npvCurve={model.npvCurve}
            priceUsdPerT={view.priceUsdPerT}
            discountRate={view.discountRate}
            units={units}
            fileStem={fileStem}
          />
          <MoreCharts
            result={result}
            structure={structure}
            structureKey={page.structure}
            waterfall={model.waterfall}
            tornado={model.tornado}
            units={units}
            fileStem={fileStem}
          />
          <div className="mine-export">
            <button type="button" className="btn btn-secondary" onClick={saveCsv}>
              Download CSV
            </button>
            <p className="control-note">
              The year-by-year table, {result.years[0]?.year} to {result.years[result.years.length - 1]?.year}: credits
              by gas stream, revenue, costs and cash, in US$ and tonnes CO2e.
            </p>
          </div>
          <StreamTable result={result} units={units} />
          <CostCard result={result} settings={model.settings} costs={base.costs} units={units} />
          {illustrative && record.kind === 'mine' ? (
            <p className="mine-footnote">
              Inputs are illustrative, scaled from the Global Methane Initiative profile of {record.name} and published
              cost ranges, until measured gas data arrives from CMPDI (Central Mine Planning and Design Institute) and
              Coal India. {closureFootnote(view.closureBasis, basis?.label)}
            </p>
          ) : null}
          {illustrative && record.kind === 'archetype' ? (
            <p className="mine-footnote">
              Inputs are illustrative: a typical mine of this kind, built from published ranges. It is not a real mine.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function closureFootnote(basisId: string, basisLabel: string | undefined): string {
  if (basisId === 'now') return 'Closure year: reserve run-out from the closure timeline workbook.';
  if (basisLabel)
    return `Closure year: reserve run-out ${basisLabel.toLowerCase()} output, from the closure timeline workbook.`;
  return 'Closure year: set on this page.';
}

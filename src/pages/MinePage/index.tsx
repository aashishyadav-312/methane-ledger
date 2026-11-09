import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useRouteLocation } from '../../app/router';
import type { PriceChip } from '../../components/inputs/PriceControl';
import type { RulerTick } from '../../components/charts/PriceRuler';
import {
  getConstantsRecord,
  getMapData,
  getMine,
  getPrices,
  getSettingsRecord,
  getTechRecord,
  getTimeline,
} from '../../data/load';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import { listDummyFields } from '../../data/unwrap';
import {
  createQueryWriter,
  currentHashPath,
  currentQuery,
  decodeMineView,
  type MineView,
  type MineViewContext,
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

function hasIllustrativeInputs(record: MineRecord, view: MineView, defaults: MineView): boolean {
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
    listDummyFields(getConstantsRecord()).length > 0
  );
}

/** The grant control in the panel; structure E links to it. */
const GRANT_CONTROL_ID = 'mine-grant';

// Dev-only timing of one control move: from the input event to the committed DOM.
let moveStartMs: number | null = null;

function MineScreen({ record }: { record: MineRecord }) {
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const base = useMemo(() => mineBase(record, overrides), [record, overrides]);
  const ctx = useMemo(() => viewContext(base), [base]);
  const [path] = useState(currentHashPath);
  const [view, setView] = useState<MineView>(() => decodeMineView(currentQuery(), ctx));
  const [page, setPage] = useState<PageView>(() => decodePageView(currentQuery()));
  const writer = useMemo(() => createQueryWriter(), []);

  // The user loads another link for this mine (paste, back or forward): read the controls again.
  useEffect(() => {
    const onHash = () => {
      if (currentHashPath() !== path) return;
      writer.cancel();
      setView(decodeMineView(currentQuery(), ctx));
      setPage(decodePageView(currentQuery()));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ctx, path, writer]);

  useEffect(() => () => writer.cancel(), [writer]);

  const model = useMineModel(base, view);
  const { result } = model;

  useLayoutEffect(() => {
    if (!import.meta.env.DEV || moveStartMs === null) return;
    console.debug(`[mine] control move to DOM: ${(performance.now() - moveStartMs).toFixed(2)} ms`);
    moveStartMs = null;
  });

  const commit = (next: MineView, nextPage: PageView = page) => {
    if (import.meta.env.DEV) moveStartMs = performance.now();
    setView(next);
    setPage(nextPage);
    writer.write(path, encodePage(next, nextPage));
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

  const prices = getPrices();
  const chips = useMemo(() => priceChips(prices), [prices]);
  const ticks = useMemo(() => rulerTicks(prices), [prices]);
  const offScale = useMemo(() => offScaleNote(prices), [prices]);

  const timelineEntry = getTimeline()[record.id];
  const mapEntry = getMapData().mines.find((m) => m.id === record.id);
  const band = mapEntry ? BAND_CHIP[mapEntry.band] : undefined;
  const illustrative = hasIllustrativeInputs(record, view, base.defaults);
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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SupplyCurve, splitLines, supplyDomain } from '../../components/charts/SupplyCurve';
import { PriceControl, type PriceChip } from '../../components/inputs/PriceControl';
import { getConstantsRecord, getPrices, getSettingsRecord, getTechRecord, listMines } from '../../data/load';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import { listDummyFields } from '../../data/unwrap';
import { DASH, pct, tonnes, usdM, usdPerT } from '../../lib/format';
import { mineHref } from '../../app/router';
import { getOverrides, subscribe as subscribeOverrides } from '../../state/session';
import {
  createQueryWriter,
  currentHashPath,
  currentQuery,
  decodeMineView,
  encodeMineView,
  type MineView,
} from '../../state/url';
import { Card, Tag, VerdictPill } from '../../ui';
import { PRICE_INPUT_USD_PER_T, PRICE_SLIDER_USD_PER_T } from '../MinePage/controls';
import { usdPrice } from '../MinePage/copy';
import { mineBase } from '../MinePage/useMineModel';
import { useElementWidth } from '../MinePage/useElementWidth';
import {
  MAX_COMPARED,
  MIN_COMPARED,
  buildEntries,
  defaultSelection,
  focusRecord,
  headline,
  headlineText,
  notAbatable,
  parseSelection,
  rankEntries,
  scenarioLines,
  supplyBars,
  viewContext,
  FOCUS_MINE_ID,
  pays,
  type CompareEntry,
} from './compare';
import './compare.css';

const SELECTION_KEY = 'sel';
const FALLBACK_CHART_WIDTH_PX = 720;

function priceChips(prices: PriceScenario[]): PriceChip[] {
  return prices
    .filter((s) => s.chip && s.priceUsdPerT !== null)
    .map((s) => {
      const p = s.priceUsdPerT!.value;
      return {
        id: s.id,
        text: `${s.shortLabel} ${usdPrice(p)}`,
        srText: s.badge?.kind === 'benchmark' ? `, ${s.badge.label.toLowerCase()}` : undefined,
        priceUsdPerT: p,
        description: [s.badge?.label, s.note].filter(Boolean).join('. ') + '.',
      };
    });
}

function hasDummyInputs(record: MineRecord): boolean {
  return (
    listDummyFields(record).length > 0 ||
    listDummyFields(getTechRecord()).length > 0 ||
    listDummyFields(getSettingsRecord()).length > 0 ||
    listDummyFields(getConstantsRecord()).length > 0
  );
}

function queryFor(view: MineView, selection: string[] | null): URLSearchParams {
  const q = encodeMineView(view);
  if (selection !== null) q.set(SELECTION_KEY, selection.join(','));
  return q;
}

export function ComparePage() {
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const records = useMemo(() => listMines(), []);
  const ids = useMemo(() => records.map((r) => r.id), [records]);
  const focus = useMemo(() => focusRecord(), []);
  const base = useMemo(() => mineBase(focus, overrides), [focus, overrides]);
  const ctx = useMemo(() => viewContext(base), [base]);

  const [path] = useState(currentHashPath);
  const [view, setView] = useState<MineView>(() => decodeMineView(currentQuery(), ctx));
  const [selection, setSelection] = useState<string[] | null>(() =>
    parseSelection(currentQuery().get(SELECTION_KEY), ids),
  );
  const writer = useMemo(() => createQueryWriter(), []);

  // The user loads another link (paste, back or forward): read the page state again.
  useEffect(() => {
    const onHash = () => {
      if (currentHashPath() !== path) return;
      writer.cancel();
      setView(decodeMineView(currentQuery(), ctx));
      setSelection(parseSelection(currentQuery().get(SELECTION_KEY), ids));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ctx, ids, path, writer]);
  useEffect(() => () => writer.cancel(), [writer]);

  const commit = (nextView: MineView, nextSelection: string[] | null) => {
    setView(nextView);
    setSelection(nextSelection);
    writer.write(path, queryFor(nextView, nextSelection));
  };

  const entries = useMemo(() => buildEntries(records, overrides, view, hasDummyInputs), [records, overrides, view]);
  const ranked = useMemo(() => rankEntries(entries), [entries]);
  const unabatable = useMemo(() => notAbatable(entries), [entries]);
  const bars = useMemo(() => supplyBars(entries, view.priceUsdPerT), [entries, view.priceUsdPerT]);
  const summary = useMemo(
    () => headline(entries, view.priceUsdPerT, view.creditingYears),
    [entries, view.priceUsdPerT, view.creditingYears],
  );

  const prices = getPrices();
  const chips = useMemo(() => priceChips(prices), [prices]);
  const allLines = useMemo(() => scenarioLines(prices, usdPrice), [prices]);
  const domain = useMemo(() => supplyDomain(bars, view.priceUsdPerT), [bars, view.priceUsdPerT]);
  const { drawn, offScale } = useMemo(() => splitLines(allLines, domain), [allLines, domain]);

  const shown = selection ?? defaultSelection(entries);
  const toggle = (id: string) => {
    const next = shown.includes(id) ? shown.filter((s) => s !== id) : [...shown, id].slice(0, MAX_COMPARED);
    commit(view, next);
  };

  const [chartRef, chartWidth] = useElementWidth(FALLBACK_CHART_WIDTH_PX);
  const illustrative = entries.some((e) => e.illustrative);
  const focusEntry = entries.find((e) => e.id === FOCUS_MINE_ID);
  const sentence = headlineText(summary, usdPrice(view.priceUsdPerT));

  return (
    <div className="page-width compare-page">
      <div className="compare-title">
        <span className="eyebrow">Compare</span>
        <h1 className="t-h1 compare-h1">Which mines pay?</h1>
        <p className="t-lede compare-headline" data-testid="headline" aria-live="polite">
          {sentence}
        </p>
        {illustrative ? <Tag kind="illustrative" /> : null}
      </div>

      <div className="compare-layout">
        <aside className="compare-panel" aria-label="Credit price">
          <PriceControl
            priceUsdPerT={view.priceUsdPerT}
            valueText={`${usdPrice(view.priceUsdPerT)} / t`}
            onChange={(p) => commit({ ...view, priceUsdPerT: p }, selection)}
            slider={PRICE_SLIDER_USD_PER_T}
            input={PRICE_INPUT_USD_PER_T}
            chips={chips}
            note="No public price exists yet for coal mine methane credits. The chips are benchmarks and our estimates. CCTS is India's Carbon Credit Trading Scheme."
          />
          {focusEntry ? (
            <p className="control-note" data-testid="focus-note">
              {focusEntry.name} uses the settings in this link: last year of mining {focusEntry.closureYear},
              ventilation air at {pct(view.vamConc, 1)} methane. Every other entry keeps its own closure year and gas,
              and shares the price, discount rate of {pct(view.discountRate, 0)}, GWP (global warming potential) of{' '}
              {view.gwp}, grant of {pct(view.grantShare, 0)} and {view.creditingYears} year crediting period.{' '}
              <a href={mineHref(FOCUS_MINE_ID, Object.fromEntries(encodeMineView(view)))}>
                Change them on the mine page
              </a>
              .
            </p>
          ) : null}
        </aside>

        <div className="compare-main">
          <Card as="section" className="compare-chart-card">
            <div className="compare-chart-head">
              <h2 className="compare-card-title">Abatement supply curve</h2>
              <ul className="compare-key" aria-label="Bar colours">
                <li>
                  <span className="compare-swatch compare-swatch-pays" aria-hidden="true" />
                  Pays at your price
                </li>
                <li>
                  <span className="compare-swatch compare-swatch-short" aria-hidden="true" />
                  Needs a higher price
                </li>
              </ul>
            </div>
            <div ref={chartRef} className="compare-chart" data-testid="supply-curve">
              <SupplyCurve
                width={chartWidth}
                bars={bars}
                priceUsdPerT={view.priceUsdPerT}
                priceLabel={`Your price ${usdPrice(view.priceUsdPerT)}`}
                lines={allLines}
                domainUsdPerT={domain}
                formatPrice={usdPrice}
                formatCredits={tonnes}
                markedIds={shown}
                ariaLabel={`Supply curve: ${bars.length} mines and archetypes sorted by the credit price each needs to break even, against your price of ${usdPrice(view.priceUsdPerT)} a tonne.`}
              />
            </div>
            <p className="control-note">
              Bar width is the credits over {view.creditingYears} years in tonnes of CO2e (carbon dioxide equivalent).
              Bar height is the credit price needed to break even.
            </p>
            <ul className="compare-lines" aria-label="Price scenario lines">
              {drawn.map((l) => (
                <li key={l.id}>
                  <span className="num">{l.label}</span>
                  <span className="compare-badge">{badgeFor(prices, l.id)}</span>
                </li>
              ))}
            </ul>
            {offScale.length > 0 ? (
              <p className="control-note">
                Above this chart:{' '}
                {offScale.map((l) => `${l.label} (${badgeFor(prices, l.id).toLowerCase()})`).join('; ')}.
              </p>
            ) : null}
          </Card>

          <Card as="section" className="compare-rank-card">
            <h2 className="compare-card-title">Ranked by break-even</h2>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <caption className="sr-only">
                  Mines and archetypes ranked by break-even credit price. Choose up to {MAX_COMPARED} to compare.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Compare</th>
                    <th scope="col" className="num-col">
                      #
                    </th>
                    <th scope="col">Mine or archetype</th>
                    <th scope="col" className="num-col">
                      Break-even
                    </th>
                    <th scope="col" className="num-col">
                      Credits
                    </th>
                    <th scope="col">At your price</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((e, i) => {
                    const checked = shown.includes(e.id);
                    return (
                      <tr key={e.id} data-testid={`rank-${e.id}`}>
                        <td>
                          <input
                            type="checkbox"
                            className="compare-check"
                            aria-label={`Compare ${e.name}`}
                            checked={checked}
                            disabled={!checked && shown.length >= MAX_COMPARED}
                            onChange={() => toggle(e.id)}
                          />
                        </td>
                        <td className="num num-col">{i + 1}</td>
                        <th scope="row">
                          {e.name}
                          <span className="compare-kind">{e.kind === 'archetype' ? 'Archetype' : e.subsidiary}</span>
                        </th>
                        <td className="num num-col">{usdPerT(e.breakevenUsdPerT!)}</td>
                        <td className="num num-col">{tonnes(e.erTotalTco2e)}</td>
                        <td>{verdictPill(e, view.priceUsdPerT)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {unabatable.length > 0 ? (
              <div className="compare-unabatable" data-testid="not-abatable">
                <h3 className="t-caps">Not abatable with v1 technologies</h3>
                <ul>
                  {unabatable.map((e) => (
                    <li key={e.id}>
                      <strong>{e.name}.</strong> {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card as="section" className="compare-side-card">
            <h2 className="compare-card-title">Side by side</h2>
            <SideBySide entries={entries.filter((e) => shown.includes(e.id))} view={view} />
          </Card>

          <p className="mine-footnote">
            Results are indicative, at pre-feasibility level, and not investment advice. Inputs are illustrative until
            measured gas data arrives. Have your own mine data? <a href="#/data">Upload it on the Data page</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function badgeFor(prices: readonly PriceScenario[], id: string): string {
  return prices.find((p) => p.id === id)?.badge?.label ?? '';
}

function verdictPill(e: CompareEntry, priceUsdPerT: number) {
  if (e.breakevenUsdPerT === null) return DASH;
  return pays(e, priceUsdPerT) ? (
    <VerdictPill verdict="ok">Covered at {usdPrice(priceUsdPerT)}</VerdictPill>
  ) : (
    <VerdictPill verdict="short">Short by {usdPerT(e.breakevenUsdPerT - priceUsdPerT)}</VerdictPill>
  );
}

function SideBySide({ entries, view }: { entries: CompareEntry[]; view: MineView }) {
  if (entries.length < MIN_COMPARED) {
    return (
      <p className="t-body">
        Choose {MIN_COMPARED} or {MAX_COMPARED} entries in the ranked list to compare them here.
      </p>
    );
  }
  const streamRow = (kind: 'drained' | 'vam' | 'amm') => (e: CompareEntry) => {
    const s = e.result.streams.find((x) => x.kind === kind);
    return s && s.status === 'ok' && s.breakevenUsdPerT !== null ? usdPerT(s.breakevenUsdPerT) : DASH;
  };
  const rows: { label: string; cell: (e: CompareEntry) => string }[] = [
    {
      label: 'Break-even credit price',
      cell: (e) => (e.breakevenUsdPerT === null ? DASH : usdPerT(e.breakevenUsdPerT)),
    },
    { label: `Credits over ${view.creditingYears} years`, cell: (e) => tonnes(e.erTotalTco2e) },
    {
      label: `Net present value at ${usdPrice(view.priceUsdPerT)}`,
      cell: (e) => (e.breakevenUsdPerT === null ? DASH : usdM(e.npvUsd)),
    },
    { label: 'Build cost', cell: (e) => (e.breakevenUsdPerT === null ? DASH : usdM(e.capexUsd)) },
    { label: 'Last year of mining', cell: (e) => String(e.closureYear) },
    { label: 'Drained gas break-even', cell: streamRow('drained') },
    { label: 'Ventilation air break-even', cell: streamRow('vam') },
    { label: 'After closure break-even', cell: streamRow('amm') },
  ];
  return (
    <div className="compare-table-wrap">
      <table className="compare-table compare-side" data-testid="side-by-side">
        <thead>
          <tr>
            <td />
            {entries.map((e) => (
              <th key={e.id} scope="col">
                <a href={mineHref(e.id, { p: view.priceUsdPerT })}>{e.name}</a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {entries.map((e) => (
                <td key={e.id} className="num">
                  {r.cell(e)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

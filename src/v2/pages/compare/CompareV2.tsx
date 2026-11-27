import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mineHref, routeHref } from '../../../app/router';
import { splitLines } from '../../../components/charts/SupplyCurve';
import { PriceControl, type PriceChip } from '../../../components/inputs/PriceControl';
import { getPrices } from '../../../data/load';
import type { PriceScenario } from '../../../data/schemas';
import { DASH, pct, tonnes, usdM, usdPerT } from '../../../lib/format';
import { PRICE_INPUT_USD_PER_T, PRICE_SLIDER_USD_PER_T } from '../../../pages/MinePage/controls';
import { usdPrice } from '../../../pages/MinePage/copy';
import { useElementWidth } from '../../../pages/MinePage/useElementWidth';
import { scenarioLines, viewContext } from '../../../pages/ComparePage/compare';
import '../../../pages/ComparePage/compare.css';
import { getOverrides, subscribe as subscribeOverrides } from '../../../state/session';
import {
  createQueryWriter,
  currentHashPath,
  currentQuery,
  decodeMineView,
  encodeMineView,
  type MineView,
} from '../../../state/url';
import { Card, Chip, VerdictPill } from '../../../ui';
import '../pages.css';
import {
  MAX_COMPARED,
  MIN_COMPARED,
  archetypeRows,
  chartTopUsdPerT,
  compareBase,
  defaultSelection,
  headlineFor,
  headlineSentence,
  modelMines,
  parseSelection,
  paysAt,
  rankRows,
  subsidiaryCounts,
  supplyBarsV2,
  type CompareRow,
} from './entries';
import { SupplyCurveV2, oneLine } from './SupplyCurveV2';

const SELECTION_KEY = 'sel';
const SUBSIDIARY_KEY = 'sub';
const ARCHETYPE_KEY = 'arch';
const ALL = 'all';
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

function badgeFor(prices: readonly PriceScenario[], id: string): string {
  return prices.find((p) => p.id === id)?.badge?.label ?? '';
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

interface QueryState {
  view: MineView;
  selection: string[] | null;
  subsidiary: string;
  archetypes: boolean;
}

function queryFor(s: QueryState): URLSearchParams {
  const q = encodeMineView(s.view);
  if (s.selection !== null) q.set(SELECTION_KEY, s.selection.join(','));
  if (s.subsidiary !== ALL) q.set(SUBSIDIARY_KEY, s.subsidiary);
  if (s.archetypes) q.set(ARCHETYPE_KEY, '1');
  return q;
}

/** The tag every estimated mine carries (DESIGN_V2 "Copy"), or the tag for a mine with a record. */
export function InputsTag({ source }: { source: CompareRow['source'] }) {
  if (source === 'estimate') return <span className="tag tag-estimated">Estimated inputs</span>;
  if (source === 'record') return <span className="tag tag-illustrative">Illustrative inputs</span>;
  return null;
}

export function CompareV2() {
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const base = useMemo(() => compareBase(overrides), [overrides]);
  const ctx = useMemo(() => viewContext(base), [base]);

  const [path] = useState(currentHashPath);
  const [view, setView] = useState<MineView>(() => decodeMineView(currentQuery(), ctx));
  const [subsidiary, setSubsidiary] = useState<string>(() => currentQuery().get(SUBSIDIARY_KEY) ?? ALL);
  const [archetypes, setArchetypes] = useState<boolean>(() => currentQuery().get(ARCHETYPE_KEY) === '1');
  const writer = useMemo(() => createQueryWriter(), []);

  const modelled = useMemo(() => modelMines(base, view, overrides), [base, view, overrides]);
  const archetypeSet = useMemo(() => archetypeRows(view, overrides), [view, overrides]);
  const subsidiaries = useMemo(() => subsidiaryCounts(modelled.rows), [modelled.rows]);
  const knownIds = useMemo(() => [...modelled.rows, ...archetypeSet].map((r) => r.id), [modelled.rows, archetypeSet]);
  const [selection, setSelection] = useState<string[] | null>(() =>
    parseSelection(currentQuery().get(SELECTION_KEY), knownIds),
  );

  // The user loads another link (paste, back or forward): read the page state again.
  useEffect(() => {
    const onHash = () => {
      if (currentHashPath() !== path) return;
      writer.cancel();
      const q = currentQuery();
      setView(decodeMineView(q, ctx));
      setSelection(parseSelection(q.get(SELECTION_KEY), knownIds));
      setSubsidiary(q.get(SUBSIDIARY_KEY) ?? ALL);
      setArchetypes(q.get(ARCHETYPE_KEY) === '1');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ctx, knownIds, path, writer]);
  useEffect(() => () => writer.cancel(), [writer]);

  const commit = (next: Partial<QueryState>) => {
    const state: QueryState = { view, selection, subsidiary, archetypes, ...next };
    setView(state.view);
    setSelection(state.selection);
    setSubsidiary(state.subsidiary);
    setArchetypes(state.archetypes);
    writer.write(path, queryFor(state));
  };

  const rows = useMemo(() => {
    const real = subsidiary === ALL ? modelled.rows : modelled.rows.filter((r) => r.subsidiary === subsidiary);
    return rankRows(archetypes && subsidiary === ALL ? [...real, ...archetypeSet] : real);
  }, [modelled.rows, archetypeSet, subsidiary, archetypes]);

  const bars = useMemo(() => supplyBarsV2(rows, view.priceUsdPerT), [rows, view.priceUsdPerT]);
  const summary = useMemo(
    () => headlineFor(rows, view.priceUsdPerT, view.creditingYears),
    [rows, view.priceUsdPerT, view.creditingYears],
  );
  const noun = `${subsidiary === ALL ? '' : `${subsidiary} `}mines${archetypes && subsidiary === ALL ? ' and archetypes' : ''}`;
  const sentence = headlineSentence(summary, usdPrice(view.priceUsdPerT), noun);

  const prices = getPrices();
  const chips = useMemo(() => priceChips(prices), [prices]);
  const allLines = useMemo(() => scenarioLines(prices, usdPrice), [prices]);
  const topUsdPerT = chartTopUsdPerT(view.priceUsdPerT);
  const { drawn, offScale } = useMemo(() => splitLines(allLines, [0, topUsdPerT]), [allLines, topUsdPerT]);
  const runOffTop = bars.filter((b) => b.breakevenUsdPerT > topUsdPerT).length;

  const shownIds = rows.map((r) => r.id);
  const shown = (selection ?? defaultSelection(rows)).filter((id) => shownIds.includes(id));
  const toggle = (id: string) => {
    const next = shown.includes(id) ? shown.filter((s) => s !== id) : [...shown, id].slice(0, MAX_COMPARED);
    commit({ selection: next });
  };

  const [chartRef, chartWidth] = useElementWidth(FALLBACK_CHART_WIDTH_PX);
  const focusRow = rows.find((r) => r.source === 'record');
  const customView =
    view.closureYear !== base.defaults.closureYear ||
    view.vamConc !== base.defaults.vamConc ||
    view.drainedMm3PerYr !== base.defaults.drainedMm3PerYr ||
    view.drainedUse !== base.defaults.drainedUse;
  const estimatedCount = rows.filter((r) => r.source === 'estimate').length;

  return (
    <div className="page-width compare-page">
      <div className="compare-title">
        <span className="eyebrow">Compare</span>
        <h1 className="t-h1 compare-h1">Which mines pay?</h1>
        <p className="t-lede compare-headline" data-testid="headline" aria-live="polite">
          {sentence}
        </p>
      </div>

      <div className="compare-layout">
        <aside className="compare-panel" aria-label="Credit price and filters">
          <PriceControl
            priceUsdPerT={view.priceUsdPerT}
            valueText={`${usdPrice(view.priceUsdPerT)} / t`}
            onChange={(p) => commit({ view: { ...view, priceUsdPerT: p } })}
            slider={PRICE_SLIDER_USD_PER_T}
            input={PRICE_INPUT_USD_PER_T}
            chips={chips}
            note="No public price exists yet for coal mine methane credits. The chips are benchmarks and our estimates. CCTS is India's Carbon Credit Trading Scheme."
          />
          <div className="field v2-filter" role="group" aria-label="Subsidiary">
            <span className="field-label">Subsidiary</span>
            <div className="v2-chip-row">
              <Chip pressed={subsidiary === ALL} onPressedChange={() => commit({ subsidiary: ALL })}>
                All
              </Chip>
              {subsidiaries.map((s) => (
                <Chip
                  key={s.subsidiary}
                  pressed={subsidiary === s.subsidiary}
                  onPressedChange={() => commit({ subsidiary: subsidiary === s.subsidiary ? ALL : s.subsidiary })}
                >
                  {`${s.subsidiary} (${s.count})`}
                </Chip>
              ))}
            </div>
          </div>
          <div className="field v2-filter">
            <span className="field-label">Archetypes</span>
            <div className="v2-chip-row">
              <Chip pressed={archetypes} onPressedChange={(next) => commit({ archetypes: next })}>
                Show the five archetypes
              </Chip>
            </div>
            <p className="control-note">
              Archetypes are the five typical mines from version 1. They have no place on the map.
            </p>
          </div>
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
              <SupplyCurveV2
                width={chartWidth}
                bars={bars}
                priceUsdPerT={view.priceUsdPerT}
                priceLabel={`Your price ${usdPrice(view.priceUsdPerT)}`}
                lines={allLines}
                topUsdPerT={topUsdPerT}
                formatPrice={usdPrice}
                formatCredits={tonnes}
                markedIds={shown}
                ariaLabel={`Supply curve: ${bars.length} ${noun} sorted by the credit price each needs to break even, against your price of ${usdPrice(view.priceUsdPerT)} a tonne.`}
              />
            </div>
            <p className="control-note">
              Bar width is the credits over {view.creditingYears} years in tonnes of CO2e (carbon dioxide equivalent).
              Bar height is the credit price needed to break even. The ten cheapest are named. Hover a bar to see its
              mine, and click it to open the mine.
              {runOffTop > 0
                ? ` ${runOffTop} ${runOffTop === 1 ? 'mine needs' : 'mines need'} more than ${usdPrice(topUsdPerT)} a tonne, so ${runOffTop === 1 ? 'its bar runs' : 'their bars run'} off the top of the chart. The ranked list below gives every price.`
                : ''}
            </p>
            <ul className="compare-lines" aria-label="Price scenario lines">
              {drawn.map((l) => (
                <li key={l.id}>
                  <span>{l.label}</span>
                  <span className="compare-badge">{badgeFor(prices, l.id)}</span>
                </li>
              ))}
            </ul>
            {offScale.length > 0 ? (
              <p className="control-note">
                Above this chart: {offScale.map((l) => `${l.label}, ${lowerFirst(badgeFor(prices, l.id))}`).join('; ')}.
              </p>
            ) : null}
            {focusRow && customView ? (
              <p className="control-note" data-testid="focus-note">
                {focusRow.name} uses the settings in this link: last year of mining {focusRow.closureYear}, ventilation
                air at {pct(view.vamConc, 1)} methane.{' '}
                <a href={mineHref(focusRow.id, Object.fromEntries(encodeMineView(view)))}>Change them on the mine page</a>.
              </p>
            ) : null}
          </Card>

          <Card as="section" className="compare-rank-card">
            <h2 className="compare-card-title">Ranked by break-even</h2>
            <p className="control-note" data-testid="inputs-note">
              {estimatedCount > 0 ? (
                <>
                  {estimatedCount} of these {estimatedCount === 1 ? 'mine runs' : 'mines run'} on{' '}
                  <span className="tag tag-estimated">Estimated inputs</span>: its real output and closure year, with gas
                  set by its coalfield. <a href={routeHref('/method')}>How every mine gets inputs</a>. A mine with a
                  record uses it.
                </>
              ) : (
                'Every mine here uses its own record.'
              )}
            </p>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <caption className="sr-only">
                  Mines ranked by break-even credit price. Choose up to {MAX_COMPARED} to compare.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Compare</th>
                    <th scope="col" className="num-col">
                      #
                    </th>
                    <th scope="col">Mine</th>
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
                  {rows.map((r, i) => {
                    const checked = shown.includes(r.id);
                    return (
                      <tr key={r.id} data-testid={`rank-${r.id}`}>
                        <td>
                          <input
                            type="checkbox"
                            className="compare-check"
                            aria-label={`Compare ${oneLine(r.name)}`}
                            checked={checked}
                            disabled={!checked && shown.length >= MAX_COMPARED}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                        <td className="num num-col">{i + 1}</td>
                        <th scope="row">
                          {r.source === 'archetype' ? (
                            oneLine(r.name)
                          ) : (
                            <a href={mineHref(r.id, { p: view.priceUsdPerT })}>{oneLine(r.name)}</a>
                          )}
                          <span className="compare-kind">
                            {r.subsidiary}
                            {r.warnings.includes('closure_uncertain') ? ', closing year uncertain' : ''}{' '}
                            <InputsTag source={r.source} />
                          </span>
                        </th>
                        <td className="num num-col">{usdPerT(r.breakevenUsdPerT)}</td>
                        <td className="num num-col">{tonnes(r.erTotalTco2e)}</td>
                        <td>{verdictPill(r, view.priceUsdPerT)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {subsidiary === ALL ? (
              <p className="control-note" data-testid="not-modelled">
                Of the {modelled.mineCount} operating mines, {modelled.notAbatableCount} cannot be abated with these
                technologies (opencast mines, and Degree I mines, the lowest gassiness grade, whose ventilation air is too
                dilute) and {modelled.noOutputCount} have no recent output. They are on the map but not on this page.
              </p>
            ) : null}
          </Card>

          <Card as="section" className="compare-side-card">
            <h2 className="compare-card-title">Side by side</h2>
            <SideBySide rows={rows.filter((r) => shown.includes(r.id))} view={view} />
          </Card>

          <p className="mine-footnote">
            Results are indicative, at pre-feasibility level, and not investment advice. Have your own mine data?{' '}
            <a href="#/data">Upload it on the Data page</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function verdictPill(r: CompareRow, priceUsdPerT: number) {
  return paysAt(r, priceUsdPerT) ? (
    <VerdictPill verdict="ok">Covered at {usdPrice(priceUsdPerT)}</VerdictPill>
  ) : (
    <VerdictPill verdict="short">Short by {usdPerT(r.breakevenUsdPerT - priceUsdPerT)}</VerdictPill>
  );
}

function SideBySide({ rows, view }: { rows: CompareRow[]; view: MineView }) {
  if (rows.length < MIN_COMPARED) {
    return (
      <p className="t-body">
        Choose {MIN_COMPARED} or {MAX_COMPARED} mines in the ranked list to compare them here.
      </p>
    );
  }
  const streamRow = (kind: 'drained' | 'vam' | 'amm') => (r: CompareRow) => {
    const s = r.result.streams.find((x) => x.kind === kind);
    return s && s.status === 'ok' && s.breakevenUsdPerT !== null ? usdPerT(s.breakevenUsdPerT) : DASH;
  };
  const table: { label: string; cell: (r: CompareRow) => string }[] = [
    { label: 'Break-even credit price', cell: (r) => usdPerT(r.breakevenUsdPerT) },
    { label: `Credits over ${view.creditingYears} years`, cell: (r) => tonnes(r.erTotalTco2e) },
    { label: `Net present value at ${usdPrice(view.priceUsdPerT)}`, cell: (r) => usdM(r.npvUsd) },
    { label: 'Build cost', cell: (r) => usdM(r.capexUsd) },
    { label: 'Last year of mining', cell: (r) => String(r.closureYear) },
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
            {rows.map((r) => (
              <th key={r.id} scope="col">
                {r.source === 'archetype' ? (
                  oneLine(r.name)
                ) : (
                  <a href={mineHref(r.id, { p: view.priceUsdPerT })}>{oneLine(r.name)}</a>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Inputs</th>
            {rows.map((r) => (
              <td key={r.id}>
                <InputsTag source={r.source} />
              </td>
            ))}
          </tr>
          {table.map((t) => (
            <tr key={t.label}>
              <th scope="row">{t.label}</th>
              {rows.map((r) => (
                <td key={r.id} className="num">
                  {t.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

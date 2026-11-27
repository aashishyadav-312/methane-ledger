import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { DASH, pct, tonnes, usdM, usdPerT } from '../../lib/format';
import type { Settings } from '../../model/types';
import { HEADLINE_CAP_USD_PER_T } from '../../pages/MinePage/controls';
import { headlineText, resultSentence, verdict } from '../../pages/MinePage/copy';
import { useElementWidth } from '../../pages/MinePage/useElementWidth';
import type { ResultsProps } from '../contracts';
import { DOCK_PHONE_MARGIN_PX, MINI_W_PHONE_PX, RESULTS_SHEET_RADIUS_PX, RESULTS_SHEET_SHADOW } from '../motion';
import { ClosureChart, type MarketLine } from './charts/ClosureChart';
import { creditsLegendStreams, CreditsChart, STREAM_COLOUR } from './charts/CreditsChart';
import { ChartCard, Legend } from './charts/frame';
import { PriceRulerV2, rulerTicks } from './charts/PriceRulerV2';
import { StructuresChart } from './charts/StructuresChart';
import { TornadoChart } from './charts/TornadoChart';
import { WaterfallChart } from './charts/WaterfallChart';
import {
  CLOSURE_TITLE,
  closureLede,
  footnote,
  inputChips,
  NOT_ABATABLE_PILL,
  notAbatableText,
  SOURCE_TAG,
  STREAM_NAMES,
  usdPrice,
  waterfallNote,
  whoPaysNote,
} from './copy';
import {
  defaultResultsData,
  financeModel,
  priceFreeModel,
  scenarioPrice,
  settingsAtPrice,
  type ResultsData,
} from './model';
import { countProgress, useMorph, useRevealClock } from './motion';
import './results.css';

/**
 * Step 7, item 3: the docked mini map (Appendix E, 184px card at 16px from the top and 24px from the right) sits
 * over the results, so the first 220px from the right of the results' top 240px hold nothing.
 */
export const DOCK_CLEAR_RIGHT_PX = 220;
export const DOCK_CLEAR_TOP_PX = 240;
/** On phones the card is 120px at 12px from the corner (Appendix E, "Phone"). */
export const DOCK_CLEAR_RIGHT_PHONE_PX = MINI_W_PHONE_PX + 2 * DOCK_PHONE_MARGIN_PX;

/** The closure chart's market reference lines (Step 7: "$7 and $11"), by price scenario id in data/prices.json. */
export const CLOSURE_MARKET_IDS = ['vcm_low', 'ccts_floor'] as const;

const FALLBACK_WIDTH_PX = 560;
const USD_UNITS = { perT: usdPerT, price: usdPrice, amount: usdM };

export interface ResultsV2Props extends ResultsProps {
  /**
   * The settings `result` was evaluated with (the panel's grant, discount rate and so on). The charts that the
   * dashboard computes itself (structures, waterfall, tornado, closure curve) use them, at `priceUsdPerT`. Defaults to
   * the default settings, which is what the panel uses until an assumption is changed.
   */
  settings?: Settings;
  /** Model data; defaults to the data files. */
  data?: ResultsData;
}

/** One chart card with its own reveal clock and measured width. */
function RevealCard({
  id,
  title,
  unit,
  wide,
  lede,
  footer,
  children,
}: {
  id: string;
  title: string;
  unit?: string;
  wide?: boolean;
  lede?: string;
  footer?: ReactNode;
  children: (widthPx: number, elapsedMs: number) => ReactNode;
}) {
  const [revealRef, elapsed] = useRevealClock<HTMLElement>();
  const [widthRef, width] = useElementWidth(FALLBACK_WIDTH_PX);
  return (
    <ChartCard id={id} title={title} unit={unit} wide={wide} lede={lede} footer={footer} revealRef={revealRef}>
      <div ref={widthRef} className="v2r-measure">
        {children(width, elapsed)}
      </div>
    </ChartCard>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="v2r-tile" data-testid={testId}>
      <div className="v2r-tile-label">{label}</div>
      <div className="v2r-tile-value">{value}</div>
    </div>
  );
}

/**
 * The results dashboard (PLAN_V2 Step 7, V2-Results): sticky summary, headline, price ruler, five tiles, the
 * closure-year chart, then credits, the break-even waterfall, who could pay and what moves it most.
 */
export function ResultsV2({ mine, input, result, source, priceUsdPerT, onEditInputs, settings, data }: ResultsV2Props) {
  const modelData = useMemo(() => data ?? defaultResultsData(), [data]);
  const runSettings = useMemo(
    () => (settings ? { ...settings, creditPriceUsdPerT: priceUsdPerT } : settingsAtPrice(priceUsdPerT)),
    [settings, priceUsdPerT],
  );
  // The waterfall, tornado and closure curve do not depend on the price: keep them while only the price moves.
  const priceFreeKey = JSON.stringify({ ...runSettings, creditPriceUsdPerT: 0 });
  const priceFree = useMemo(
    () => priceFreeModel(input, JSON.parse(priceFreeKey) as Settings, modelData),
    [input, priceFreeKey, modelData],
  );
  const finance = useMemo(() => financeModel(input, runSettings, modelData), [input, runSettings, modelData]);
  const ticks = useMemo(() => rulerTicks(modelData.prices), [modelData.prices]);
  const markets = useMemo<MarketLine[]>(
    () =>
      CLOSURE_MARKET_IDS.flatMap((id) => {
        const p = scenarioPrice(modelData.prices, id);
        return p ? [{ id, label: p.label, usdPerT: p.usdPerT }] : [];
      }),
    [modelData.prices],
  );

  const be = result.abatable ? result.breakevenUsdPerT : null;
  const v = verdict(result.abatable, be, priceUsdPerT, USD_UNITS);
  const sentence = result.abatable ? resultSentence(result, priceUsdPerT, runSettings.creditingYears, USD_UNITS) : notAbatableText(result.streams);

  const [headRef, headElapsed] = useRevealClock<HTMLElement>();
  const count = countProgress(headElapsed);
  const [beShown, npvShown, irrShown, capexShown, erShown] = useMorph([
    be ?? Number.NaN,
    result.npvUsd,
    result.irr ?? Number.NaN,
    result.capexUsd,
    result.erTotalTco2e,
  ]);
  const headline =
    be === null || be > HEADLINE_CAP_USD_PER_T ? headlineText(be, USD_UNITS) : usdPerT(beShown * count);
  const [rulerRef, rulerWidth] = useElementWidth(FALLBACK_WIDTH_PX);

  const style = {
    '--v2r-clear-right': `${DOCK_CLEAR_RIGHT_PX}px`,
    '--v2r-clear-top': `${DOCK_CLEAR_TOP_PX}px`,
    '--v2r-clear-right-phone': `${DOCK_CLEAR_RIGHT_PHONE_PX}px`,
    // Appendix E: the results sheet scrolls over the map with rounded top corners and a shadow upwards.
    '--v2r-sheet-radius': `${RESULTS_SHEET_RADIUS_PX}px`,
    boxShadow: RESULTS_SHEET_SHADOW,
  } as CSSProperties;

  const streams = creditsLegendStreams(result);
  const w = priceFree.waterfall;

  return (
    <section className="v2r" aria-label={`Results for ${mine.name}`} data-testid="results-v2" style={style}>
      <div className="v2r-bar" data-testid="results-summary">
        <a className="v2r-wordmark" href="#/">
          Methane Ledger
        </a>
        <span className="v2r-bar-rule" aria-hidden="true" />
        <span className="v2r-bar-name">{mine.name}</span>
        <ul className="v2r-chips" aria-label="Inputs">
          {inputChips(input, result, priceUsdPerT).map((c) => (
            <li key={c} className="v2r-chip">
              {c}
            </li>
          ))}
          <li className="tag tag-illustrative v2r-source">{SOURCE_TAG[source]}</li>
        </ul>
        <button type="button" className="v2r-edit" onClick={onEditInputs}>
          Edit inputs
        </button>
      </div>

      <div className="v2r-body">
        <section ref={headRef} className="v2r-head" aria-labelledby="v2r-be-label">
          <h2 id="v2r-be-label" className="v2r-be-label">
            Break-even credit price
          </h2>
          <div className="v2r-be-row">
            <span className="v2r-be-value" data-testid="results-breakeven">
              {headline}
            </span>
            <span className="v2r-be-unit">per tonne of CO2e</span>
            <span className={`pill ${v.kind === 'none' ? 'v2r-pill-none' : `pill-${v.kind}`}`} data-testid="results-verdict">
              {v.kind === 'none' ? NOT_ABATABLE_PILL : v.text}
            </span>
          </div>
          <p className="v2r-sentence" data-testid="results-sentence">
            {sentence}
          </p>
        </section>

        {result.abatable ? (
          <>
            <div ref={rulerRef} className="v2r-measure">
              <PriceRulerV2 width={rulerWidth} breakevenUsdPerT={be} priceUsdPerT={priceUsdPerT} ticks={ticks} />
            </div>

            <div className="v2r-tiles" data-testid="results-tiles">
              <Tile testId="tile-npv" label="Net present value" value={usdM(npvShown * count)} />
              <Tile
                testId="tile-irr"
                label="Return"
                value={Number.isNaN(irrShown) ? DASH : pct(irrShown * count, 1)}
              />
              <Tile
                testId="tile-payback"
                label="Pays back by"
                value={result.paybackYear === null ? DASH : String(result.paybackYear)}
              />
              <Tile testId="tile-capex" label="Build cost" value={usdM(capexShown * count)} />
              <Tile
                testId="tile-credits"
                label={`Credits over ${result.years.length} years`}
                value={tonnes(erShown * count)}
              />
            </div>

            <RevealCard id="chart-closure" title={CLOSURE_TITLE} wide lede={closureLede(mine.name, priceFree.curve)}>
              {(width, elapsed) => (
                <ClosureChart
                  width={width}
                  curve={priceFree.curve}
                  mineName={mine.name}
                  closureYear={input.closureYear}
                  breakevenUsdPerT={be}
                  markets={markets}
                  elapsedMs={elapsed}
                />
              )}
            </RevealCard>

            <div className="v2r-cards">
              <RevealCard
                id="chart-credits"
                title="Credits each year"
                unit="tonnes of CO2e"
                footer={
                  <Legend
                    label="Gas streams"
                    items={streams.map((k) => ({ key: k, label: STREAM_NAMES[k], colour: STREAM_COLOUR[k] }))}
                  />
                }
              >
                {(width, elapsed) => <CreditsChart width={width} result={result} elapsedMs={elapsed} />}
              </RevealCard>

              {w ? (
                <RevealCard
                  id="chart-waterfall"
                  title="What the break-even is made of"
                  unit="$ per tonne of credits"
                  footer={<p className="v2r-note">{waterfallNote(w.capexUsdPerT, w.energyUsdPerT)}</p>}
                >
                  {(width, elapsed) => <WaterfallChart width={width} waterfall={w} elapsedMs={elapsed} />}
                </RevealCard>
              ) : null}

              <RevealCard
                id="chart-structures"
                title="Who could pay for it"
                unit="break-even for each way of paying"
                footer={<p className="v2r-note">{whoPaysNote(finance)}</p>}
              >
                {(width, elapsed) => (
                  <StructuresChart width={width} finance={finance} priceUsdPerT={priceUsdPerT} elapsedMs={elapsed} />
                )}
              </RevealCard>

              {priceFree.tornado.baseUsdPerT !== null ? (
                <RevealCard
                  id="chart-tornado"
                  title="What moves the break-even most"
                  unit="one input at a time"
                  footer={
                    <Legend
                      label="Chart key"
                      items={[
                        { key: 'low', label: 'Low value', colour: 'var(--stream-amm)' },
                        { key: 'high', label: 'High value', colour: 'var(--stream-drained)' },
                      ]}
                    />
                  }
                >
                  {(width, elapsed) => <TornadoChart width={width} tornado={priceFree.tornado} elapsedMs={elapsed} />}
                </RevealCard>
              ) : null}
            </div>
          </>
        ) : null}

        <p className="v2r-footnote" data-testid="results-footnote">
          {footnote(source)}
        </p>
      </div>
    </section>
  );
}

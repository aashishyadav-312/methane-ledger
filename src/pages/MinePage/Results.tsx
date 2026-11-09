import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CashFlow } from '../../components/charts/CashFlow';
import { NpvVsPrice } from '../../components/charts/NpvVsPrice';
import { PriceRuler, type RulerTick } from '../../components/charts/PriceRuler';
import { ReductionsByYear } from '../../components/charts/ReductionsByYear';
import { Tornado } from '../../components/charts/Tornado';
import { Waterfall, type WaterfallStep } from '../../components/charts/Waterfall';
import { STREAM_LABELS } from '../../model/constants';
import type { Explanation } from '../../model/explain';
import type { FinancingResult } from '../../model/financing';
import type { TornadoResult } from '../../model/tornado';
import type { OpexType, Result, StreamKind } from '../../model/types';
import type { Waterfall as WaterfallParts } from '../../model/waterfall';
import { DASH, pct, tonnes as tonnesCo2e, usdPerT } from '../../lib/format';
import { downloadBlob, fileName, svgToPng } from '../../lib/export';
import { MetricGrid, MetricTile, Segmented, VerdictPill } from '../../ui';
import { PRICE_SLIDER_USD_PER_T } from './controls';
import {
  developerDeclinesText,
  EXPLAIN_SYMBOLS,
  FINANCE_STRUCTURES,
  FLOOR_COVERS_TEXT,
  headlineText,
  notAbatableReason,
  resultSentence,
  safetyText,
  structureFacts,
  structureSentence,
  structureTitle,
  techText,
  tornadoRangeText,
  usdPrice,
  verdict,
} from './copy';
import type { Currency, StructureKey, TonneUnit } from './pageState';
import type { StructureView } from './structures';
import type { Units } from './units';
import { useElementWidth } from './useElementWidth';
import type { NpvPoint } from './useMineModel';

const FALLBACK_WIDTH_PX = 400;
const RULER_DOMAIN: [number, number] = [PRICE_SLIDER_USD_PER_T.min, PRICE_SLIDER_USD_PER_T.max];
const TORNADO_ROWS = 6;

/** Structures whose numbers, from Coal India's side, differ from the project's own. */
const OWN_CASH_FLOW: readonly StructureKey[] = ['B', 'C', 'D'];

export interface ResultCardProps {
  result: Result;
  structure: StructureView;
  structureKey: StructureKey;
  paybackYear: number | null;
  priceUsdPerT: number;
  creditingYears: number;
  ticks: RulerTick[];
  offScaleNote: string | null;
  units: Units;
  onUnits: (patch: { currency?: Currency; tonnes?: TonneUnit }) => void;
  explanation: Explanation;
}

export function ResultCard({
  result,
  structure,
  structureKey,
  paybackYear,
  priceUsdPerT,
  creditingYears,
  ticks,
  offScaleNote,
  units,
  onUnits,
  explanation,
}: ResultCardProps) {
  const [rulerRef, rulerWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const be = result.abatable ? structure.breakevenUsdPerT : null;
  const v = verdict(result.abatable, be, priceUsdPerT, units);
  let sentence: string;
  if (!result.abatable) sentence = notAbatableReason(result.streams);
  else if (OWN_CASH_FLOW.includes(structureKey))
    sentence = structureSentence(structure, paybackYear, priceUsdPerT, creditingYears, units);
  else sentence = resultSentence(result, priceUsdPerT, creditingYears, units);

  return (
    <section className="card mine-result" aria-labelledby="mine-be-label">
      <div className="mine-units" aria-label="Units">
        <Segmented<Currency>
          label="Currency"
          hideLabel
          options={[
            { value: 'usd', label: 'US$' },
            { value: 'inr', label: '₹' },
          ]}
          value={units.currency}
          onChange={(currency) => onUnits({ currency })}
        />
        <span className="control-note num mine-fx">at ₹{units.usdToInr} per $, placeholder</span>
        <Segmented<TonneUnit>
          label="Tonnes"
          hideLabel
          options={[
            { value: 'co2e', label: 'tCO2e' },
            { value: 'ch4', label: 'tCH4' },
          ]}
          value={units.tonneUnit}
          onChange={(tonnes) => onUnits({ tonnes })}
        />
      </div>
      <div className="mine-result-head">
        <div className="mine-be">
          <h2 id="mine-be-label" className="mine-be-label">
            Break-even credit price
            {structureKey !== 'A' ? (
              <span className="mine-be-for">, {structureTitle(structureKey).toLowerCase()}</span>
            ) : null}
          </h2>
          <div className="mine-be-value">
            <span className="t-headline" data-testid="breakeven">
              {headlineText(be, units)}
            </span>
            <span className="mine-be-unit">per tonne CO2e</span>
          </div>
        </div>
        {v.kind === 'none' ? (
          <span className="pill pill-none">{v.text}</span>
        ) : (
          <VerdictPill verdict={v.kind}>{v.text}</VerdictPill>
        )}
      </div>
      {result.abatable ? (
        <ExplainPanel
          explanation={explanation}
          units={units}
          creditingYears={creditingYears}
          firstYear={result.years[0]?.year ?? null}
          structureKey={structureKey}
          structureBreakevenUsdPerT={be}
        />
      ) : null}
      <p className="mine-sentence" data-testid="sentence">
        {sentence}
      </p>
      <div ref={rulerRef}>
        <PriceRuler
          width={rulerWidth}
          domainUsdPerT={RULER_DOMAIN}
          breakevenUsdPerT={be}
          priceUsdPerT={priceUsdPerT}
          priceText={usdPrice(priceUsdPerT)}
          breakevenText={be === null ? DASH : usdPerT(be)}
          ticks={ticks}
          ariaLabel="Break-even price, your price and market prices on one scale, US$ a tonne"
        />
      </div>
      {offScaleNote ? <p className="control-note">{offScaleNote}</p> : null}
    </section>
  );
}

/** One term of the formula as a symbol: `K`, `PV<sub>r</sub>(running cost)`. */
function Symbol({ k }: { k: keyof typeof EXPLAIN_SYMBOLS }) {
  const s = EXPLAIN_SYMBOLS[k];
  return (
    <span className="explain-symbol">
      {s.main}
      {s.sub ? <sub>{s.sub}</sub> : null}
      {s.wrap ? `(${s.wrap})` : null}
    </span>
  );
}

function ExplainPanel({
  explanation: e,
  units,
  creditingYears,
  firstYear,
  structureKey,
  structureBreakevenUsdPerT,
}: {
  explanation: Explanation;
  units: Units;
  creditingYears: number;
  firstYear: number | null;
  structureKey: StructureKey;
  structureBreakevenUsdPerT: number | null;
}) {
  const termValue = (t: Explanation['numerator'][number]): string =>
    t.unit === 'USD' ? units.amount(t.value) : t.unit === 'tCO2e' ? tonnesCo2e(t.value) : t.value.toFixed(2);
  const joinSigned = (nodes: (pos: boolean, i: number) => ReactNode) =>
    e.numerator.map((t, i) => {
      const pos = t.value >= 0;
      const op = i === 0 ? (pos ? '' : '− ') : pos ? ' + ' : ' − ';
      return (
        <Fragment key={t.key}>
          {op}
          {nodes(pos, i)}
        </Fragment>
      );
    });
  const terms = [...e.numerator, ...e.denominator];
  return (
    <details className="mine-explain" data-testid="explain">
      <summary className="mine-explain-summary">Explain this number</summary>
      <div className="mine-explain-body">
        <p className="explain-formula">
          P<sub>*</sub> = ({joinSigned((_, i) => <Symbol k={e.numerator[i].key} />)}) ÷ (
          {e.denominator.map((t, i) => (
            <Fragment key={t.key}>
              {i > 0 ? ' × ' : ''}
              <Symbol k={t.key} />
            </Fragment>
          ))}
          )
        </p>
        <p className="explain-formula num">
          = ({joinSigned((_, i) => units.amount(Math.abs(e.numerator[i].value)))}) ÷ (
          {e.denominator.map((t, i) => `${i > 0 ? ' × ' : ''}${termValue(t)}`).join('')})
        </p>
        <p className="explain-formula num">
          = {units.amount(e.numeratorUsd)} ÷ {tonnesCo2e(e.denominatorTco2e)} ={' '}
          <strong>{e.breakevenUsdPerT === null ? DASH : units.perT(e.breakevenUsdPerT)}</strong> a tonne
        </p>
        <dl className="explain-terms">
          {terms.map((t) => (
            <div key={t.key} className="explain-term">
              <dt>
                <Symbol k={t.key} />
              </dt>
              <dd>
                {t.label}: <span className="num">{termValue(t)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="control-note">
          PV<sub>r</sub> is the present value at a {pct(e.discountRate, 0)} discount rate
          {firstYear === null ? '' : `, over ${creditingYears} years from ${firstYear}`}. b is the broker&apos;s share
          of the price. Credit prices rise {pct(e.priceEscalation, 0)} a year, so P<sub>*</sub> is the first-year price.
        </p>
        {OWN_CASH_FLOW.includes(structureKey) && structureBreakevenUsdPerT !== null ? (
          <p className="control-note">
            This is the break-even for the project as a whole. With {structureTitle(structureKey).toLowerCase()}, the
            price Coal India needs is {units.perT(structureBreakevenUsdPerT)}.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export interface MetricsProps {
  result: Result;
  structure: StructureView;
  structureKey: StructureKey;
  paybackYear: number | null;
  grantShare: number;
  units: Units;
}

const UPFRONT_NOTE: Partial<Record<StructureKey, string>> = {
  B: 'the developer pays the build cost',
  C: "build cost less the buyer's prepayment",
  D: 'build cost plus the floor premium',
};

export function Metrics({ result, structure, structureKey, paybackYear, grantShare, units }: MetricsProps) {
  const first = result.years[0];
  const last = result.years[result.years.length - 1];
  const buildYear = first ? first.year - 1 : null;
  const own = OWN_CASH_FLOW.includes(structureKey);
  const tonneNote = units.tonneUnit === 'ch4' ? 'CH4 destroyed' : 'CO2e';
  return (
    <div className="mine-metrics" data-testid="metrics">
      <MetricGrid columns={3}>
        <MetricTile
          label="Net present value"
          value={units.amount(structure.npvUsd)}
          note={own ? 'to Coal India, at your price' : 'at your price'}
        />
        <MetricTile label="Return (IRR)" value={pct(structure.irr, 1)} note={own ? 'to Coal India' : 'before tax'} />
        <MetricTile
          label="Pays back by"
          value={paybackYear === null ? DASH : String(paybackYear)}
          note={
            structure.upfrontUsd <= 0 ? 'nothing to pay back' : buildYear === null ? '' : `build in ${buildYear}`
          }
        />
        {own ? (
          <MetricTile
            label="Coal India pays up front"
            value={units.amount(Math.max(0, structure.upfrontUsd))}
            note={UPFRONT_NOTE[structureKey] ?? ''}
          />
        ) : (
          <MetricTile
            label="Build cost"
            value={units.amount(result.capexUsd)}
            note={grantShare > 0 ? `after the ${pct(grantShare, 0)} grant` : 'plant, drainage and monitoring'}
          />
        )}
        <MetricTile
          label={first ? `Credits in ${first.year}` : 'Credits in the first year'}
          value={units.tonnes(result.erYear1Tco2e)}
          note={tonneNote}
        />
        <MetricTile
          label={`Credits, ${result.years.length} years`}
          value={units.tonnes(result.erTotalTco2e)}
          note={first && last ? `${first.year} to ${last.year}` : ''}
        />
      </MetricGrid>
    </div>
  );
}

/** "Save as PNG" for the chart inside `target`. */
function SavePng({ target, title, file }: { target: () => HTMLElement | null; title: string; file: string }) {
  const [failed, setFailed] = useState(false);
  const save = async () => {
    const svg = target()?.querySelector('svg');
    if (!svg) return;
    try {
      setFailed(false);
      downloadBlob(file, await svgToPng(svg, { title }));
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-link mine-png" onClick={save} aria-label={`Save chart as PNG: ${title}`}>
        Save as PNG
      </button>
      {failed ? (
        <span className="control-note" role="status">
          The image could not be saved in this browser.
        </span>
      ) : null}
    </>
  );
}

interface ChartCardProps {
  id: string;
  title: string;
  unit: string;
  fileStem: string[];
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

function ChartCard({ id, title, unit, fileStem, className = '', children, footer }: ChartCardProps) {
  const box = useRef<HTMLDivElement | null>(null);
  return (
    <section className={`card mine-chart ${className}`} aria-labelledby={id} data-testid={id}>
      <div className="mine-chart-head">
        <h2 id={id} className="mine-card-title">
          {title}
        </h2>
        <span className="mine-chart-tools">
          <span className="num mine-chart-unit">{unit}</span>
          <SavePng target={() => box.current} title={title} file={fileName([...fileStem, title], 'png')} />
        </span>
      </div>
      <div ref={box}>{children}</div>
      {footer}
    </section>
  );
}

export interface ChartsProps {
  result: Result;
  npvCurve: NpvPoint[];
  priceUsdPerT: number;
  discountRate: number;
  units: Units;
  fileStem: string[];
}

export function Charts({ result, npvCurve, priceUsdPerT, discountRate, units, fileStem }: ChartsProps) {
  const [barsRef, barsWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const [npvRef, npvWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const years = result.years.map((y) => ({
    year: y.year,
    drained: units.toTonnes(y.byStream.drained.erTco2e),
    vam: units.toTonnes(y.byStream.vam.erTco2e),
    amm: units.toTonnes(y.byStream.amm.erTco2e),
  }));
  const maxTotal = Math.max(0, ...result.years.map((y) => y.erTco2e));
  const hasAmm = years.some((y) => y.amm > 0);
  return (
    <div className="mine-charts">
      <ChartCard
        id="chart-credits"
        title="Credits each year"
        unit={`top ${units.tonnes(maxTotal)} ${units.tonneSuffix}`}
        fileStem={fileStem}
        footer={
          <ul className="chart-legend" aria-label="Gas streams">
            {(['drained', 'vam', 'amm'] as StreamKind[])
              .filter((k) => k !== 'amm' || hasAmm)
              .map((k) => (
                <li key={k} className="legend-item">
                  <span className="legend-key" style={{ background: `var(--stream-${k})` }} aria-hidden="true" />
                  {STREAM_LABELS[k]}
                </li>
              ))}
          </ul>
        }
      >
                  <div ref={barsRef}>
            <ReductionsByYear
              width={barsWidth}
              years={years}
              activeYears={result.activeYears}
              labels={STREAM_LABELS}
              formatTonnes={tonnesCo2e}
              ariaLabel={`Credits each year by gas stream, tonnes ${units.tonneSuffix}`}
            />
          </div>
      </ChartCard>
      <ChartCard
        id="chart-npv"
        title="Net present value by credit price"
        unit={units.amountUnit}
        fileStem={fileStem}
        footer={
          <p className="control-note">
            Above the line the project earns more than it costs, at a {pct(discountRate, 0)} discount rate. The dot is
            your price.
          </p>
        }
      >
                  <div ref={npvRef}>
            <NpvVsPrice
              width={npvWidth}
              points={npvCurve}
              priceUsdPerT={priceUsdPerT}
              npvAtPriceUsd={result.npvUsd}
              formatUsd={units.amount}
              formatPrice={usdPrice}
              ariaLabel={`Net present value of the project at each credit price from ${usdPrice(RULER_DOMAIN[0])} to ${usdPrice(RULER_DOMAIN[1])}`}
            />
          </div>
      </ChartCard>
    </div>
  );
}

export interface MoreChartsProps {
  result: Result;
  structure: StructureView;
  structureKey: StructureKey;
  waterfall: WaterfallParts | null;
  tornado: TornadoResult;
  units: Units;
  fileStem: string[];
}

/** The second chart row (Step 8): cash flow, the break-even waterfall and the tornado. */
export function MoreCharts({ result, structure, structureKey, waterfall, tornado, units, fileStem }: MoreChartsProps) {
  const [cashRef, cashWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const [wfRef, wfWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const [tRef, tWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const buildYear = (result.years[0]?.year ?? 1) - 1;
  const cashYears = structure.cashUsd.map((cashUsd, i) => ({
    year: buildYear + i,
    cashUsd,
    cumUsd: structure.cumCashUsd[i],
  }));
  const own = OWN_CASH_FLOW.includes(structureKey);
  const top = tornado.rows.slice(0, TORNADO_ROWS);
  return (
    <div className="mine-charts mine-charts-more" data-testid="charts-more">
      <ChartCard
        id="chart-cash"
        title={own ? 'Cash to Coal India each year' : 'Cash each year'}
        unit={units.amountUnit}
        fileStem={fileStem}
        footer={
          <ul className="chart-legend" aria-label="Chart key">
            <li className="legend-item">
              <span className="legend-key chart-key-cash" aria-hidden="true" />
              Cash in the year
            </li>
            <li className="legend-item">
              <span className="legend-key-line" aria-hidden="true" />
              Running total
            </li>
          </ul>
        }
      >
                  <div ref={cashRef}>
            <CashFlow
              width={cashWidth}
              years={cashYears}
              paybackIndex={structure.paybackIndex}
              formatUsd={units.amount}
              ariaLabel={`${own ? "Coal India's cash" : 'Project cash'} each year from ${buildYear}, with the running total`}
            />
          </div>
      </ChartCard>
      {waterfall ? (
        <ChartCard
          id="chart-waterfall"
          title="What the break-even is made of"
          unit="per tonne CO2e"
          fileStem={fileStem}
          footer={
            <p className="control-note">
              The project as a whole, before financing. Costs push the price up; power sold pulls it down.
            </p>
          }
        >
                      <div ref={wfRef}>
              <Waterfall
                width={wfWidth}
                steps={waterfallSteps(waterfall)}
                totalLabel="Break-even"
                totalUsdPerT={waterfall.totalUsdPerT}
                formatPrice={units.perT}
                ariaLabel={`The project break-even split into ${waterfallSteps(waterfall)
                  .map((st) => st.label.toLowerCase())
                  .join(', ')}, per tonne CO2e`}
              />
            </div>
        </ChartCard>
      ) : null}
      {tornado.baseUsdPerT !== null ? (
        <ChartCard
          id="chart-tornado"
          title="What moves the break-even most"
          unit="per tonne CO2e"
          className="mine-chart-wide"
          fileStem={fileStem}
          footer={
            <ul className="chart-legend" aria-label="Chart key">
              <li className="legend-item">
                <span className="legend-key chart-key-low" aria-hidden="true" />
                Low value
              </li>
              <li className="legend-item">
                <span className="legend-key chart-key-high" aria-hidden="true" />
                High value
              </li>
              <li className="legend-item">One input at a time; the rest stay at your settings.</li>
            </ul>
          }
        >
                      <div ref={tRef} data-testid="tornado">
              <Tornado
                width={tWidth}
                rows={top.map((r) => ({
                  key: r.key,
                  label: r.label,
                  rangeText: tornadoRangeText(r, units),
                  lowCaseUsdPerT: r.lowCaseUsdPerT,
                  highCaseUsdPerT: r.highCaseUsdPerT,
                }))}
                baseUsdPerT={tornado.baseUsdPerT!}
                formatPrice={units.perT}
                ariaLabel={`The ${top.length} inputs that move the project break-even most, each at a low and a high value`}
              />
            </div>
        </ChartCard>
      ) : null}
    </div>
  );
}

/** Running-cost parts on the cost build-up, in the order of Appendix G. */
const OPEX_PART_LABELS: Record<OpexType, string> = {
  om: 'Operation and maintenance',
  overhaul: 'Engine overhauls',
  staff: 'Staff',
  insurance: 'Insurance',
  fan_power: 'Fan power',
  decommissioning: 'Decommissioning',
};

/** The waterfall rows: one running-cost row on v1, its parts on the cost build-up (parts that are zero drop out). */
export function waterfallSteps(w: WaterfallParts): WaterfallStep[] {
  const parts = w.opexPartsUsdPerT;
  const opex: WaterfallStep[] = parts
    ? (Object.keys(OPEX_PART_LABELS) as OpexType[])
        .filter((t) => parts[t] !== 0)
        .map((t) => ({ key: `opex-${t}`, label: OPEX_PART_LABELS[t], valueUsdPerT: parts[t] }))
    : [{ key: 'opex', label: 'Running cost', valueUsdPerT: w.opexUsdPerT }];
  return [
    { key: 'capex', label: 'Build cost', valueUsdPerT: w.capexUsdPerT },
    ...opex,
    { key: 'mrv', label: 'Monitoring', valueUsdPerT: w.mrvUsdPerT },
    { key: 'fees', label: 'Issuance fees', valueUsdPerT: w.feesUsdPerT },
    { key: 'energy', label: 'Power sold', valueUsdPerT: w.energyUsdPerT },
  ];
}

export function StreamTable({ result, units }: { result: Result; units: Units }) {
  return (
    <section className="card mine-streams" aria-labelledby="mine-streams-title">
      <h2 id="mine-streams-title" className="mine-card-title">
        Where the credits come from
      </h2>
      <div className="mine-table-wrap">
        <table className="mine-table">
          <thead>
            <tr>
              <th scope="col">Gas stream</th>
              <th scope="col">How it is destroyed</th>
              <th scope="col" className="num-col">
                {units.tonneUnit === 'ch4' ? 'CH4 destroyed' : 'Credits'}, {result.years.length} years
              </th>
              <th scope="col" className="num-col">
                Break-even
              </th>
            </tr>
          </thead>
          <tbody>
            {result.streams.map((s) => {
              const safety = safetyText(s);
              return (
                <Fragment key={s.kind}>
                  <tr>
                    <th scope="row">
                      <span className="mine-stream-name">
                        <span
                          className="legend-key"
                          style={{ background: `var(--stream-${s.kind})` }}
                          aria-hidden="true"
                        />
                        {s.label}
                      </span>
                    </th>
                    <td className="mine-stream-tech">{techText(s)}</td>
                    <td className="num num-col">{s.status === 'ok' ? units.tonnes(s.erTotalTco2e) : DASH}</td>
                    <td className="num num-col mine-stream-be">
                      {s.status === 'ok' && s.breakevenUsdPerT !== null ? units.perT(s.breakevenUsdPerT) : 'n/a'}
                    </td>
                  </tr>
                  {safety ? (
                    <tr className="mine-safety">
                      <td colSpan={4}>
                        <strong>{safety}</strong>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="control-note">
        A stream&apos;s break-even counts its own plant and running costs only, without monitoring, verification or
        fees.
      </p>
    </section>
  );
}

export interface WhoPaysProps {
  fin: FinancingResult;
  structureKey: StructureKey;
  priceUsdPerT: number;
  units: Units;
  onPick: (key: StructureKey) => void;
  /** Moves focus to the grant control in the panel. */
  onShowGrant: () => void;
}

export function WhoPays({ fin, structureKey, priceUsdPerT, units, onPick, onShowGrant }: WhoPaysProps) {
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = FINANCE_STRUCTURES.find((f) => f.key === structureKey) ?? FINANCE_STRUCTURES[0];
  const facts = structureFacts(fin, structureKey, units);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    let next: number | null = step === 0 ? null : (i + step + FINANCE_STRUCTURES.length) % FINANCE_STRUCTURES.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = FINANCE_STRUCTURES.length - 1;
    if (next === null) return;
    e.preventDefault();
    onPick(FINANCE_STRUCTURES[next].key);
    radios.current[next]?.focus();
  };

  // Split E's description at "the grant control" so it can be a link to that control.
  const grantPhrase = 'the grant control';
  const at = chosen.key === 'E' ? chosen.description.indexOf(grantPhrase) : -1;

  return (
    <section className="card mine-who" aria-labelledby="mine-who-title" data-testid="who-pays">
      <h2 id="mine-who-title" className="mine-card-title">
        Who could pay for it
      </h2>
      <div className="mine-who-grid" role="radiogroup" aria-labelledby="mine-who-title">
        {FINANCE_STRUCTURES.map((f, i) => {
          const on = f.key === structureKey;
          return (
            <button
              key={f.key}
              ref={(el) => void (radios.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="mine-who-item"
              onClick={() => onPick(f.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="num mine-who-key">{f.key}</span>
              <span className="mine-who-title">{f.title}</span>
            </button>
          );
        })}
      </div>
      <p className="mine-who-text" data-testid="structure-text">
        {at >= 0 ? (
          <>
            {chosen.description.slice(0, at)}
            <button type="button" className="btn btn-link mine-who-link" onClick={onShowGrant}>
              {grantPhrase}
            </button>
            {chosen.description.slice(at + grantPhrase.length)}
          </>
        ) : (
          chosen.description
        )}
      </p>
      {structureKey === 'B' && fin.B.developerDeclines ? (
        <p className="mine-who-alert" role="status" data-testid="developer-declines">
          {developerDeclinesText(priceUsdPerT, fin.B.breakevenForDeveloperUsdPerT, units)}
        </p>
      ) : null}
      {structureKey === 'D' && fin.D.floorCoversAtZero ? <p className="mine-who-note">{FLOOR_COVERS_TEXT}</p> : null}
      {facts.length > 0 ? (
        <div className="mine-who-facts">
          <MetricGrid>
            {facts.map((f) => (
              <MetricTile key={f.label} label={f.label} value={f.value} note={f.note} />
            ))}
          </MetricGrid>
        </div>
      ) : null}
    </section>
  );
}

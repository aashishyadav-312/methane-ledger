import { Fragment } from 'react';
import { NpvVsPrice } from '../../components/charts/NpvVsPrice';
import { PriceRuler, type RulerTick } from '../../components/charts/PriceRuler';
import { ReductionsByYear } from '../../components/charts/ReductionsByYear';
import { STREAM_LABELS } from '../../model/constants';
import type { Result, StreamKind } from '../../model/types';
import { DASH, pct, tonnes, usdM, usdPerT } from '../../lib/format';
import { MetricGrid, MetricTile, VerdictPill } from '../../ui';
import { PRICE_SLIDER_USD_PER_T } from './controls';
import {
  FINANCE_STRUCTURES,
  headlineText,
  notAbatableReason,
  resultSentence,
  safetyText,
  techText,
  usdPrice,
  verdict,
} from './copy';
import { useElementWidth } from './useElementWidth';
import type { NpvPoint } from './useMineModel';

const FALLBACK_WIDTH_PX = 400;
const RULER_DOMAIN: [number, number] = [PRICE_SLIDER_USD_PER_T.min, PRICE_SLIDER_USD_PER_T.max];

export interface ResultCardProps {
  result: Result;
  priceUsdPerT: number;
  creditingYears: number;
  ticks: RulerTick[];
  offScaleNote: string | null;
}

export function ResultCard({ result, priceUsdPerT, creditingYears, ticks, offScaleNote }: ResultCardProps) {
  const [rulerRef, rulerWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const v = verdict(result, priceUsdPerT);
  const be = result.abatable ? result.breakevenUsdPerT : null;
  return (
    <section className="card mine-result" aria-labelledby="mine-be-label">
      <div className="mine-result-head">
        <div className="mine-be">
          <h2 id="mine-be-label" className="mine-be-label">
            Break-even credit price
          </h2>
          <div className="mine-be-value">
            <span className="t-headline" data-testid="breakeven">
              {headlineText(be)}
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
      <p className="mine-sentence" data-testid="sentence">
        {result.abatable ? resultSentence(result, priceUsdPerT, creditingYears) : notAbatableReason(result.streams)}
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

export function Metrics({ result, grantShare }: { result: Result; grantShare: number }) {
  const first = result.years[0];
  const last = result.years[result.years.length - 1];
  const buildYear = first ? first.year - 1 : null;
  return (
    <div className="mine-metrics" data-testid="metrics">
      <MetricGrid columns={3}>
        <MetricTile label="Net present value" value={usdM(result.npvUsd)} note="at your price" />
        <MetricTile label="Return (IRR)" value={pct(result.irr, 1)} note="before tax" />
        <MetricTile
          label="Pays back by"
          value={result.paybackYear === null ? DASH : String(result.paybackYear)}
          note={buildYear === null ? '' : `build in ${buildYear}`}
        />
        <MetricTile
          label="Build cost"
          value={usdM(result.capexUsd)}
          note={grantShare > 0 ? `after the ${pct(grantShare, 0)} grant` : 'plant, drainage and monitoring'}
        />
        <MetricTile
          label={first ? `Credits in ${first.year}` : 'Credits in the first year'}
          value={tonnes(result.erYear1Tco2e)}
          note="CO2e"
        />
        <MetricTile
          label={`Credits, ${result.years.length} years`}
          value={tonnes(result.erTotalTco2e)}
          note={first && last ? `${first.year} to ${last.year}` : ''}
        />
      </MetricGrid>
    </div>
  );
}

export function Charts({
  result,
  npvCurve,
  priceUsdPerT,
  discountRate,
}: {
  result: Result;
  npvCurve: NpvPoint[];
  priceUsdPerT: number;
  discountRate: number;
}) {
  const [barsRef, barsWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const [npvRef, npvWidth] = useElementWidth(FALLBACK_WIDTH_PX);
  const years = result.years.map((y) => ({
    year: y.year,
    drained: y.byStream.drained.erTco2e,
    vam: y.byStream.vam.erTco2e,
    amm: y.byStream.amm.erTco2e,
  }));
  const maxTotal = Math.max(0, ...result.years.map((y) => y.erTco2e));
  const hasAmm = years.some((y) => y.amm > 0);
  return (
    <div className="mine-charts">
      <section className="card mine-chart" aria-labelledby="chart-credits">
        <div className="mine-chart-head">
          <h2 id="chart-credits" className="mine-card-title">
            Credits each year
          </h2>
          <span className="num mine-chart-unit">top {tonnes(maxTotal)} CO2e</span>
        </div>
        <div ref={barsRef}>
          <ReductionsByYear
            width={barsWidth}
            years={years}
            activeYears={result.activeYears}
            labels={STREAM_LABELS}
            formatTonnes={tonnes}
            ariaLabel="Credits each year by gas stream, tonnes CO2e"
          />
        </div>
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
      </section>
      <section className="card mine-chart" aria-labelledby="chart-npv">
        <div className="mine-chart-head">
          <h2 id="chart-npv" className="mine-card-title">
            Net present value by credit price
          </h2>
          <span className="num mine-chart-unit">US$ million</span>
        </div>
        <div ref={npvRef}>
          <NpvVsPrice
            width={npvWidth}
            points={npvCurve}
            priceUsdPerT={priceUsdPerT}
            npvAtPriceUsd={result.npvUsd}
            formatUsd={usdM}
            formatPrice={usdPrice}
            ariaLabel={`Net present value of the project at each credit price from ${usdPrice(RULER_DOMAIN[0])} to ${usdPrice(RULER_DOMAIN[1])}`}
          />
        </div>
        <p className="control-note">
          Above the line the project earns more than it costs, at a {pct(discountRate, 0)} discount rate. The dot is
          your price.
        </p>
      </section>
    </div>
  );
}

export function StreamTable({ result }: { result: Result }) {
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
                Credits, {result.years.length} years
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
                    <td className="num num-col">{s.status === 'ok' ? tonnes(s.erTotalTco2e) : DASH}</td>
                    <td className="num num-col mine-stream-be">
                      {s.status === 'ok' && s.breakevenUsdPerT !== null ? usdPerT(s.breakevenUsdPerT) : 'n/a'}
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
        A stream's break-even counts its own plant and running costs only, without monitoring, verification or fees.
      </p>
    </section>
  );
}

export function WhoPays() {
  return (
    <section className="card mine-who" aria-labelledby="mine-who-title">
      <div className="mine-chart-head">
        <h2 id="mine-who-title" className="mine-card-title">
          Who could pay for it
        </h2>
        <span className="tag tag-dummy">Described, not yet modelled</span>
      </div>
      <ul className="mine-who-grid">
        {FINANCE_STRUCTURES.map((f) => (
          <li key={f.key} className="mine-who-item">
            <span className="num mine-who-key">{f.key}</span>
            <span className="mine-who-title">{f.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

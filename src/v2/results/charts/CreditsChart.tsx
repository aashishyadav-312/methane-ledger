import { scaleBand, scaleLinear } from 'd3-scale';
import { tonnes } from '../../../lib/format';
import type { Result, StreamKind } from '../../../model/types';
import { STREAM_NAMES } from '../copy';
import { barProgress, useMorph } from '../motion';
import { DataTable, growY } from './frame';

const HEIGHT_PX = 260;
const PAD_TOP_PX = 10;
const PAD_BOTTOM_PX = 30;
const PAD_LEFT_PX = 44;
const PAD_RIGHT_PX = 4;
const BAND_PADDING = 0.38;
const Y_TICKS = 3;
const THOUSAND = 1000;

export const STREAM_ORDER: readonly StreamKind[] = ['drained', 'vam', 'amm'];
export const STREAM_COLOUR: Record<StreamKind, string> = {
  drained: 'var(--stream-drained)',
  vam: 'var(--stream-vam)',
  amm: 'var(--stream-amm)',
};

export interface CreditsChartProps {
  width: number;
  result: Result;
  elapsedMs: number;
}

/** `200k`, the axis label for thousands of tonnes. */
function kTonnes(t: number): string {
  return t === 0 ? '0' : `${(t / THOUSAND).toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
}

/** Credits each year, stacked by gas stream, with the year the mine closes marked. */
export function CreditsChart({ width, result, elapsedMs }: CreditsChartProps) {
  const years = result.years;
  const n = years.length;
  const flat = useMorph(years.flatMap((y) => STREAM_ORDER.map((k) => y.byStream[k].erTco2e)));
  const value = (i: number, k: StreamKind) => flat[i * STREAM_ORDER.length + STREAM_ORDER.indexOf(k)];

  const left = PAD_LEFT_PX;
  const right = Math.max(left + 1, width - PAD_RIGHT_PX);
  const bottom = HEIGHT_PX - PAD_BOTTOM_PX;
  const maxT = Math.max(1, ...years.map((y) => y.erTco2e));
  const y = scaleLinear().domain([0, maxT]).nice(Y_TICKS).range([bottom, PAD_TOP_PX]);
  const x = scaleBand<number>()
    .domain(years.map((_, i) => i))
    .range([left, right])
    .paddingInner(BAND_PADDING)
    .paddingOuter(BAND_PADDING / 2);
  const bw = x.bandwidth();
  const step = x.step();
  const short = step < 40;
  const closes = result.activeYears > 0 && result.activeYears < n;
  const closeX = closes ? (x(result.activeYears - 1)! + bw + x(result.activeYears)!) / 2 : null;
  const present = STREAM_ORDER.filter((k) => years.some((yr) => yr.byStream[k].erTco2e > 0));
  const caption = `Credits each year by gas stream, ${years[0]?.year ?? ''} to ${years[n - 1]?.year ?? ''}, tonnes of CO2e`;

  return (
    <div className="v2r-figure">
      <svg className="v2r-svg" width={width} height={HEIGHT_PX} role="img" aria-label={caption}>
        {y.ticks(Y_TICKS).map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'v2r-axis' : 'v2r-grid'} x1={left} x2={right} y1={y(t)} y2={y(t)} />
            <text className="v2r-tick" x={left - 8} y={y(t) + 4} textAnchor="end">
              {kTonnes(t)}
            </text>
          </g>
        ))}
        {years.map((yr, i) => {
          const k = barProgress(elapsedMs, i);
          let base = 0;
          return (
            <g key={yr.year} transform={growY(bottom, k)} data-testid="credits-bar">
              {STREAM_ORDER.map((s) => {
                const v = Math.max(0, value(i, s));
                if (v <= 0) return null;
                const y0 = y(base);
                base += v;
                const y1 = y(base);
                return <rect key={s} x={x(i)} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={STREAM_COLOUR[s]} />;
              })}
            </g>
          );
        })}
        {years.map((yr, i) =>
          !short || i % 2 === 0 || i === n - 1 ? (
            <text key={yr.year} className="v2r-tick" x={x(i)! + bw / 2} y={bottom + 20} textAnchor="middle">
              {`'${String(yr.year).slice(-2)}`}
            </text>
          ) : null,
        )}
        {closeX !== null ? (
          <g>
            <line className="v2r-cross" x1={closeX} x2={closeX} y1={PAD_TOP_PX} y2={bottom} />
            <text
              className="v2r-ref-label"
              x={closeX + (closeX + 90 > right ? -6 : 6)}
              y={PAD_TOP_PX + 12}
              textAnchor={closeX + 90 > right ? 'end' : 'start'}
            >
              Mine closes
            </text>
          </g>
        ) : null}
      </svg>
      <DataTable
        caption={caption}
        head={['Year', ...present.map((k) => STREAM_NAMES[k]), 'Total']}
        rows={years.map((yr) => ({
          key: String(yr.year),
          cells: [yr.year, ...present.map((k) => tonnes(yr.byStream[k].erTco2e)), tonnes(yr.erTco2e)],
        }))}
      />
    </div>
  );
}

export function creditsLegendStreams(result: Result): StreamKind[] {
  return STREAM_ORDER.filter((k) => result.years.some((yr) => yr.byStream[k].erTco2e > 0));
}

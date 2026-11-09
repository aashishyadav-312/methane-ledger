import { scaleBand, scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';

export interface CashFlowYear {
  year: number;
  cashUsd: number;
  /** Running total up to and including this year. */
  cumUsd: number;
}

export interface CashFlowProps {
  width: number;
  /** The build year first, then each crediting year. */
  years: CashFlowYear[];
  /** Index into `years` where the running total first reaches 0, or `null`. */
  paybackIndex: number | null;
  /** For example `$8.6M`. */
  formatUsd: (usd: number) => string;
  ariaLabel: string;
}

const HEIGHT_PX = 220;
const AXIS_PX = 22;
const PAD_PX = 14;
const BAR_GAP = 0.25;
const CORNER_PX = 2;
/** Below this many pixels per year, only every other year is labelled. */
const MIN_LABEL_STEP_PX = 26;

/** Cash each year as bars, the running total as a line, and the year it pays back. */
export function CashFlow({ width, years, paybackIndex, formatUsd, ariaLabel }: CashFlowProps) {
  const plotBottom = HEIGHT_PX - AXIS_PX;
  const x = scaleBand<number>()
    .domain(years.map((y) => y.year))
    .range([0, width])
    .paddingInner(BAR_GAP);
  const values = years.flatMap((y) => [y.cashUsd, y.cumUsd]);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const y = scaleLinear()
    .domain([bottom, top === bottom ? bottom + 1 : top])
    .range([plotBottom - PAD_PX, PAD_PX]);
  const zeroY = y(0);
  const mid = (year: number) => (x(year) ?? 0) + x.bandwidth() / 2;
  const cumPath = line<CashFlowYear>()
    .x((d) => mid(d.year))
    .y((d) => y(d.cumUsd))(years);
  const labelEvery = x.step() < MIN_LABEL_STEP_PX ? 2 : 1;
  const payback = paybackIndex === null ? null : years[paybackIndex];
  const paybackX = payback ? mid(payback.year) : null;

  return (
    <div className="chart">
      <svg className="chart-svg" width={width} height={HEIGHT_PX} role="img" aria-label={ariaLabel}>
        {years.map((d) => {
          const y0 = y(Math.max(0, d.cashUsd));
          const h = Math.abs(y(d.cashUsd) - zeroY);
          if (h === 0) return null;
          return (
            <rect
              key={d.year}
              className={`chart-bar ${d.cashUsd < 0 ? 'chart-cash-neg' : 'chart-cash-pos'}`}
              x={x(d.year) ?? 0}
              y={y0}
              width={x.bandwidth()}
              height={h}
              rx={CORNER_PX}
            />
          );
        })}
        <line className="chart-axis" x1={0} x2={width} y1={zeroY} y2={zeroY} />
        {paybackX !== null && payback ? (
          <g className="chart-mark" style={{ transform: `translateX(${paybackX}px)` }}>
            <line className="chart-close-line" x1={0} x2={0} y1={0} y2={plotBottom} />
            <text
              className="chart-note"
              x={paybackX > width / 2 ? -6 : 6}
              y={10}
              textAnchor={paybackX > width / 2 ? 'end' : 'start'}
            >
              {`Pays back ${payback.year}`}
            </text>
          </g>
        ) : null}
        {cumPath ? <path className="chart-cum-line" d={cumPath} /> : null}
        {years.map((d) => (
          <circle key={d.year} className="chart-cum-dot" cx={mid(d.year)} cy={y(d.cumUsd)} r={3} />
        ))}
        {top > 0 ? (
          <text className="chart-tick num chart-y-label" x={2} y={PAD_PX - 2}>
            {formatUsd(top)}
          </text>
        ) : null}
        {bottom < 0 ? (
          <text className="chart-tick num chart-y-label" x={2} y={plotBottom - 2}>
            {formatUsd(bottom)}
          </text>
        ) : null}
        {years.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.year} className="chart-tick num" x={mid(d.year)} y={HEIGHT_PX - 6} textAnchor="middle">
              {`'${String(d.year).slice(-2)}`}
            </text>
          ) : null,
        )}
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Cash</th>
              <th scope="col">Running total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((d) => (
              <tr key={d.year}>
                <th scope="row">{d.year}</th>
                <td>{formatUsd(d.cashUsd)}</td>
                <td>{formatUsd(d.cumUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

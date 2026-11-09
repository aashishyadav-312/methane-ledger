import { scaleLinear } from 'd3-scale';

export interface WaterfallStep {
  key: string;
  label: string;
  /** Signed: costs push the price up, power sold pulls it down. */
  valueUsdPerT: number;
}

export interface WaterfallProps {
  width: number;
  steps: WaterfallStep[];
  totalLabel: string;
  /** Sum of the steps (the break-even). */
  totalUsdPerT: number;
  /** For example `$8.33`. */
  formatPrice: (usdPerT: number) => string;
  ariaLabel: string;
}

const ROW_PX = 34;
const BAR_PX = 18;
const TOP_PX = 4;
const VALUE_COL_PX = 70;
const LABEL_SHARE = 0.34;
const LABEL_MIN_PX = 92;
const LABEL_MAX_PX = 180;
const GAP_PX = 10;
const CORNER_PX = 2;

/** The break-even built up part by part, one row each, ending at the total. */
export function Waterfall({ width, steps, totalLabel, totalUsdPerT, formatPrice, ariaLabel }: WaterfallProps) {
  const labelW = Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, width * LABEL_SHARE));
  const plotLeft = labelW + GAP_PX;
  const plotRight = Math.max(plotLeft + 1, width - VALUE_COL_PX);
  const starts: number[] = [];
  let run = 0;
  for (const s of steps) {
    starts.push(run);
    run += s.valueUsdPerT;
  }
  const ends = steps.map((s, i) => starts[i] + s.valueUsdPerT);
  const lo = Math.min(0, totalUsdPerT, ...starts, ...ends);
  const hi = Math.max(0, totalUsdPerT, ...starts, ...ends);
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([plotLeft, plotRight]);
  const rows = [
    ...steps.map((s, i) => ({ key: s.key, label: s.label, from: starts[i], to: ends[i], value: s.valueUsdPerT })),
    { key: 'total', label: totalLabel, from: 0, to: totalUsdPerT, value: totalUsdPerT },
  ];
  const height = TOP_PX + rows.length * ROW_PX;
  const rowY = (i: number) => TOP_PX + i * ROW_PX + (ROW_PX - BAR_PX) / 2;

  return (
    <div className="chart">
      <svg className="chart-svg" width={width} height={height} role="img" aria-label={ariaLabel}>
        <line className="chart-axis" x1={x(0)} x2={x(0)} y1={0} y2={height} />
        {rows.map((r, i) => {
          const left = x(Math.min(r.from, r.to));
          const w = Math.max(1, Math.abs(x(r.to) - x(r.from)));
          const kind = r.key === 'total' ? 'chart-wf-total' : r.value < 0 ? 'chart-wf-down' : 'chart-wf-up';
          const next = rows[i + 1];
          return (
            <g key={r.key}>
              <text className="chart-tick chart-row-label" x={0} y={rowY(i) + BAR_PX / 2} dominantBaseline="middle">
                {r.label}
              </text>
              <rect className={`chart-bar ${kind}`} x={left} y={rowY(i)} width={w} height={BAR_PX} rx={CORNER_PX} />
              {next && next.key !== 'total' ? (
                <line
                  className="chart-wf-link"
                  x1={x(r.to)}
                  x2={x(r.to)}
                  y1={rowY(i) + BAR_PX}
                  y2={rowY(i + 1)}
                />
              ) : null}
              <text
                className={`chart-tick num ${r.key === 'total' ? 'chart-wf-total-text' : ''}`}
                x={width}
                y={rowY(i) + BAR_PX / 2}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatPrice(r.value)}
              </text>
            </g>
          );
        })}
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Per tonne</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{formatPrice(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

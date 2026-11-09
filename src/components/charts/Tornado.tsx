import { scaleLinear } from 'd3-scale';
import { DASH } from '../../lib/format';

export interface TornadoBar {
  key: string;
  label: string;
  /** The low and high inputs, for example `$40 to $120 per MWh`. */
  rangeText: string;
  /** Break-even with the input at its low and high value; `null` when there is none. */
  lowCaseUsdPerT: number | null;
  highCaseUsdPerT: number | null;
}

export interface TornadoProps {
  width: number;
  rows: TornadoBar[];
  baseUsdPerT: number;
  /** For example `$8.33`. */
  formatPrice: (usdPerT: number) => string;
  ariaLabel: string;
}

const ROW_PX = 46;
const HALF_BAR_PX = 12;
const TOP_PX = 18;
const VALUE_PAD_PX = 54;
const LABEL_SHARE = 0.34;
const LABEL_MIN_PX = 110;
const LABEL_MAX_PX = 200;
const GAP_PX = 8;
const TEXT_GAP_PX = 4;

/**
 * One row per input: the break-even with that input at its low value (upper bar) and its high value (lower bar),
 * either side of the base break-even. Rows come sorted, widest swing first.
 */
export function Tornado({ width, rows, baseUsdPerT, formatPrice, ariaLabel }: TornadoProps) {
  const labelW = Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, width * LABEL_SHARE));
  const plotLeft = labelW + GAP_PX + VALUE_PAD_PX;
  const plotRight = Math.max(plotLeft + 1, width - VALUE_PAD_PX);
  const cases = rows.flatMap((r) => [r.lowCaseUsdPerT, r.highCaseUsdPerT]).filter((v): v is number => v !== null);
  const lo = Math.min(baseUsdPerT, ...cases);
  const hi = Math.max(baseUsdPerT, ...cases);
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([plotLeft, plotRight]);
  const baseX = x(baseUsdPerT);
  const height = TOP_PX + rows.length * ROW_PX;

  const bar = (value: number | null, y: number, kind: 'low' | 'high', key: string) => {
    if (value === null) return null;
    const end = x(value);
    const right = value >= baseUsdPerT;
    return (
      <g key={`${key}-${kind}`}>
        <rect
          className={`chart-bar chart-tornado-${kind}`}
          x={Math.min(baseX, end)}
          y={y}
          width={Math.max(1, Math.abs(end - baseX))}
          height={HALF_BAR_PX}
        />
        <text
          className="chart-tick num"
          x={right ? end + TEXT_GAP_PX : end - TEXT_GAP_PX}
          y={y + HALF_BAR_PX / 2}
          textAnchor={right ? 'start' : 'end'}
          dominantBaseline="middle"
        >
          {formatPrice(value)}
        </text>
      </g>
    );
  };

  return (
    <div className="chart">
      <svg className="chart-svg" width={width} height={height} role="img" aria-label={ariaLabel}>
        <text className="chart-note" x={baseX} y={10} textAnchor="middle">
          {`Base ${formatPrice(baseUsdPerT)}`}
        </text>
        {rows.map((r, i) => {
          const top = TOP_PX + i * ROW_PX + (ROW_PX - 2 * HALF_BAR_PX) / 2;
          return (
            <g key={r.key} className="chart-tornado-row" data-key={r.key}>
              <text className="chart-row-label" x={0} y={top + HALF_BAR_PX - 3}>
                {r.label}
              </text>
              <text className="chart-tick" x={0} y={top + 2 * HALF_BAR_PX + 3}>
                {r.rangeText}
              </text>
              {bar(r.lowCaseUsdPerT, top, 'low', r.key)}
              {bar(r.highCaseUsdPerT, top + HALF_BAR_PX, 'high', r.key)}
            </g>
          );
        })}
        <line className="chart-axis" x1={baseX} x2={baseX} y1={TOP_PX - 4} y2={height} />
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Range</th>
              <th scope="col">Break-even, low case</th>
              <th scope="col">Break-even, high case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.rangeText}</td>
                <td>{r.lowCaseUsdPerT === null ? DASH : formatPrice(r.lowCaseUsdPerT)}</td>
                <td>{r.highCaseUsdPerT === null ? DASH : formatPrice(r.highCaseUsdPerT)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

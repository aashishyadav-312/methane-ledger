import { scaleBand, scaleLinear } from 'd3-scale';
import { stack } from 'd3-shape';

export type StreamKey = 'drained' | 'vam' | 'amm';

export interface ReductionsYear {
  year: number;
  drained: number;
  vam: number;
  amm: number;
}

export interface ReductionsByYearProps {
  width: number;
  years: ReductionsYear[];
  /** Number of years in which the mine still produces; the closure line sits after that many bars. */
  activeYears: number;
  labels: Record<StreamKey, string>;
  /** Formats tonnes for the hidden table, for example `385k t`. */
  formatTonnes: (t: number) => string;
  ariaLabel: string;
}

const KEYS: StreamKey[] = ['drained', 'vam', 'amm'];
const FILL: Record<StreamKey, string> = {
  drained: 'var(--stream-drained)',
  vam: 'var(--stream-vam)',
  amm: 'var(--stream-amm)',
};

const HEIGHT_PX = 200;
const AXIS_PX = 22;
const TOP_PX = 18;
const BAR_GAP = 0.2;
const CORNER_PX = 3;

/** Credits each year, stacked by gas stream, with a dashed line where the mine closes. */
export function ReductionsByYear({
  width,
  years,
  activeYears,
  labels,
  formatTonnes,
  ariaLabel,
}: ReductionsByYearProps) {
  const plotBottom = HEIGHT_PX - AXIS_PX;
  const x = scaleBand<number>()
    .domain(years.map((y) => y.year))
    .range([0, width])
    .paddingInner(BAR_GAP);
  const maxTotal = Math.max(1, ...years.map((y) => y.drained + y.vam + y.amm));
  const y = scaleLinear().domain([0, maxTotal]).range([plotBottom, TOP_PX]);
  const series = stack<ReductionsYear, StreamKey>().keys(KEYS)(years);
  const topKey = (i: number): StreamKey | undefined => [...KEYS].reverse().find((k) => years[i][k] > 0);

  const step = x.step();
  const closeX =
    activeYears > 0 && activeYears < years.length
      ? (x(years[activeYears - 1].year) ?? 0) + x.bandwidth() + (step - x.bandwidth()) / 2
      : activeYears === 0
        ? 0
        : null;

  return (
    <div className="chart">
      <svg className="chart-svg" width={width} height={HEIGHT_PX} role="img" aria-label={ariaLabel}>
        {series.map((s) =>
          s.map((d, i) => {
            const h = Math.max(0, y(d[0]) - y(d[1]));
            if (h === 0) return null;
            const bx = x(years[i].year) ?? 0;
            const isTop = topKey(i) === s.key;
            return (
              <rect
                key={`${s.key}-${years[i].year}`}
                className="chart-bar"
                x={bx}
                y={y(d[1])}
                width={x.bandwidth()}
                height={h}
                rx={isTop ? CORNER_PX : 0}
                style={{ fill: FILL[s.key] }}
              />
            );
          }),
        )}
        {/* Square off the bottom corners of a rounded top segment by redrawing its lower part. */}
        {series.map((s) =>
          s.map((d, i) => {
            const h = Math.max(0, y(d[0]) - y(d[1]));
            if (h <= CORNER_PX || topKey(i) !== s.key) return null;
            return (
              <rect
                key={`${s.key}-${years[i].year}-base`}
                className="chart-bar"
                x={x(years[i].year) ?? 0}
                y={y(d[0]) - CORNER_PX}
                width={x.bandwidth()}
                height={CORNER_PX}
                style={{ fill: FILL[s.key] }}
              />
            );
          }),
        )}
        <line className="chart-axis" x1={0} x2={width} y1={plotBottom + 0.5} y2={plotBottom + 0.5} />
        {closeX !== null ? (
          <g className="chart-mark" style={{ transform: `translateX(${closeX}px)` }}>
            <line className="chart-close-line" x1={0} x2={0} y1={0} y2={plotBottom} />
            <text
              className="chart-note"
              x={closeX > width / 2 ? -6 : 6}
              y={10}
              textAnchor={closeX > width / 2 ? 'end' : 'start'}
            >
              Mine closes
            </text>
          </g>
        ) : null}
        {years.map((yr) => (
          <text
            key={yr.year}
            className="chart-tick num"
            x={(x(yr.year) ?? 0) + x.bandwidth() / 2}
            y={HEIGHT_PX - 6}
            textAnchor="middle"
          >
            {`'${String(yr.year).slice(-2)}`}
          </text>
        ))}
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              {KEYS.map((k) => (
                <th key={k} scope="col">
                  {labels[k]}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr) => (
              <tr key={yr.year}>
                <th scope="row">{yr.year}</th>
                {KEYS.map((k) => (
                  <td key={k}>{formatTonnes(yr[k])}</td>
                ))}
                <td>{formatTonnes(yr.drained + yr.vam + yr.amm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

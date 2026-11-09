import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';

export interface NpvPoint {
  priceUsdPerT: number;
  npvUsd: number;
}

export interface NpvVsPriceProps {
  width: number;
  points: NpvPoint[];
  priceUsdPerT: number;
  npvAtPriceUsd: number;
  /** For example `$8.6M`. */
  formatUsd: (usd: number) => string;
  /** For example `$15`. */
  formatPrice: (usdPerT: number) => string;
  ariaLabel: string;
}

const HEIGHT_PX = 200;
const AXIS_PX = 22;
const PAD_PX = 10;
const X_TICKS = 4;

/** Net present value against credit price, with the zero line and a dot at your price. */
export function NpvVsPrice({
  width,
  points,
  priceUsdPerT,
  npvAtPriceUsd,
  formatUsd,
  formatPrice,
  ariaLabel,
}: NpvVsPriceProps) {
  const clipId = `npv-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const plotBottom = HEIGHT_PX - AXIS_PX;
  const prices = points.map((p) => p.priceUsdPerT);
  const npvs = points.map((p) => p.npvUsd);
  const domainX: [number, number] = [Math.min(...prices), Math.max(...prices)];
  const top = Math.max(0, ...npvs);
  const bottom = Math.min(0, ...npvs);
  const x = scaleLinear().domain(domainX).range([0, width]);
  const y = scaleLinear()
    .domain([bottom, top === bottom ? bottom + 1 : top])
    .range([plotBottom - PAD_PX, PAD_PX]);
  const zeroY = y(0);

  const path = line<NpvPoint>()
    .x((p) => x(p.priceUsdPerT))
    .y((p) => y(p.npvUsd))(points);
  const fill = area<NpvPoint>()
    .x((p) => x(p.priceUsdPerT))
    .y0(zeroY)
    .y1((p) => y(p.npvUsd))(points);

  const onChart = priceUsdPerT >= domainX[0] && priceUsdPerT <= domainX[1];
  const dotX = x(Math.min(domainX[1], Math.max(domainX[0], priceUsdPerT)));
  const dotY = y(npvAtPriceUsd);

  return (
    <div className="chart">
      <svg className="chart-svg" width={width} height={HEIGHT_PX} role="img" aria-label={ariaLabel}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={width} height={Math.max(0, zeroY)} />
          </clipPath>
        </defs>
        {fill ? <path className="chart-npv-area" d={fill} clipPath={`url(#${clipId})`} /> : null}
        <line className="chart-axis" x1={0} x2={width} y1={zeroY} y2={zeroY} />
        {path ? <path className="chart-npv-line" d={path} /> : null}
        {onChart ? (
          <circle
            className="chart-dot chart-mark"
            cx={0}
            cy={0}
            r={6}
            style={{ transform: `translate(${dotX}px, ${dotY}px)` }}
          />
        ) : null}
        <text className="chart-tick num chart-y-label" x={2} y={PAD_PX + 4}>
          {formatUsd(top)}
        </text>
        <text className="chart-tick num chart-y-label" x={2} y={plotBottom - 2}>
          {formatUsd(bottom)}
        </text>
        {x.ticks(X_TICKS).map((t, i, all) => (
          <text
            key={t}
            className="chart-tick num"
            x={x(t)}
            y={HEIGHT_PX - 6}
            textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}
          >
            {formatPrice(t)}
          </text>
        ))}
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Credit price</th>
              <th scope="col">Net present value</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.priceUsdPerT}>
                <th scope="row">{formatPrice(p.priceUsdPerT)}</th>
                <td>{formatUsd(p.npvUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

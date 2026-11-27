import { scaleLinear } from 'd3-scale';
import { DASH, usdPerT } from '../../../lib/format';
import type { ClosureCurve } from '../../../model/types';
import {
  crossoverLabel,
  flareZoneLabel,
  mineOnCurveLabel,
  offScaleText,
  SERIES,
  usdPrice,
} from '../copy';
import { lineProgress, useMorph } from '../motion';
import { DataTable, Legend, textWidthPx } from './frame';

/** PLAN_V2 Appendix C: the y axis is capped at $30 a tonne; higher values are noted as off the scale. */
export const CLOSURE_Y_CAP_USD_PER_T = 30;

const HEIGHT_PX = 340;
const PAD_TOP_PX = 16;
const PAD_BOTTOM_PX = 40;
const PAD_LEFT_PX = 56;
/** Room at the right for the market lines' names on wide charts. */
const MARKET_LABEL_COL_PX = 190;
const PAD_RIGHT_NARROW_PX = 12;
const WIDE_FROM_PX = 720;
const Y_TICKS = 4;
const LABEL_FONT_PX = 12.5;
const TEXT_GAP_PX = 8;
const RING_OUTER_PX = 9;
const RING_DOT_PX = 5;
/** A year label every year when there is this much room per year, else every other year. */
const MIN_PX_PER_YEAR_LABEL = 44;

export interface MarketLine {
  id: string;
  label: string;
  usdPerT: number;
}

export interface ClosureChartProps {
  width: number;
  curve: ClosureCurve;
  mineName: string;
  /** The mine's last year of mining in the current inputs. */
  closureYear: number;
  /** The mine's own break-even (the ringed point). */
  breakevenUsdPerT: number | null;
  markets: MarketLine[];
  /** Milliseconds since the reveal (see useRevealClock). */
  elapsedMs: number;
}

const toNum = (v: number | null) => (v === null ? Number.NaN : v);

/** One SVG path through the points, with a gap wherever a value is missing. */
function linePath(xs: number[], ys: readonly number[]): string {
  let d = '';
  let pen = false;
  ys.forEach((y, i) => {
    if (Number.isNaN(y)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xs[i].toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

/**
 * Break-even by last year of mining (Appendix C): drained and after-closure gas to engines, and to a flare. The years
 * where a flare is cheaper are shaded up to the crossover; the mine's own closure is ringed.
 */
export function ClosureChart({
  width,
  curve,
  mineName,
  closureYear,
  breakevenUsdPerT,
  markets,
  elapsedMs,
}: ClosureChartProps) {
  const n = curve.years.length;
  const values = useMorph([...curve.power.map(toNum), ...curve.flare.map(toNum), toNum(breakevenUsdPerT)]);
  const power = values.slice(0, n);
  const flare = values.slice(n, 2 * n);
  const ringValue = values[2 * n];

  const wide = width >= WIDE_FROM_PX;
  const left = PAD_LEFT_PX;
  const right = Math.max(left + 1, width - (wide ? MARKET_LABEL_COL_PX : PAD_RIGHT_NARROW_PX));
  const top = PAD_TOP_PX;
  const bottom = HEIGHT_PX - PAD_BOTTOM_PX;
  const first = curve.years[0];
  const last = curve.years[n - 1];

  const finite = [...curve.power, ...curve.flare].filter((v): v is number => v !== null);
  const lo = Math.min(0, ...finite);
  const hi = Math.min(CLOSURE_Y_CAP_USD_PER_T, Math.max(...finite, ...markets.map((m) => m.usdPerT), 1));
  const y = scaleLinear().domain([lo, hi]).nice(Y_TICKS).range([bottom, top]);
  const yTop = y.domain()[1];
  const capY = (v: number) => y(Math.min(v, yTop));
  const x = scaleLinear()
    .domain([first, last === first ? first + 1 : last])
    .range([left, right]);
  const xs = curve.years.map((yr) => x(yr));

  const drawn = lineProgress(elapsedMs);
  const pxPerYear = n > 1 ? (right - left) / (n - 1) : right - left;
  const labelEvery = pxPerYear >= MIN_PX_PER_YEAR_LABEL ? 1 : 2;

  // The flare zone: from the first year to half way to the crossover (or the whole window when there is none).
  const zoneLabel = flareZoneLabel(curve);
  const crossover = curve.crossoverYear;
  const zoneEnd = crossover === null ? right : x(crossover - 0.5);
  const crossX = crossover === null ? null : x(crossover);
  const crossText = crossover === null ? '' : crossoverLabel(crossover);
  // The zone's own label only where it fits inside the zone (the lede says the same in words).
  const zoneFits = zoneLabel !== null && textWidthPx(zoneLabel, LABEL_FONT_PX) + 2 * TEXT_GAP_PX <= zoneEnd - left;
  // Right of the dashed line, or else at the top right, where both lines have fallen away.
  const crossLabelRight = crossX !== null && crossX + TEXT_GAP_PX + textWidthPx(crossText, LABEL_FONT_PX) <= right;

  // The ringed point: the mine's closure year, clamped to the window, at its own break-even.
  const ringYear = Math.min(Math.max(closureYear, first), last);
  const ringX = x(ringYear);
  const ringOk = !Number.isNaN(ringValue);
  const ringY = ringOk ? capY(ringValue) : bottom;
  const ringText = mineOnCurveLabel(mineName, closureYear, last, breakevenUsdPerT);
  const ringTextW = textWidthPx(ringText, LABEL_FONT_PX);
  const ringAnchor = ringX - RING_OUTER_PX - TEXT_GAP_PX - ringTextW >= left ? 'end' : 'start';
  const ringTextX = ringAnchor === 'end' ? ringX - RING_OUTER_PX - 4 : ringX + RING_OUTER_PX + 4;
  const ringTextY = ringY + 26 <= bottom - 4 ? ringY + 26 : ringY - 16;

  // Direct labels for the two lines, near their second point and their second-last point.
  const labelAt = (ys: readonly number[], i: number) => {
    const v = ys[Math.min(Math.max(i, 0), n - 1)];
    if (Number.isNaN(v)) return null;
    return { x: xs[Math.min(Math.max(i, 0), n - 1)] + TEXT_GAP_PX, y: Math.max(top + 12, capY(v) - 12) };
  };
  // Direct labels on wide charts; narrow ones have no room beside the lines, so they get a legend instead.
  const powerLabel = wide ? labelAt(power, 1) : null;
  const flareLabel = wide ? labelAt(flare, n - 2) : null;

  const off = [
    ...curve.power.flatMap((v, i) => (v !== null && v > yTop ? [{ series: SERIES.power, year: curve.years[i], usdPerT: v }] : [])),
    ...curve.flare.flatMap((v, i) => (v !== null && v > yTop ? [{ series: SERIES.flare, year: curve.years[i], usdPerT: v }] : [])),
  ];
  const bothOff = new Set(off.map((p) => p.series)).size > 1;
  const offText = offScaleText(off, bothOff);

  const ariaLabel = `Break-even credit price for ${mineName} by last year of mining, ${first} to ${last}, gas engines against a flare${
    crossover === null ? '' : `; engines are cheaper from ${crossover}`
  }`;

  return (
    <div className="v2r-figure">
      <svg className="v2r-svg" width={width} height={HEIGHT_PX} role="img" aria-label={ariaLabel} data-testid="closure-svg">
        {y.ticks(Y_TICKS).map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'v2r-axis' : 'v2r-grid'} x1={left} x2={right} y1={y(t)} y2={y(t)} />
            <text className="v2r-tick" x={left - 10} y={y(t) + 4} textAnchor="end">
              {usdPrice(t)}
            </text>
          </g>
        ))}
        {curve.years.map((yr, i) =>
          i % labelEvery === 0 ? (
            <text key={yr} className="v2r-tick" x={xs[i]} y={bottom + 26} textAnchor="middle">
              {yr}
            </text>
          ) : null,
        )}
        {markets.map((m) =>
          m.usdPerT <= yTop ? (
            <g key={m.id} className="v2r-market">
              <line className="v2r-ref" x1={left} x2={right} y1={y(m.usdPerT)} y2={y(m.usdPerT)} />
              <text
                className="v2r-ref-label"
                x={wide ? right + 10 : right}
                y={wide ? y(m.usdPerT) + 4 : y(m.usdPerT) - 6}
                textAnchor={wide ? 'start' : 'end'}
              >
                {`${m.label} ${usdPrice(m.usdPerT)}`}
              </text>
            </g>
          ) : null,
        )}
        {zoneLabel !== null && zoneEnd > left ? (
          <g data-testid="closure-flare-zone" aria-label={zoneLabel}>
            <rect className="v2r-zone" x={left} y={top} width={zoneEnd - left} height={bottom - top} />
            {/* At the foot of the zone, where neither line runs (both are far above $0 in the early years). */}
            {zoneFits ? (
              <text className="v2r-zone-label" x={left + 12} y={bottom - 12}>
                {zoneLabel}
              </text>
            ) : null}
          </g>
        ) : null}
        {crossX !== null ? (
          <g data-testid="closure-crossover-mark">
            <line className="v2r-cross" x1={crossX} x2={crossX} y1={top} y2={bottom} />
            <text
              className="v2r-cross-label"
              data-testid="closure-crossover"
              x={crossLabelRight ? crossX + TEXT_GAP_PX : right}
              y={top + 20}
              textAnchor={crossLabelRight ? 'start' : 'end'}
            >
              {crossText}
            </text>
          </g>
        ) : null}
        <path
          className="v2r-line v2r-line--flare"
          d={linePath(xs, flare.map((v) => (Number.isNaN(v) ? v : capY(v))))}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - drawn}
        />
        <path
          className="v2r-line v2r-line--power"
          d={linePath(xs, power.map((v) => (Number.isNaN(v) ? v : capY(v))))}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - drawn}
        />
        <g opacity={drawn}>
          {powerLabel ? (
            <text className="v2r-series-label v2r-series-label--power" x={powerLabel.x} y={powerLabel.y}>
              {SERIES.power}
            </text>
          ) : null}
          {flareLabel ? (
            <text className="v2r-series-label v2r-series-label--flare" x={flareLabel.x} y={flareLabel.y}>
              {SERIES.flare}
            </text>
          ) : null}
          {ringOk ? (
            <g data-testid="closure-mine-point">
              <circle className="v2r-ring" cx={ringX} cy={ringY} r={RING_OUTER_PX} />
              <circle className="v2r-ring-dot" cx={ringX} cy={ringY} r={RING_DOT_PX} />
              <text className="v2r-ring-label" x={ringTextX} y={ringTextY} textAnchor={ringAnchor}>
                {ringText}
              </text>
            </g>
          ) : null}
        </g>
      </svg>
      {wide ? null : (
        <Legend
          label="Lines"
          items={[
            { key: 'power', label: SERIES.power, colour: 'var(--stream-drained)' },
            { key: 'flare', label: SERIES.flare, colour: 'var(--stream-amm)' },
          ]}
        />
      )}
      {offText ? (
        <p className="v2r-note" data-testid="closure-offscale">
          {offText}
        </p>
      ) : null}
      <DataTable
        caption={ariaLabel}
        head={['Last year of mining', `${SERIES.power}, US$ a tonne`, `${SERIES.flare}, US$ a tonne`]}
        rows={curve.years.map((yr, i) => ({
          key: String(yr),
          cells: [
            yr,
            curve.power[i] === null ? DASH : usdPerT(curve.power[i]!),
            curve.flare[i] === null ? DASH : usdPerT(curve.flare[i]!),
          ],
        }))}
      />
    </div>
  );
}

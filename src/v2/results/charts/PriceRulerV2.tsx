import { scaleLinear } from 'd3-scale';
import { placeTicks, type RulerTick } from '../../../components/charts/PriceRuler';
import { DASH, usdPerT } from '../../../lib/format';
import type { PriceScenario } from '../../../data/schemas';
import { PRICE_SLIDER_USD_PER_T } from '../../../pages/MinePage/controls';
import { usdPrice } from '../copy';
import { useMorph } from '../motion';
import { DataTable, textWidthPx } from './frame';

/** The ruler's scale is the price control's range, as on v1. */
export const RULER_DOMAIN_USD_PER_T: [number, number] = [PRICE_SLIDER_USD_PER_T.min, PRICE_SLIDER_USD_PER_T.max];

const PAD_X_PX = 20;
const TRACK_Y_PX = 40;
const TRACK_H_PX = 4;
const TOP_LABEL_Y_PX = 22;
const TICK_ROW_PX = 18;
const TICK_FIRST_ROW_Y_PX = 66;
const TICK_FONT_PX = 12;
const TOP_FONT_PX = 12.5;
const BE_R_PX = 7;
const TICK_R_PX = 4;
const LABEL_GAP_PX = 12;

/** The ruler's market marks: the price scenarios flagged for the ruler (v1's rule). */
export function rulerTicks(prices: PriceScenario[]): RulerTick[] {
  return prices
    .filter((s) => s.ruler && s.priceUsdPerT !== null)
    .map((s) => ({
      id: s.id,
      label: `${s.shortLabel} ${usdPrice(s.priceUsdPerT!.value)}`,
      priceUsdPerT: s.priceUsdPerT!.value,
      badge: s.badge?.label ?? null,
    }));
}

export interface PriceRulerV2Props {
  width: number;
  breakevenUsdPerT: number | null;
  priceUsdPerT: number;
  ticks: RulerTick[];
}

/** Break-even, your price and market prices on one scale; the prices that cover the project in green. */
export function PriceRulerV2({ width, breakevenUsdPerT, priceUsdPerT, ticks }: PriceRulerV2Props) {
  const [beShown, priceShown] = useMorph([breakevenUsdPerT ?? Number.NaN, priceUsdPerT]);
  const [d0, d1] = RULER_DOMAIN_USD_PER_T;
  const left = PAD_X_PX;
  const right = Math.max(left + 1, width - PAD_X_PX);
  const x = scaleLinear().domain([d0, d1]).range([left, right]).clamp(true);
  const plotW = right - left;
  const shift = (t: RulerTick[]) => placeTicks(t, plotW, RULER_DOMAIN_USD_PER_T);
  // Narrow rulers: if the names cannot fit on three rows, the marks show prices only (names stay in the table).
  const placed =
    shift(ticks) ?? shift(ticks.map((t) => ({ ...t, label: t.label.slice(t.label.lastIndexOf(' ') + 1) }))) ?? [];
  const rows = Math.max(1, ...placed.map((t) => t.row + 1));
  const height = TICK_FIRST_ROW_Y_PX + (rows - 1) * TICK_ROW_PX + 8;

  const hasBe = !Number.isNaN(beShown);
  const beX = hasBe ? x(beShown) : null;
  const priceX = x(priceShown);
  const beText = `Break-even ${breakevenUsdPerT === null ? DASH : usdPerT(breakevenUsdPerT)}${
    breakevenUsdPerT !== null && breakevenUsdPerT > d1 ? ', off the scale' : ''
  }`;
  const priceText = `Your price ${usdPrice(priceUsdPerT)}`;

  // The two labels above the track: centred on their marks, pushed apart when they would touch, kept inside.
  const place = (cx: number, w: number) => Math.min(Math.max(cx - w / 2, 0), width - w);
  const beW = textWidthPx(beText, TOP_FONT_PX);
  const prW = textWidthPx(priceText, TOP_FONT_PX);
  let beLeft = beX === null ? 0 : place(beX, beW);
  let prLeft = place(priceX, prW);
  if (beX !== null) {
    const beFirst = beX <= priceX;
    const [aLeft, aW, bLeft, bW] = beFirst ? [beLeft, beW, prLeft, prW] : [prLeft, prW, beLeft, beW];
    if (aLeft + aW + LABEL_GAP_PX > bLeft) {
      const mid = (beX + priceX) / 2;
      let a = mid - LABEL_GAP_PX / 2 - aW;
      let b = mid + LABEL_GAP_PX / 2;
      if (a < 0) [a, b] = [0, b - a];
      if (b + bW > width) [a, b] = [a - (b + bW - width), width - bW];
      if (beFirst) [beLeft, prLeft] = [a, b];
      else [prLeft, beLeft] = [a, b];
    }
  }
  const caption = 'Break-even, your price and market prices on one scale, US$ a tonne';

  return (
    <figure className="v2r-ruler" data-testid="price-ruler">
      <svg className="v2r-svg" width={width} height={height} role="img" aria-label={caption}>
        <rect className="v2r-ruler-track" x={left} y={TRACK_Y_PX} width={plotW} height={TRACK_H_PX} rx={TRACK_H_PX / 2} />
        {beX !== null && beX < right ? (
          <rect
            className="v2r-ruler-covered"
            x={beX}
            y={TRACK_Y_PX}
            width={right - beX}
            height={TRACK_H_PX}
            rx={TRACK_H_PX / 2}
          />
        ) : null}
        {placed.map((t) => (
          <g key={t.id}>
            <circle className="v2r-ruler-tick" cx={x(t.priceUsdPerT)} cy={TRACK_Y_PX + TRACK_H_PX / 2} r={TICK_R_PX} />
            <text
              className="v2r-ruler-tick-label"
              x={x(t.priceUsdPerT)}
              y={TICK_FIRST_ROW_Y_PX + t.row * TICK_ROW_PX}
              textAnchor={t.align === 'center' ? 'middle' : t.align}
              fontSize={TICK_FONT_PX}
            >
              {t.label}
            </text>
          </g>
        ))}
        <rect className="v2r-ruler-price" x={priceX - 1} y={TRACK_Y_PX - 12} width={2} height={TRACK_H_PX + 24} />
        <text className="v2r-ruler-label" x={prLeft} y={TOP_LABEL_Y_PX}>
          {priceText}
        </text>
        {beX !== null ? (
          <>
            <circle className="v2r-ruler-be" cx={beX} cy={TRACK_Y_PX + TRACK_H_PX / 2} r={BE_R_PX} />
            <text className="v2r-ruler-label" x={beLeft} y={TOP_LABEL_Y_PX}>
              {beText}
            </text>
          </>
        ) : null}
      </svg>
      <DataTable
        caption={caption}
        head={['Price', 'US$ a tonne', 'Status']}
        rows={[
          { key: 'be', cells: ['Break-even', breakevenUsdPerT === null ? DASH : usdPerT(breakevenUsdPerT), ''] },
          { key: 'price', cells: ['Your price', usdPrice(priceUsdPerT), ''] },
          ...ticks.map((t) => ({ key: t.id, cells: [t.label, usdPrice(t.priceUsdPerT), t.badge ?? ''] })),
        ]}
      />
    </figure>
  );
}

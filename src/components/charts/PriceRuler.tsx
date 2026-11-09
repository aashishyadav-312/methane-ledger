import { scaleLinear } from 'd3-scale';
import type { CSSProperties } from 'react';

export interface RulerTick {
  id: string;
  /** For example "Voluntary avg $7". */
  label: string;
  priceUsdPerT: number;
  /** For example "Benchmark only", for the hidden table. */
  badge: string | null;
}

export interface PriceRulerProps {
  /** Pixel width of the ruler, used only to stagger labels so they never overlap. */
  width: number;
  domainUsdPerT: [number, number];
  /** `null` when the mine is not abatable: no covered range is drawn. */
  breakevenUsdPerT: number | null;
  priceUsdPerT: number;
  priceText: string;
  breakevenText: string;
  ticks: RulerTick[];
  ariaLabel: string;
}

// Label layout: an estimate of label width from its length, at the 11.5px label size.
const CHAR_PX = 6.4;
const LABEL_PAD_PX = 10;
const MAX_ROWS = 3;

interface PlacedTick extends RulerTick {
  leftPct: number;
  row: number;
  align: 'start' | 'center' | 'end';
}

/** Greedy rows: each label goes on the first row where it clears the label before it. */
export function placeTicks(ticks: RulerTick[], width: number, domain: [number, number]): PlacedTick[] | null {
  const x = scaleLinear().domain(domain).range([0, width]).clamp(true);
  const pctOf = scaleLinear().domain(domain).range([0, 100]).clamp(true);
  const rowsRight: number[] = [];
  const out: PlacedTick[] = [];
  for (const t of [...ticks].sort((a, b) => a.priceUsdPerT - b.priceUsdPerT)) {
    const w = t.label.length * CHAR_PX + LABEL_PAD_PX;
    const cx = x(t.priceUsdPerT);
    let left = cx - w / 2;
    let align: PlacedTick['align'] = 'center';
    if (left < 0) {
      left = cx;
      align = 'start';
    } else if (cx + w / 2 > width) {
      left = cx - w;
      align = 'end';
    }
    let row = rowsRight.findIndex((right) => right <= left);
    if (row === -1) row = rowsRight.length;
    if (row >= MAX_ROWS) return null;
    rowsRight[row] = left + w;
    out.push({ ...t, leftPct: pctOf(t.priceUsdPerT), row, align });
  }
  return out;
}

const ALIGN_SHIFT = { start: '0%', center: '-50%', end: '-100%' } as const;

/**
 * The price ruler: the range of prices that covers the project, the break-even marker, your price and the
 * market ticks. HTML positioned on a D3 linear scale, so labels stay crisp at any width.
 */
export function PriceRuler({
  width,
  domainUsdPerT,
  breakevenUsdPerT,
  priceUsdPerT,
  priceText,
  breakevenText,
  ticks,
  ariaLabel,
}: PriceRulerProps) {
  const pct = scaleLinear().domain(domainUsdPerT).range([0, 100]).clamp(true);
  // Narrow screens: if the names cannot fit on three rows, the ticks show prices only (names stay in the table).
  const named = placeTicks(ticks, width, domainUsdPerT);
  const placed =
    named ??
    placeTicks(
      ticks.map((t) => ({ ...t, label: t.label.slice(t.label.lastIndexOf(' ') + 1) })),
      width,
      domainUsdPerT,
    ) ??
    [];
  const rows = Math.max(1, ...placed.map((t) => t.row + 1));
  const bePct = breakevenUsdPerT === null ? null : pct(breakevenUsdPerT);
  const pricePct = pct(priceUsdPerT);

  return (
    <figure className="ruler" aria-label={ariaLabel}>
      <div className="ruler-track-area" style={{ '--ruler-rows': rows } as CSSProperties} aria-hidden="true">
        <div className="ruler-track" />
        {bePct !== null && bePct < 100 ? <div className="ruler-covered" style={{ left: `${bePct}%` }} /> : null}
        {placed.map((t) => (
          <span
            key={t.id}
            className="ruler-tick num"
            style={{ left: `${t.leftPct}%`, '--tick-row': t.row } as CSSProperties}
          >
            <span className="ruler-tick-dot" />
            <span className="ruler-tick-label" style={{ transform: `translateX(${ALIGN_SHIFT[t.align]})` }}>
              {t.label}
            </span>
          </span>
        ))}
        <div className="ruler-price" style={{ left: `${pricePct}%` }}>
          <span
            className="ruler-price-label num"
            style={{ transform: `translateX(${pricePct < 15 ? '0%' : pricePct > 85 ? '-100%' : '-50%'})` }}
          >
            Your price {priceText}
          </span>
          <span className="ruler-price-line" />
        </div>
        {bePct !== null ? <div className="ruler-be" style={{ left: `${bePct}%` }} /> : null}
      </div>
      <figcaption className="chart-legend">
        <span className="legend-item">
          <span className="legend-key legend-key-range" aria-hidden="true" />
          Price that covers the project
        </span>
        <span className="legend-item">
          <span className="legend-key legend-key-price" aria-hidden="true" />
          Your price
        </span>
        <span className="legend-item">
          <span className="legend-key legend-key-tick" aria-hidden="true" />
          Benchmarks and our estimates, US$ a tonne
        </span>
      </figcaption>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Price</th>
              <th scope="col">US$ a tonne</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Break-even</th>
              <td>{breakevenText}</td>
              <td />
            </tr>
            <tr>
              <th scope="row">Your price</th>
              <td>{priceText}</td>
              <td />
            </tr>
            {ticks.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.label}</th>
                <td>{t.priceUsdPerT}</td>
                <td>{t.badge ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

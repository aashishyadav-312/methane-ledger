import { scaleLinear } from 'd3-scale';
import type { CSSProperties } from 'react';

// Abatement supply curve. One bar per mine or archetype: width is the credits over the period, height is the
// credit price needed to break even. Bars are sorted by break-even, so the cheapest tonnes come first.
// Lines mark the chosen price and the market scenarios. Colours come from the tokens; nothing here is a result.

export interface SupplyBarDatum {
  id: string;
  name: string;
  breakevenUsdPerT: number;
  /** Credits over the period, tCO2e: the bar width. */
  erTco2e: number;
  /** Cumulative credits at the left edge, tCO2e. */
  startTco2e: number;
  /** Break-even is at or below the chosen price. */
  pays: boolean;
}

export interface SupplyLineDatum {
  id: string;
  /** For example "CCTS floor est. $11". */
  label: string;
  priceUsdPerT: number;
}

export interface SupplyCurveProps {
  width: number;
  bars: SupplyBarDatum[];
  priceUsdPerT: number;
  /** For example "Your price $15". */
  priceLabel: string;
  /** Scenario lines. Lines above the chart top are not drawn. */
  lines: SupplyLineDatum[];
  domainUsdPerT: [number, number];
  formatPrice: (usdPerT: number) => string;
  /** Credits in tonnes to text, for example "1.15 Mt". */
  formatCredits: (tco2e: number) => string;
  /** Ids drawn with an outline (the entries in the side-by-side table). */
  markedIds?: readonly string[];
  ariaLabel: string;
}

const PHONE_MAX_WIDTH_PX = 520;
const HEIGHT_PX = { wide: 340, phone: 280 } as const;
const MARGIN_PX = { left: 40, right: 8, top: 14, bottom: 34 } as const;
// Line labels sit in a margin to the right of the plot, so they never cover a bar. On a phone they show the price only.
const LABEL_MARGIN_PX = { phone: 40, maxWide: 200 } as const;
const LABEL_MARGIN_PAD_PX = 14;
const BAR_GAP_PX = 1;
const MIN_BAR_PX = 2;
const Y_TICKS = 5;
const X_TICKS = { wide: 6, phone: 3 } as const;
const CHAR_PX = 6.2; // average glyph width at the 11px label size
const BAR_LABEL_PAD_PX = 10;
const VALUE_LABEL_MIN_BAR_PX = 44;
const LABEL_GAP_PX = 13;
const TOP_HEADROOM = 1.2;

const font: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11 };
const halo: CSSProperties = { paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 3, strokeLinejoin: 'round' };

/** A chart top that clears the tallest bar and your price, rounded to a tick. */
export function supplyDomain(bars: readonly SupplyBarDatum[], priceUsdPerT: number): [number, number] {
  const tallest = Math.max(priceUsdPerT, ...bars.map((b) => b.breakevenUsdPerT));
  const lowest = Math.min(0, ...bars.map((b) => b.breakevenUsdPerT));
  const [lo, hi] = scaleLinear()
    .domain([lowest, Math.max(1, tallest * TOP_HEADROOM)])
    .nice(Y_TICKS)
    .domain() as [number, number];
  return [lo, hi];
}

/** Lines that fit under the chart top, and the ones that do not. */
export function splitLines(
  lines: readonly SupplyLineDatum[],
  domain: [number, number],
): { drawn: SupplyLineDatum[]; offScale: SupplyLineDatum[] } {
  return {
    drawn: lines.filter((l) => l.priceUsdPerT <= domain[1] && l.priceUsdPerT >= domain[0]),
    offScale: lines.filter((l) => l.priceUsdPerT > domain[1] || l.priceUsdPerT < domain[0]),
  };
}

interface Label {
  id: string;
  text: string;
  y: number;
  isPrice: boolean;
}

/** Label rows pushed apart so no two overlap; the lowest label stays at its line. */
function spreadLabels(labels: Label[]): Label[] {
  const lowestFirst = [...labels].sort((a, b) => b.y - a.y);
  let limit = Infinity;
  return lowestFirst.map((l) => {
    const y = Math.min(l.y, limit);
    limit = y - LABEL_GAP_PX;
    return { ...l, y };
  });
}

export function SupplyCurve({
  width,
  bars,
  priceUsdPerT,
  priceLabel,
  lines,
  domainUsdPerT,
  formatPrice,
  formatCredits,
  markedIds = [],
  ariaLabel,
}: SupplyCurveProps) {
  const phone = width < PHONE_MAX_WIDTH_PX;
  const height = phone ? HEIGHT_PX.phone : HEIGHT_PX.wide;
  const plotLeft = MARGIN_PX.left;
  const lineText = (text: string) => (phone ? text.slice(text.lastIndexOf(' ') + 1) : text);
  const { drawn } = splitLines(lines, domainUsdPerT);
  const labelTexts = [priceLabel, ...drawn.map((l) => l.label)].map(lineText);
  const labelMarginPx = phone
    ? LABEL_MARGIN_PX.phone
    : Math.min(LABEL_MARGIN_PX.maxWide, Math.max(...labelTexts.map((t) => t.length)) * CHAR_PX + LABEL_MARGIN_PAD_PX);
  const plotRight = Math.max(plotLeft + 1, width - MARGIN_PX.right - labelMarginPx);
  const plotTop = MARGIN_PX.top;
  const plotBottom = height - MARGIN_PX.bottom;
  const totalTco2e = bars.reduce((sum, b) => sum + b.erTco2e, 0);

  const x = scaleLinear()
    .domain([0, totalTco2e > 0 ? totalTco2e : 1])
    .range([plotLeft, plotRight]);
  const y = scaleLinear().domain(domainUsdPerT).range([plotBottom, plotTop]);
  const zeroY = y(Math.max(domainUsdPerT[0], Math.min(0, domainUsdPerT[1])));
  const labelLeft = plotRight + 6;

  const labels = spreadLabels([
    ...drawn.map((l) => ({ id: l.id, text: lineText(l.label), y: y(l.priceUsdPerT) + 4, isPrice: false })),
    { id: 'price', text: lineText(priceLabel), y: y(priceUsdPerT) + 4, isPrice: true },
  ]);

  return (
    <div className="supply-chart">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
        {y.ticks(Y_TICKS).map((t) => (
          <g key={t}>
            <line x1={plotLeft} x2={plotRight} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--line-soft)' }} />
            <text x={plotLeft - 6} y={y(t) + 4} textAnchor="end" style={{ ...font, fill: 'var(--ink-3)' }}>
              {formatPrice(t)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const left = x(b.startTco2e);
          const right = x(b.startTco2e + b.erTco2e);
          const w = Math.max(MIN_BAR_PX, right - left - BAR_GAP_PX);
          const top = Math.min(y(b.breakevenUsdPerT), zeroY);
          const h = Math.max(1, Math.abs(zeroY - y(b.breakevenUsdPerT)));
          const fits = b.name.length * CHAR_PX + BAR_LABEL_PAD_PX <= w;
          const name = fits ? b.name : String(i + 1);
          const marked = markedIds.includes(b.id);
          const onInk = b.pays;
          return (
            <g key={b.id} data-testid={`supply-bar-${b.id}`} data-pays={b.pays ? 'true' : 'false'}>
              <rect
                x={left}
                y={top}
                width={w}
                height={h}
                style={{
                  fill: b.pays ? 'var(--ink)' : 'var(--line-strong)',
                  stroke: marked ? 'var(--eyebrow)' : 'none',
                  strokeWidth: marked ? 2 : 0,
                }}
              />
              {h >= 18 && w >= 12 ? (
                <text
                  x={left + w / 2}
                  y={top + 14}
                  textAnchor="middle"
                  style={{ ...font, fill: onInk ? 'var(--paper)' : 'var(--ink)' }}
                >
                  {name}
                </text>
              ) : null}
              {w >= VALUE_LABEL_MIN_BAR_PX ? (
                <text
                  x={left + w / 2}
                  y={top - 5}
                  textAnchor="middle"
                  className="num"
                  style={{ ...font, fill: 'var(--ink)', ...halo }}
                >
                  {formatPrice(b.breakevenUsdPerT)}
                </text>
              ) : null}
            </g>
          );
        })}

        <line x1={plotLeft} x2={plotRight} y1={zeroY} y2={zeroY} style={{ stroke: 'var(--ink-3)' }} />

        {drawn.map((l) => (
          <line
            key={l.id}
            data-testid={`supply-line-${l.id}`}
            x1={plotLeft}
            x2={plotRight}
            y1={y(l.priceUsdPerT)}
            y2={y(l.priceUsdPerT)}
            style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
        ))}
        <line
          data-testid="supply-price-line"
          x1={plotLeft}
          x2={plotRight}
          y1={y(priceUsdPerT)}
          y2={y(priceUsdPerT)}
          style={{ stroke: 'var(--eyebrow)', strokeWidth: 2 }}
        />

        {labels.map((l) => (
          <text
            key={l.id}
            x={labelLeft}
            y={l.y}
            textAnchor="start"
            style={{
              ...font,
              fill: l.isPrice ? 'var(--eyebrow)' : 'var(--ink-3)',
              fontWeight: l.isPrice ? 600 : 400,
            }}
          >
            {l.text}
          </text>
        ))}

        {x.ticks(phone ? X_TICKS.phone : X_TICKS.wide).map((t, i, all) => (
          <text
            key={t}
            x={x(t)}
            y={height - 12}
            textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}
            className="num"
            style={{ ...font, fill: 'var(--ink-3)' }}
          >
            {formatCredits(t)}
          </text>
        ))}
      </svg>
      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Mine or archetype</th>
              <th scope="col">Break-even credit price</th>
              <th scope="col">Credits over the period</th>
              <th scope="col">At your price</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.id}>
                <th scope="row">{b.name}</th>
                <td>{formatPrice(b.breakevenUsdPerT)}</td>
                <td>{formatCredits(b.erTco2e)}</td>
                <td>{b.pays ? 'Pays' : 'Short'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

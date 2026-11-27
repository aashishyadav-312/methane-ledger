import { scaleLinear } from 'd3-scale';
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { splitLines, type SupplyLineDatum } from '../../../components/charts/SupplyCurve';
import { mineHref } from '../../../app/router';
import type { SupplyBarV2 } from './entries';

// The v2 supply curve: one bar per mine, width is the credits over the period, height is the credit price needed
// to break even, cheapest first. The ten cheapest bars carry a name. Hovering a bar names the mine; a click opens
// its page. Bars taller than the chart are clipped at the top and marked, and the table below lists them in full.
// Colours come from the tokens. Nothing here is a result.

export interface SupplyCurveV2Props {
  width: number;
  bars: SupplyBarV2[];
  priceUsdPerT: number;
  /** For example "Your price $15". */
  priceLabel: string;
  lines: SupplyLineDatum[];
  /** The price at the top of the chart; bars above it are clipped. */
  topUsdPerT: number;
  formatPrice: (usdPerT: number) => string;
  /** Credits in tonnes to text, for example "1.15 Mt". */
  formatCredits: (tco2e: number) => string;
  /** Ids drawn with an outline (the mines in the side-by-side table). */
  markedIds?: readonly string[];
  ariaLabel: string;
}

const PHONE_MAX_WIDTH_PX = 520;
const HEIGHT_PX = { wide: 380, phone: 340 } as const;
const MARGIN_PX = { left: 44, right: 8, top: 14, bottom: 34 } as const;
const LABEL_MARGIN_PX = { phone: 40, maxWide: 200 } as const;
const LABEL_MARGIN_PAD_PX = 14;
const BAR_GAP_PX = 1;
const MIN_BAR_PX = 2;
const Y_TICKS = 5;
const X_TICKS = { wide: 6, phone: 3 } as const;
const CHAR_PX = 6.2; // average glyph width at the 11px label size
const LABEL_LINE_PX = 14; // the least gap between two rotated names
const LABEL_MAX_CHARS = 26;
/** A rotated name shorter than this reads as noise, so the label is left to the hover card. */
const LABEL_MIN_CHARS = 14;
const X_TICK_MIN_GAP_PX = 100;
const LABEL_RISE_PX = 6;
const CLIP_MARK_PX = 5;
const LINE_LABEL_GAP_PX = 13;
const TOOLTIP_OFFSET_PX = 14;

const font: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11 };
const halo: CSSProperties = { paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 3, strokeLinejoin: 'round' };

/** A mine name on one line: the data has names that break across lines. */
export const oneLine = (name: string): string => name.replace(/\s+/g, ' ').trim();

interface BarProps {
  href?: string;
  'data-testid': string;
  'data-pays': 'true' | 'false';
  'data-labelled': 'true' | 'false';
  onMouseEnter: (e: MouseEvent<Element>) => void;
  onMouseMove: (e: MouseEvent<Element>) => void;
  onMouseLeave: () => void;
  children: ReactNode;
}

/**
 * One bar: a link to its mine when it has one (out of the tab order; the ranked list holds the same links), else a
 * plain group, so an archetype bar does not open an empty mine view.
 */
function Bar({ href, children, ...rest }: BarProps) {
  if (href === undefined) return <g {...rest}>{children}</g>;
  return (
    <a href={href} tabIndex={-1} style={{ cursor: 'pointer' }} {...rest}>
      {children}
    </a>
  );
}

function shorten(name: string, maxChars: number): string {
  const text = oneLine(name);
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

interface Label {
  id: string;
  text: string;
  y: number;
  isPrice: boolean;
}

function spreadLabels(labels: Label[]): Label[] {
  const lowestFirst = [...labels].sort((a, b) => b.y - a.y);
  let limit = Infinity;
  return lowestFirst.map((l) => {
    const y = Math.min(l.y, limit);
    limit = y - LINE_LABEL_GAP_PX;
    return { ...l, y };
  });
}

interface PlaceArgs {
  bars: readonly SupplyBarV2[];
  x: (tco2e: number) => number;
  y: (usdPerT: number) => number;
  topUsdPerT: number;
  plotTop: number;
  formatPrice: (usdPerT: number) => string;
}

interface PlacedBar {
  b: SupplyBarV2;
  left: number;
  w: number;
  top: number;
  centre: number;
  text: string;
  /** `flat` over a bar wide enough for the name, `rotated` rising from the bar top, or no name. */
  label: 'none' | 'flat' | 'rotated';
}

/** Where each bar sits, and how its name is written: flat, rotated, or left to the hover card when there is no room. */
function placeBars({ bars, x, y, topUsdPerT, plotTop, formatPrice }: PlaceArgs): PlacedBar[] {
  let lastRotatedX = -Infinity;
  return bars.map((b) => {
    const left = x(b.startTco2e);
    const w = Math.max(MIN_BAR_PX, x(b.startTco2e + b.erTco2e) - left - BAR_GAP_PX);
    const centre = left + w / 2;
    const top = y(Math.min(b.breakevenUsdPerT, topUsdPerT));
    const priceText = formatPrice(b.breakevenUsdPerT);
    const none: PlacedBar = { b, left, w, top, centre, text: '', label: 'none' };
    if (!b.labelled) return none;
    const flat = `${shorten(b.name, LABEL_MAX_CHARS)}, ${priceText}`;
    if (flat.length * CHAR_PX + LABEL_RISE_PX <= w) return { ...none, text: flat, label: 'flat' };
    if (centre - lastRotatedX < LABEL_LINE_PX) return none;
    // The name rises from the bar top, so it may use only the room between the bar and the top of the chart.
    const room = Math.floor((top - plotTop - LABEL_RISE_PX) / CHAR_PX);
    const nameChars = Math.min(LABEL_MAX_CHARS, room - priceText.length - 2);
    if (nameChars + priceText.length + 2 < LABEL_MIN_CHARS) return none;
    lastRotatedX = centre;
    return { ...none, text: `${shorten(b.name, nameChars)}, ${priceText}`, label: 'rotated' };
  });
}

export function SupplyCurveV2({
  width,
  bars,
  priceUsdPerT,
  priceLabel,
  lines,
  topUsdPerT,
  formatPrice,
  formatCredits,
  markedIds = [],
  ariaLabel,
}: SupplyCurveV2Props) {
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const phone = width < PHONE_MAX_WIDTH_PX;
  const height = phone ? HEIGHT_PX.phone : HEIGHT_PX.wide;
  const plotLeft = MARGIN_PX.left;
  const lineText = (text: string) => (phone ? text.slice(text.lastIndexOf(' ') + 1) : text);
  const domain: [number, number] = [0, topUsdPerT];
  const { drawn } = splitLines(lines, domain);
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
  const y = scaleLinear().domain(domain).range([plotBottom, plotTop]);
  const labelLeft = plotRight + 6;

  const priceLabels = spreadLabels([
    ...drawn.map((l) => ({ id: l.id, text: lineText(l.label), y: y(l.priceUsdPerT) + 4, isPrice: false })),
    { id: 'price', text: lineText(priceLabel), y: y(priceUsdPerT) + 4, isPrice: true },
  ]);

  const placed = placeBars({ bars, x, y, topUsdPerT, plotTop, formatPrice });

  // Credit ticks, dropping any that would sit on the one before it.
  const xTicks = x
    .ticks(phone ? X_TICKS.phone : X_TICKS.wide)
    .reduce<number[]>(
      (kept, t) => (kept.length === 0 || x(t) - x(kept[kept.length - 1]) >= X_TICK_MIN_GAP_PX ? [...kept, t] : kept),
      [],
    );

  const hovered = hover === null ? null : bars.find((b) => b.id === hover.id);
  const showTip = (b: SupplyBarV2) => (e: MouseEvent<Element>) => {
    const box = e.currentTarget.closest('.supply-chart')?.getBoundingClientRect();
    if (box) setHover({ id: b.id, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div className="supply-chart supply-chart-v2" style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
        {y.ticks(Y_TICKS).map((t) => (
          <g key={t}>
            <line x1={plotLeft} x2={plotRight} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--line-soft)' }} />
            <text x={plotLeft - 6} y={y(t) + 4} textAnchor="end" style={{ ...font, fill: 'var(--ink-3)' }}>
              {formatPrice(t)}
            </text>
          </g>
        ))}

        {placed.map(({ b, left, w, top, label, text, centre }) => {
          const clipped = b.breakevenUsdPerT > topUsdPerT;
          const marked = markedIds.includes(b.id);
          return (
            <Bar
              key={b.id}
              href={b.opens ? mineHref(b.id) : undefined}
              data-testid={`supply-bar-${b.id}`}
              data-pays={b.pays ? 'true' : 'false'}
              data-labelled={b.labelled ? 'true' : 'false'}
              onMouseEnter={showTip(b)}
              onMouseMove={showTip(b)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={left}
                y={top}
                width={w}
                height={Math.max(1, plotBottom - top)}
                style={{
                  fill: b.pays ? 'var(--ink)' : 'var(--line-strong)',
                  opacity: hover !== null && hover.id !== b.id ? 0.55 : 1,
                  stroke: marked ? 'var(--eyebrow)' : 'none',
                  strokeWidth: marked ? 2 : 0,
                }}
              />
              {clipped ? (
                <path
                  d={`M${left} ${top + CLIP_MARK_PX} L${left + w / 2} ${top} L${left + w} ${top + CLIP_MARK_PX}`}
                  style={{ fill: 'none', stroke: 'var(--paper)', strokeWidth: 1.5 }}
                />
              ) : null}
              {label === 'flat' ? (
                <text
                  x={centre}
                  y={top - LABEL_RISE_PX}
                  textAnchor="middle"
                  className="num"
                  style={{ ...font, fill: 'var(--ink)', ...halo }}
                >
                  {text}
                </text>
              ) : null}
              {label === 'rotated' ? (
                <text
                  transform={`translate(${centre + 4} ${top - LABEL_RISE_PX}) rotate(-90)`}
                  textAnchor="start"
                  className="num"
                  style={{ ...font, fill: 'var(--ink)', ...halo }}
                >
                  {text}
                </text>
              ) : null}
            </Bar>
          );
        })}

        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} style={{ stroke: 'var(--ink-3)' }} />

        {drawn.map((l) => (
          <line
            key={l.id}
            data-testid={`supply-line-${l.id}`}
            x1={plotLeft}
            x2={plotRight}
            y1={y(l.priceUsdPerT)}
            y2={y(l.priceUsdPerT)}
            style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '4 4', pointerEvents: 'none' }}
          />
        ))}
        <line
          data-testid="supply-price-line"
          x1={plotLeft}
          x2={plotRight}
          y1={y(priceUsdPerT)}
          y2={y(priceUsdPerT)}
          style={{ stroke: 'var(--eyebrow)', strokeWidth: 2, pointerEvents: 'none' }}
        />

        {priceLabels.map((l) => (
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

        {xTicks.map((t, i, all) => (
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

      {hovered && hover ? (
        <div
          className="supply-tip"
          role="status"
          data-testid="supply-tip"
          style={{
            position: 'absolute',
            left: Math.min(hover.x + TOOLTIP_OFFSET_PX, Math.max(0, width - 220)),
            top: hover.y + TOOLTIP_OFFSET_PX,
            pointerEvents: 'none',
          }}
        >
          <strong>{oneLine(hovered.name)}</strong>
          <span>{hovered.subsidiary}</span>
          <span className="num">
            {formatPrice(hovered.breakevenUsdPerT)} a tonne to break even, {formatCredits(hovered.erTco2e)} of credits
          </span>
          <span>
            {hovered.pays ? 'Pays at your price' : 'Needs a higher price'}.{hovered.opens ? ' Click to open.' : ''}
          </span>
        </div>
      ) : null}

      {/* The wrapper clips the table: overflow does not clip a box with display: table. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Mine</th>
              <th scope="col">Break-even credit price</th>
              <th scope="col">Credits over the period</th>
              <th scope="col">At your price</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.id}>
                <th scope="row">{oneLine(b.name)}</th>
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

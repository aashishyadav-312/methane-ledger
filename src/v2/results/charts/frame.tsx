import type { ReactNode } from 'react';

/** Row charts switch to labels above their bars below this plot width. */
export const STACKED_BELOW_PX = 480;

/** A rough label width for layout decisions, from its length at the given font size (Instrument Sans). */
export const CHAR_EM = 0.53;
export function textWidthPx(text: string, fontPx: number): number {
  return text.length * fontPx * CHAR_EM;
}

export interface ChartCardProps {
  id: string;
  title: string;
  /** Small text at the right of the title, for example the unit. */
  unit?: string;
  /** The closure chart is a wide card with a large display title and a lede. */
  wide?: boolean;
  lede?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Gets the reveal observer. */
  revealRef?: (el: HTMLElement | null) => void;
}

/** A chart card: the title (an h2), the unit, the figure and an optional footer. */
export function ChartCard({ id, title, unit, wide, lede, children, footer, revealRef }: ChartCardProps) {
  return (
    <section
      ref={revealRef}
      className={`v2r-card v2r-chart${wide ? ' v2r-chart--wide' : ''}`}
      aria-labelledby={`${id}-title`}
      data-testid={id}
    >
      <div className="v2r-chart-head">
        <h2 id={`${id}-title`} className={wide ? 'v2r-chart-title-lg' : 'v2r-chart-title'}>
          {title}
        </h2>
        {unit ? <span className="v2r-chart-unit">{unit}</span> : null}
      </div>
      {lede ? <p className="v2r-chart-lede">{lede}</p> : null}
      {children}
      {footer}
    </section>
  );
}

export interface DataTableProps {
  caption: string;
  head: string[];
  rows: { key: string; cells: (string | number)[] }[];
}

/** The chart's numbers for screen readers. The wrapper clips: overflow does not clip a box with display: table. */
export function DataTable({ caption, head, rows }: DataTableProps) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.cells[0]}</th>
              {r.cells.slice(1).map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  /** A CSS colour, normally a token: `var(--stream-drained)`. */
  colour: string;
}

export function Legend({ items, label }: { items: LegendItem[]; label: string }) {
  return (
    <ul className="v2r-legend" aria-label={label}>
      {items.map((it) => (
        <li key={it.key} className="v2r-legend-item">
          <span className="v2r-legend-key" style={{ background: it.colour }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** SVG transform that scales about a fixed x (bars growing sideways from their start) or y (from the baseline). */
export function growX(originX: number, k: number): string | undefined {
  return k >= 1 ? undefined : `translate(${originX} 0) scale(${k} 1) translate(${-originX} 0)`;
}
export function growY(originY: number, k: number): string | undefined {
  return k >= 1 ? undefined : `translate(0 ${originY}) scale(1 ${k}) translate(0 ${-originY})`;
}

import type { CSSProperties, ReactNode } from 'react';

/** Colour tokens a legend swatch can use, named as in tokens.css without the leading dashes. */
export type SwatchToken =
  | 'band-2031'
  | 'band-2036'
  | 'band-2050'
  | 'band-after'
  | 'band-closed'
  | 'band-nodate'
  | 'stream-drained'
  | 'stream-vam'
  | 'stream-amm';

export interface LegendRowProps {
  swatch: SwatchToken;
  label: string;
  /** The right-hand figure, for example a mine count. */
  count?: ReactNode;
}

export function LegendRow({ swatch, label, count }: LegendRowProps) {
  const hollow = swatch === 'band-nodate';
  const style: CSSProperties | undefined = hollow ? undefined : { background: `var(--${swatch})` };
  return (
    <li className="legend-row">
      <span
        className={hollow ? 'legend-swatch legend-swatch-hollow' : 'legend-swatch'}
        style={style}
        aria-hidden="true"
      />
      <span className="legend-label">{label}</span>
      {count !== undefined ? <span className="num legend-count">{count}</span> : null}
    </li>
  );
}

export function LegendList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className="legend" aria-label={label}>
      {children}
    </ul>
  );
}

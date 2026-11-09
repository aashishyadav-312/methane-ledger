import type { CSSProperties, ReactNode } from 'react';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  note?: string;
}

export function MetricTile({ label, value, note }: MetricTileProps) {
  return (
    <div className="metric-tile">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}

export interface MetricGridProps {
  /** Columns on wide screens (phones always use two). Use a tile count that fills the last row. */
  columns?: 2 | 3;
  children: ReactNode;
}

export function MetricGrid({ columns = 2, children }: MetricGridProps) {
  return (
    <div className="metric-grid" style={{ '--cols': columns } as CSSProperties}>
      {children}
    </div>
  );
}

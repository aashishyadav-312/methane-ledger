import type { ReactNode } from 'react';

export interface VerdictPillProps {
  verdict: 'ok' | 'short';
  /** For example "Covered at $15" or "Short by $3.50 a tonne". The words carry the verdict, not the colour. */
  children: ReactNode;
}

export function VerdictPill({ verdict, children }: VerdictPillProps) {
  return <span className={`pill pill-${verdict}`}>{children}</span>;
}

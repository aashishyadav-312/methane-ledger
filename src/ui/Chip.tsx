import type { ReactNode } from 'react';

export interface ChipProps {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: ReactNode;
}

/** A toggle chip. State is announced with `aria-pressed`. */
export function Chip({ pressed, onPressedChange, children }: ChipProps) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={() => onPressedChange(!pressed)}>
      {children}
    </button>
  );
}

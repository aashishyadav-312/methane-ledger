import type { HoverTarget } from './geometry';

/** The mine the tooltip shows, and where (viewBox units). `source` says what opened it. */
export interface HoverState {
  key: string;
  target: HoverTarget;
  x: number;
  y: number;
  source: 'pointer' | 'list';
}

type Listener = () => void;

/**
 * A tiny store for the map tooltip. The map SVG never subscribes to it, so hovering re-renders only the tooltip.
 * One map page exists at a time, so one store is enough.
 */
function createHoverStore() {
  let state: HoverState | null = null;
  const listeners = new Set<Listener>();
  return {
    get: (): HoverState | null => state,
    set(next: HoverState | null) {
      if (next === state || (next && state && next.key === state.key && next.source === state.source)) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const hoverStore = createHoverStore();

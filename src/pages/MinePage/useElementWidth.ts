import { useCallback, useState } from 'react';

/**
 * The content width of an element, kept up to date with a ResizeObserver. Until the first measurement (and in
 * test environments without ResizeObserver) it returns `fallbackPx`.
 */
export function useElementWidth(fallbackPx: number): [(el: HTMLElement | null) => (() => void) | void, number] {
  const [width, setWidth] = useState(fallbackPx);
  const ref = useCallback((el: HTMLElement | null) => {
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

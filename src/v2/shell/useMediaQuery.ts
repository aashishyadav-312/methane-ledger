import { useCallback, useSyncExternalStore } from 'react';

/** The phone breakpoint, the same 720px as the phone overrides in `tokens.css`. */
export const PHONE_QUERY = '(max-width: 720px)';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Whether a CSS media query matches now, updating when it changes. `false` where `matchMedia` is missing (tests). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => canMatch() && window.matchMedia(query).matches,
    () => false,
  );
}

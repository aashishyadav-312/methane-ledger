import { useMemo, useSyncExternalStore } from 'react';

// A small hash router. Routes look like `#/mine/bccl-moonidih?p=15`.
// The query string never takes part in matching and is handed on untouched.

export type Route =
  | { name: 'map' }
  | { name: 'mine'; id: string }
  | { name: 'compare' }
  | { name: 'method' }
  | { name: 'assumptions' }
  | { name: 'sources' }
  | { name: 'data' }
  | { name: 'ui' }
  | { name: 'notFound'; path: string };

export interface RouteLocation {
  route: Route;
  /** Normalised path without the query, for example `/mine/bccl-moonidih`. */
  path: string;
  query: URLSearchParams;
}

const STATIC_ROUTES: Record<string, Route> = {
  '/': { name: 'map' },
  '/compare': { name: 'compare' },
  '/method': { name: 'method' },
  '/assumptions': { name: 'assumptions' },
  '/sources': { name: 'sources' },
  '/data': { name: 'data' },
  '/ui': { name: 'ui' },
};

export function parseHash(hash: string): RouteLocation {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryStart = raw.indexOf('?');
  const rawPath = queryStart >= 0 ? raw.slice(0, queryStart) : raw;
  const query = new URLSearchParams(queryStart >= 0 ? raw.slice(queryStart + 1) : '');

  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const fixed = STATIC_ROUTES[path];
  if (fixed) return { route: fixed, path, query };

  const parts = path.split('/'); // ['', 'mine', 'id']
  if (parts.length === 3 && parts[1] === 'mine' && parts[2] !== '') {
    try {
      return { route: { name: 'mine', id: decodeURIComponent(parts[2]) }, path, query };
    } catch {
      // A malformed escape such as %E0 falls through to "not found".
    }
  }
  return { route: { name: 'notFound', path }, path, query };
}

export type QueryValues = Record<string, string | number | boolean>;

/** Build a hash link: `routeHref('/mine/bccl-moonidih', { p: 15 })` is `#/mine/bccl-moonidih?p=15`. */
export function routeHref(path: string, query?: QueryValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) params.set(key, String(value));
  const text = params.toString();
  return `#${path}${text ? `?${text}` : ''}`;
}

export function mineHref(id: string, query?: QueryValues): string {
  return routeHref(`/mine/${encodeURIComponent(id)}`, query);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;
const getServerHash = () => '';

/**
 * The current location. It updates on `hashchange` only. Writing the query with
 * `history.replaceState` (as the mine page does) does not fire that event, so pages that keep state in
 * the query read it themselves.
 */
export function useRouteLocation(): RouteLocation {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  return useMemo(() => parseHash(hash), [hash]);
}

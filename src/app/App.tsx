import { lazy, Suspense, useEffect, useRef } from 'react';
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/components.css';
import { sectionForRoute } from '../v2/shell/sections';
import { ShellV2 } from '../v2/shell/ShellV2';
import { HomeV2, MINE_LAYOUT, MineView } from '../v2/shell/slots';
import { LoadError } from './LoadError';
import { NotFound } from './NotFound';
import { useRouteLocation, type Route } from './router';

// The About pages, Compare, Data and the component gallery load when their route opens, so the home stays light.
// Each lazy module exposes one named export.
const AssumptionsV2 = lazy(() =>
  import('../v2/pages/assumptions/AssumptionsV2').then((m) => ({ default: m.AssumptionsV2 })),
);
const CompareV2 = lazy(() => import('../v2/pages/compare/CompareV2').then((m) => ({ default: m.CompareV2 })));
const DataV2 = lazy(() => import('../v2/pages/data/DataV2').then((m) => ({ default: m.DataV2 })));
const MethodV2 = lazy(() => import('../v2/pages/method/MethodV2').then((m) => ({ default: m.MethodV2 })));
const SourcesV2 = lazy(() => import('../v2/pages/sources/SourcesV2').then((m) => ({ default: m.SourcesV2 })));
const UiGallery = lazy(() => import('./UiGallery').then((m) => ({ default: m.UiGallery })));

const SITE = 'Methane Ledger';

const TITLES: Record<Route['name'], string> = {
  map: SITE,
  mine: `Mine model · ${SITE}`,
  compare: `Compare · ${SITE}`,
  method: `Method · ${SITE}`,
  assumptions: `Assumptions · ${SITE}`,
  sources: `Sources · ${SITE}`,
  data: `Data · ${SITE}`,
  ui: `Component gallery · ${SITE}`,
  notFound: `Page not found · ${SITE}`,
};

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'map':
      return <HomeV2 />;
    case 'mine':
      return <MineView />;
    case 'compare':
      return <CompareV2 />;
    case 'method':
      return <MethodV2 />;
    case 'assumptions':
      return <AssumptionsV2 />;
    case 'sources':
      return <SourcesV2 />;
    case 'data':
      return <DataV2 />;
    case 'ui':
      return <UiGallery />;
    case 'notFound':
      return <NotFound />;
  }
}

/** The home is a full-screen view under a floating header; every other page is a header bar, the page and a footer. */
function layoutFor(route: Route): 'map' | 'page' {
  if (route.name === 'map') return 'map';
  if (route.name === 'mine') return MINE_LAYOUT;
  return 'page';
}

/** React hides the old page with `display: none` while a lazy page loads; such a heading cannot take focus. */
function hiddenByAncestor(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n.hidden || n.style.display === 'none') return true;
  return false;
}

/** Focuses the page's H1. Returns false while there is none on screen (a lazy page or mine session still loading). */
function focusHeading(): boolean {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading || hiddenByAncestor(heading)) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  return true;
}

export function App() {
  const { route, path } = useRouteLocation();
  const shownPath = useRef<string | null>(null);
  // The path whose H1 still wants focus after a route change (cleared once it has it).
  const focusFor = useRef<string | null>(null);

  useEffect(() => {
    document.title = TITLES[route.name];
  }, [route.name]);

  // Keyed on the path alone, so a query-only change keeps scroll and focus and does not end a pending focus watch.
  useEffect(() => {
    if (shownPath.current !== path) {
      const firstLoad = shownPath.current === null;
      shownPath.current = path;
      if (firstLoad) return; // do not steal focus from the browser on first load
      window.scrollTo(0, 0);
      focusFor.current = path;
    }
    if (focusFor.current !== path) return;
    if (focusHeading()) {
      focusFor.current = null;
      return;
    }
    // The page's code (or a mine's session) is still loading: focus its H1 as soon as it is on screen. Any lazy part
    // of the tree is covered, wherever its Suspense boundary sits, and the watch ends with the route.
    const main = document.querySelector('main');
    if (!main) return;
    const watch = new MutationObserver(() => {
      if (!focusHeading()) return;
      focusFor.current = null;
      watch.disconnect();
    });
    watch.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    return () => watch.disconnect();
  }, [path]);

  return (
    <ShellV2 section={sectionForRoute(route)} routeKey={path} layout={layoutFor(route)}>
      <LoadError resetKey={path}>
        <Suspense fallback={null}>
          <RouteView route={route} />
        </Suspense>
      </LoadError>
    </ShellV2>
  );
}

import { lazy, Suspense, useEffect, useRef } from 'react';
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/components.css';
import { sectionForRoute } from '../v2/shell/sections';
import { ShellV2 } from '../v2/shell/ShellV2';
import { HomeV2, MINE_LAYOUT, MineView } from '../v2/shell/slots';
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

function focusHeading() {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export function App() {
  const { route, path } = useRouteLocation();
  const shownPath = useRef<string | null>(null);

  useEffect(() => {
    document.title = TITLES[route.name];
    if (shownPath.current === path) return; // a query-only change keeps scroll and focus
    const firstLoad = shownPath.current === null;
    shownPath.current = path;
    if (firstLoad) return; // do not steal focus from the browser on first load
    window.scrollTo(0, 0);
    focusHeading();
  }, [route, path]);

  return (
    <ShellV2 section={sectionForRoute(route)} routeKey={path} layout={layoutFor(route)}>
      <Suspense fallback={null}>
        <RouteView route={route} />
      </Suspense>
    </ShellV2>
  );
}

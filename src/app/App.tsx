import { useEffect, useRef } from 'react';
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/components.css';
import { AssumptionsV2, CompareV2, DataV2, MethodV2, SourcesV2 } from '../v2/pages';
import { sectionForRoute } from '../v2/shell/sections';
import { ShellV2 } from '../v2/shell/ShellV2';
import { HomeV2, MINE_LAYOUT, MineView } from '../v2/shell/slots';
import { NotFound } from './NotFound';
import { UiGallery } from './UiGallery';
import { useRouteLocation, type Route } from './router';

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
      <RouteView route={route} />
    </ShellV2>
  );
}

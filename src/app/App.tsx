import { useEffect, useRef } from 'react';
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/components.css';
import { AssumptionsPage } from '../pages/AssumptionsPage';
import { ComparePage } from '../pages/ComparePage';
import { DataPage } from '../pages/DataPage';
import { MapPage } from '../pages/MapPage';
import { MethodPage } from '../pages/MethodPage';
import { MinePage } from '../pages/MinePage';
import { SourcesPage } from '../pages/SourcesPage';
import { PageLayout, type NavKey } from '../ui';
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

const NAV_FOR_ROUTE: Partial<Record<Route['name'], NavKey>> = {
  map: 'map',
  mine: 'map',
  compare: 'compare',
  data: 'data',
  method: 'method',
  assumptions: 'assumptions',
  sources: 'sources',
};

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'map':
      return <MapPage />;
    case 'mine':
      return <MinePage />;
    case 'compare':
      return <ComparePage />;
    case 'method':
      return <MethodPage />;
    case 'assumptions':
      return <AssumptionsPage />;
    case 'sources':
      return <SourcesPage />;
    case 'data':
      return <DataPage />;
    case 'ui':
      return <UiGallery />;
    case 'notFound':
      return <NotFound />;
  }
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
    <PageLayout current={NAV_FOR_ROUTE[route.name]}>
      <RouteView route={route} />
    </PageLayout>
  );
}

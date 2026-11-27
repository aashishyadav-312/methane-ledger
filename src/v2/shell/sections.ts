import type { Route } from '../../app/router';

/** The sections the nav can mark as current. About is a menu, so its pages are marked on the About button. */
export type NavSection = 'map' | 'data' | 'compare' | 'method' | 'assumptions' | 'sources';

export interface AboutItem {
  key: Extract<NavSection, 'compare' | 'method' | 'assumptions' | 'sources'>;
  label: string;
  /** The one-line description shown under the label in the About menu. */
  description: string;
  href: string;
}

/** Copy follows DESIGN_V2 "Copy": sentence case, no numbers that the app computes. */
export const ABOUT_ITEMS: readonly AboutItem[] = [
  { key: 'compare', label: 'Compare', description: 'Which mines can pay for their methane, side by side', href: '#/compare' },
  { key: 'method', label: 'Method', description: 'How gas becomes credits, and the break-even formula', href: '#/method' },
  {
    key: 'assumptions',
    label: 'Assumptions',
    description: 'Every input, with its source and how far to trust it',
    href: '#/assumptions',
  },
  { key: 'sources', label: 'Sources', description: 'Where the mine, price and cost data come from', href: '#/sources' },
];

/** The v1 site, served from the site root while v2 lives under `/v2/` (PLAN_V2 Step 0). */
export const V1_SITE_HREF = '/methane-ledger/';

export const V1_SITE_LABEL = 'Version 1 site';

export const INSTITUTE_LINE = 'Nicholas Institute, Duke University';

const SECTION_FOR_ROUTE: Partial<Record<Route['name'], NavSection>> = {
  map: 'map',
  mine: 'map',
  data: 'data',
  compare: 'compare',
  method: 'method',
  assumptions: 'assumptions',
  sources: 'sources',
};

/** The nav section a route belongs to, or `undefined` for pages outside the nav (the gallery, not found). */
export function sectionForRoute(route: Route): NavSection | undefined {
  return SECTION_FOR_ROUTE[route.name];
}

export function isAboutSection(section: NavSection | undefined): boolean {
  return ABOUT_ITEMS.some((item) => item.key === section);
}

import { NavMenu, type MenuLink } from './NavMenu';
import { ABOUT_ITEMS, INSTITUTE_LINE, V1_SITE_HREF, V1_SITE_LABEL, isAboutSection, type NavSection } from './sections';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';

export interface HeaderV2Props {
  /** The section of the current page, marked with `aria-current="page"`. */
  section?: NavSection;
  /** Changes with the route; a change closes any open menu. */
  routeKey: string;
  /**
   * `overlay`: the header floats over a full-screen map. `bar`: the header sits above a normal page, lined up
   * with the page width.
   */
  layout: 'overlay' | 'bar';
}

function Chevron() {
  return (
    <svg
      className="v2-chevron"
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

function aboutLinks(section: NavSection | undefined, withDescriptions: boolean): MenuLink[] {
  return ABOUT_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    description: withDescriptions ? item.description : undefined,
    current: item.key === section,
  }));
}

const versionOneLink: MenuLink = {
  key: 'v1',
  label: V1_SITE_LABEL,
  href: V1_SITE_HREF,
  note: INSTITUTE_LINE,
};

/** The wordmark, the "Research preview" pill, and the nav: Map, Data, and the About menu. */
export function HeaderV2({ section, routeKey, layout }: HeaderV2Props) {
  const phone = useMediaQuery(PHONE_QUERY);
  const aboutCurrent = isAboutSection(section);

  const phoneLinks: MenuLink[] = [
    { key: 'map', label: 'Map', href: '#/', current: section === 'map' },
    { key: 'data', label: 'Data', href: '#/data', current: section === 'data' },
    ...aboutLinks(section, false).map((link, index) => (index === 0 ? { ...link, ruleAbove: true } : link)),
    versionOneLink,
  ];

  return (
    <header className={`v2-header v2-header--${layout}`}>
      <div className={layout === 'bar' ? 'v2-header-inner page-width' : 'v2-header-inner'}>
        <div className="v2-brand">
          <a className="v2-wordmark" href="#/">
            Methane Ledger
          </a>
          <span className="v2-pill">Research preview</span>
        </div>
        {phone ? (
          <nav aria-label="Main" className="v2-nav">
            <NavMenu
              buttonLabel="Menu"
              buttonClassName="v2-nav-icon"
              links={phoneLinks}
              routeKey={routeKey}
            >
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 8h16M4 16h16" />
              </svg>
            </NavMenu>
          </nav>
        ) : (
          <nav aria-label="Main" className="v2-nav">
            <a href="#/" aria-current={section === 'map' ? 'page' : undefined}>
              Map
            </a>
            <a href="#/data" aria-current={section === 'data' ? 'page' : undefined}>
              Data
            </a>
            <NavMenu
              buttonClassName="v2-nav-button"
              buttonCurrent={aboutCurrent}
              links={[...aboutLinks(section, true), versionOneLink]}
              routeKey={routeKey}
            >
              About
              <Chevron />
            </NavMenu>
          </nav>
        )}
      </div>
    </header>
  );
}

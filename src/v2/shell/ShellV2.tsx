import { useRef, type ReactNode } from 'react';
import { Footer } from '../../ui';
import { HeaderV2 } from './HeaderV2';
import type { NavSection } from './sections';
import './shell.css';

export interface ShellV2Props {
  section?: NavSection;
  /** Changes with the route; closes an open menu. */
  routeKey: string;
  /**
   * `map`: the header floats over a full-screen view and there is no footer (the home and the mine view).
   * `page`: a header bar, the page, then the site footer (Compare, Method, Data and the rest).
   */
  layout: 'map' | 'page';
  children: ReactNode;
}

/** The v2 frame: skip link, header with the About menu, the main region and, on pages, the footer. */
export function ShellV2({ section, routeKey, layout, children }: ShellV2Props) {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <div className={`v2-shell v2-shell--${layout}`}>
      {/* A button, not a "#main" link: a hash link would change the route. */}
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <HeaderV2 section={section} routeKey={routeKey} layout={layout === 'map' ? 'overlay' : 'bar'} />
      <main id="main" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
      {layout === 'page' ? <Footer /> : null}
    </div>
  );
}

import { useRef, type ReactNode } from 'react';
import { Footer } from './Footer';
import { Header, type NavKey } from './Header';

export interface PageLayoutProps {
  current?: NavKey;
  children: ReactNode;
}

/** Header, main region and footer. Pages bring their own `.page-width` wrapper. */
export function PageLayout({ current, children }: PageLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <>
      {/* A button, not a "#main" link: a hash link would change the route. */}
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <Header current={current} />
      <main id="main" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}

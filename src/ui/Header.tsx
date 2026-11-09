export type NavKey = 'map' | 'method' | 'sources';

const NAV: readonly { key: NavKey; label: string; href: string }[] = [
  { key: 'map', label: 'Map', href: '#/' },
  { key: 'method', label: 'Method', href: '#/method' },
  { key: 'sources', label: 'Sources', href: '#/sources' },
];

export interface HeaderProps {
  /** The nav item for the current page, marked with `aria-current="page"`. */
  current?: NavKey;
}

export function Header({ current }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="page-width">
        <div className="brand">
          <a className="wordmark" href="#/">
            Methane Ledger
          </a>
          <span className="preview-badge">Research preview</span>
        </div>
        <nav aria-label="Main" className="site-nav">
          {NAV.map((item) => (
            <a key={item.key} href={item.href} aria-current={item.key === current ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

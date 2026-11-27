import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuLink {
  key: string;
  label: string;
  href: string;
  /** One line under the label. */
  description?: string;
  /** Marks the page you are on (`aria-current="page"`). */
  current?: boolean;
  /** A line of plain text shown on the same row, before the link (the footer row of the About menu). */
  note?: string;
  /** Draw a rule above this link. */
  ruleAbove?: boolean;
}

export interface NavMenuProps {
  /** The text or icon inside the button. */
  children: ReactNode;
  /** Accessible name for an icon-only button. */
  buttonLabel?: string;
  buttonClassName: string;
  /** The button marks `aria-current="page"` when the current page is inside this menu. */
  buttonCurrent?: boolean;
  links: readonly MenuLink[];
  /** Changes when the route does; a change closes the menu. */
  routeKey: string;
}

/**
 * A menu button with a popover of links (WAI-ARIA menu button pattern).
 *
 * - Opens on click, Enter, Space, or the arrow keys, and focuses a link.
 * - Arrow keys, Home, End and typing a letter move between links. Esc closes and returns focus to the button.
 *   Tab, a click outside, or a route change also close it.
 * - Scales in from 0.97 at its top-right corner over 150 ms (see shell.css). Reduced motion fades instead.
 */
export function NavMenu({
  children,
  buttonLabel,
  buttonClassName,
  buttonCurrent,
  links,
  routeKey,
}: NavMenuProps) {
  const uid = useId();
  const buttonId = `${uid}-button`;
  const menuId = `${uid}-menu`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const firstFocus = useRef<'first' | 'last'>('first');
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [seenRoute, setSeenRoute] = useState(routeKey);

  // A route change closes the menu. Adjusting state while rendering avoids a flash of the open menu.
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    setOpen(false);
  }

  // Move focus into the menu once it has opened.
  useEffect(() => {
    if (!open) return;
    const items = itemRefs.current.filter((el): el is HTMLAnchorElement => el !== null);
    (firstFocus.current === 'last' ? items[items.length - 1] : items[0])?.focus();
  }, [open]);

  // A press outside closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openWith = (where: 'first' | 'last') => {
    firstFocus.current = where;
    setOpen(true);
  };

  const closeToButton = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const focusAt = (index: number) => {
    const items = itemRefs.current.filter((el): el is HTMLAnchorElement => el !== null);
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openWith('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openWith('last');
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((el): el is HTMLAnchorElement => el !== null);
    const at = items.findIndex((el) => el === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(at + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(at - 1);
        return;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        return;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default: {
        // Typing letters jumps to the link that starts with them.
        if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
        const now = event.timeStamp;
        const text = (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase();
        typed.current = { text, at: now };
        const from = text.length === 1 ? at + 1 : at;
        for (let i = 0; i < items.length; i++) {
          const item = items[(from + i + items.length) % items.length];
          if (item.dataset.label?.toLowerCase().startsWith(text)) {
            event.preventDefault();
            item.focus();
            return;
          }
        }
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      className="v2-menu-wrap"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          closeToButton();
        }
      }}
      onBlur={(event) => {
        // Focus leaving the button and the menu (for example by Tab) closes it.
        if (open && !wrapRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={buttonClassName}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-current={buttonCurrent ? 'page' : undefined}
        onClick={() => (open ? setOpen(false) : openWith('first'))}
        onKeyDown={onButtonKeyDown}
      >
        {children}
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-labelledby={buttonId} className="v2-menu" onKeyDown={onMenuKeyDown}>
          {links.map((link, index) => {
            const anchor = (
              <a
                key={link.key}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                role="menuitem"
                tabIndex={-1}
                href={link.href}
                data-label={link.label}
                aria-current={link.current ? 'page' : undefined}
                className={link.description ? 'v2-menu-item' : 'v2-menu-item v2-menu-item--plain'}
                onClick={() => setOpen(false)}
              >
                <span className="v2-menu-label">{link.label}</span>
                {link.description ? <span className="v2-menu-desc">{link.description}</span> : null}
              </a>
            );
            if (link.note) {
              return (
                <div key={link.key} role="none" className="v2-menu-foot">
                  <span>{link.note}</span>
                  {anchor}
                </div>
              );
            }
            return link.ruleAbove ? (
              <div key={link.key} role="none" className="v2-menu-rule-wrap">
                <div role="separator" className="v2-menu-rule" />
                {anchor}
              </div>
            ) : (
              anchor
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

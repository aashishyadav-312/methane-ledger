import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { MineId } from '../contracts';
import { matchRange, rank, type RankedMine, type SearchableMine } from './rank';
import './search.css';

export interface MineSearchProps<M extends SearchableMine = SearchableMine> {
  /** Every mine the box can find. The home passes the v2 mines through the map adapter. */
  mines: readonly M[];
  /** Called with the chosen mine's id (Enter on the active row, or a click). */
  onSelect(id: MineId): void;
  placeholder?: string;
  /** Focus the box on mount. */
  autoFocus?: boolean;
  className?: string;
}

const TYPE_WORDS: Record<string, string> = { UG: 'underground', OC: 'opencast', Mixed: 'mixed' };

/** "runs out 2034", "runs out after 2225" (a year beyond the model's horizon), or "no date". */
export function runoutText(mine: Pick<SearchableMine, 'runoutYear' | 'runoutLabel' | 'band'>): string {
  if (mine.runoutYear !== null) return `runs out ${mine.runoutYear}`;
  return mine.band === 'nodate' ? 'no date' : `runs out ${mine.runoutLabel.toLowerCase()}`;
}

/** "BCCL, Jharkhand, underground". */
export function detailText(mine: SearchableMine): string {
  return [mine.company, mine.state, TYPE_WORDS[mine.type] ?? mine.type.toLowerCase()].join(', ');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const range = matchRange(name, query);
  if (!range) return <>{name}</>;
  const [start, end] = range;
  return (
    <>
      {name.slice(0, start)}
      <span className="v2-search-hit">{name.slice(start, end)}</span>
      {name.slice(end)}
    </>
  );
}

/**
 * The mine search box: an ARIA 1.2 combobox with a listbox of the top matches. "/" focuses it from anywhere on
 * the page; Esc clears it and closes the list.
 */
export function MineSearch<M extends SearchableMine = SearchableMine>({
  mines,
  onSelect,
  placeholder = 'Search a mine, company or state',
  autoFocus = false,
  className,
}: MineSearchProps<M>) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);

  const { results, total } = useMemo(() => rank(query, mines), [query, mines]);
  const hasQuery = query.trim() !== '';
  const listOpen = open && hasQuery;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // "/" focuses the box, unless the person is already typing somewhere.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const choose = useCallback(
    (ranked: RankedMine<M>) => {
      setQuery(ranked.mine.name);
      setOpen(false);
      onSelect(ranked.mine.id);
    },
    [onSelect],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!hasQuery) return;
        event.preventDefault();
        if (!listOpen) {
          setOpen(true);
          return;
        }
        if (results.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + results.length) % results.length);
        return;
      }
      case 'Enter': {
        if (!listOpen || results.length === 0) return;
        event.preventDefault();
        choose(results[activeIndex]);
        return;
      }
      case 'Escape': {
        // First Esc clears the text; the list closes with it. With nothing typed it just closes the list.
        if (hasQuery || open) {
          event.preventDefault();
          setQuery('');
          setOpen(false);
          setActive(0);
        }
        return;
      }
    }
  };

  const countText = hasQuery ? `${total} of ${mines.length}` : '';
  const activeId = listOpen && results.length > 0 ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className={['v2-search', className].filter(Boolean).join(' ')}>
      <div className="v2-search-field" data-open={listOpen || undefined} data-focused={focused || undefined}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="8.5" cy="8.5" r="6" />
          <path d="M13 13l4.5 4.5" />
        </svg>
        <label htmlFor={inputId} className="sr-only">
          Search mines
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listOpen && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
        />
        {hasQuery ? (
          <span className="v2-search-count num" aria-hidden="true">
            {countText}
          </span>
        ) : (
          <kbd className="v2-search-key" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      <div className="sr-only" role="status">
        {hasQuery ? (total === 0 ? 'No mines match' : `${total} of ${mines.length} mines match`) : ''}
      </div>

      {listOpen ? (
        <div className="v2-search-panel">
          <ul id={listId} role="listbox" aria-label="Matching mines" className="v2-search-list" hidden={results.length === 0}>
            {results.map(({ mine }, index) => (
              <li
                key={mine.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className="v2-search-row"
                // A press must not blur the input, or the list would close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(results[index])}
              >
                <span className={`v2-dot v2-dot--${mine.band}`} aria-hidden="true" />
                <span className="v2-search-text">
                  <span className="v2-search-name">
                    <HighlightedName name={mine.name} query={query} />
                  </span>
                  <span className="v2-search-detail">{detailText(mine)}</span>
                </span>
                <span className="v2-search-runout num">{runoutText(mine)}</span>
              </li>
            ))}
          </ul>
          {results.length === 0 ? (
            <p className="v2-search-empty">No mine matches &apos;{query.trim()}&apos;. Try a company or state.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

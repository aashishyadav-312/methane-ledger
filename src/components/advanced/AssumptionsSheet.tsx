import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { REGISTRY_GROUPS, type RegistryEntry, type RegistryGroup } from '../../data/registry';
import type { CostModel } from '../../model/types';
import { Segmented, Tag } from '../../ui';
import { clean, formatValue, fromShown, rangeText, toShown } from './values';
import './advanced.css';

/** Changes apply this long after the last keystroke (PLAN_V1 Step 13b). */
export const APPLY_DELAY_MS = 150;
/** Matches `--dur-settle`: the sheet stays mounted this long after closing, so it can slide out. */
const CLOSE_MS = 200;

export interface SheetRow {
  entry: RegistryEntry;
  value: number | boolean;
  defaultValue: number | boolean;
  /** Fixed choices, for a value whose mine page control offers only these (for example the discount rate). */
  options?: readonly number[];
  /** Replaces the registry range, for example the closure year inside the crediting window. */
  range?: { min: number; max: number };
}

export interface AssumptionsSheetProps {
  open: boolean;
  onClose: () => void;
  rows: SheetRow[];
  costModel: CostModel;
  defaultCostModel: CostModel;
  onCostModel: (costModel: CostModel) => void;
  onChange: (path: string, value: number | boolean) => void;
  onResetAll: () => void;
}

const COST_BASIS_OPTIONS: { value: CostModel; label: string }[] = [
  { value: 'buildup', label: 'India build-up' },
  { value: 'v1', label: 'v1 all-in unit costs' },
];

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';

const isChanged = (r: SheetRow) => r.value !== r.defaultValue;

/** The "All assumptions" side sheet: every registry value, grouped, searchable, each with its default and source. */
export function AssumptionsSheet(props: AssumptionsSheetProps) {
  const { open } = props;
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Opening mounts the sheet in the same render (state adjusted while rendering, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMounted(true);
  }

  // Slide in on the next frame; on close, slide out (the class follows `open`), then unmount.
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => {
      setShown(false);
      setMounted(false);
    }, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;
  return <Sheet {...props} shown={shown} />;
}

function Sheet({
  open,
  shown,
  onClose,
  rows,
  costModel,
  defaultCostModel,
  onCostModel,
  onChange,
  onResetAll,
}: AssumptionsSheetProps & { shown: boolean }) {
  const titleId = useId();
  const tabsId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [group, setGroup] = useState<RegistryGroup>('Market');
  const [query, setQuery] = useState('');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Focus the search box on open, and lock the page behind. On close, give focus back to whatever opened the sheet
  // at once, while the sheet slides out.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    search.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      // After the key event that closed the sheet has finished, so its default action cannot take focus back.
      const target = opener.current;
      setTimeout(() => target?.focus(), 0);
    };
  }, [open]);

  const changed = rows.filter(isChanged).length + (costModel !== defaultCostModel ? 1 : 0);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q === ''
        ? rows.filter((r) => r.entry.group === group)
        : rows.filter((r) => r.entry.label.toLowerCase().includes(q)),
    [rows, group, q],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Without this, Escape's default action in the search box takes focus back from the opener.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || dialog.current === null) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? REGISTRY_GROUPS.length - 1 : null;
    if (step === 0 && to === null) return;
    e.preventDefault();
    const next = to ?? (i + step + REGISTRY_GROUPS.length) % REGISTRY_GROUPS.length;
    setGroup(REGISTRY_GROUPS[next]);
    tabs.current[next]?.focus();
  };

  const countIn = (g: RegistryGroup) => rows.filter((r) => r.entry.group === g).length;
  const sections = groupBySection(visible, q !== '');

  return (
    <div className={`adv-root${shown && open ? ' is-open' : ''}`}>
      <div className="adv-scrim" onClick={onClose} aria-hidden="true" data-testid="adv-scrim" />
      <div
        ref={dialog}
        className="adv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        data-testid="adv-sheet"
      >
        <div className="adv-head">
          <div className="adv-title-row">
            <h2 id={titleId} className="adv-title">
              All assumptions
            </h2>
            <button type="button" className="adv-close" aria-label="Close" onClick={onClose}>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          </div>
          <input
            ref={search}
            type="search"
            className="adv-search"
            placeholder="Search by name"
            aria-label="Search assumptions by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="adv-tabs" role="tablist" aria-label="Groups">
            {REGISTRY_GROUPS.map((g, i) => (
              <button
                key={g}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${tabsId}-${i}`}
                aria-selected={q === '' && g === group}
                aria-controls={`${tabsId}-panel`}
                tabIndex={g === group ? 0 : -1}
                className="adv-tab"
                onClick={() => {
                  setGroup(g);
                  setQuery('');
                }}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {g} <span className="adv-tab-count num">{countIn(g)}</span>
              </button>
            ))}
          </div>
          <div className="adv-status">
            <span className="num" data-testid="adv-changed" aria-live="polite">
              {changed} changed
            </span>
            <button type="button" className="btn btn-link adv-reset-all" disabled={changed === 0} onClick={onResetAll}>
              Reset all
            </button>
          </div>
        </div>

        <div
          className="adv-body"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={q === '' ? `${tabsId}-${REGISTRY_GROUPS.indexOf(group)}` : undefined}
          aria-label={q === '' ? undefined : 'Search results'}
        >
          {q === '' && group === 'Costs' ? (
            <div className="adv-basis">
              <Segmented<CostModel>
                label="Cost basis"
                options={COST_BASIS_OPTIONS}
                value={costModel}
                onChange={onCostModel}
              />
              <p className="control-note">
                {costModel === 'buildup'
                  ? 'Equipment, materials, installation labour and civil works, with Indian cost factors.'
                  : "v1's all-in unit costs from US, Chinese and global projects. The build-up values below are not used."}
              </p>
            </div>
          ) : null}
          {q !== '' && visible.length === 0 ? <p className="control-note">Nothing matches “{query.trim()}”.</p> : null}
          {sections.map((s) => (
            <section key={s.key} className="adv-section">
              {s.title ? <h3 className="t-caps adv-section-title">{s.title}</h3> : null}
              <ul className="adv-rows">
                {s.rows.map((r) => (
                  <Row key={r.entry.path} row={r} onChange={onChange} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Section {
  key: string;
  title: string | null;
  rows: SheetRow[];
}

/** Rows in order, split where the section changes. In search results the group name leads each heading. */
function groupBySection(rows: SheetRow[], withGroup: boolean): Section[] {
  const out: Section[] = [];
  for (const r of rows) {
    const parts = [withGroup ? r.entry.group : null, r.entry.section ?? null].filter((x): x is string => x !== null);
    const title = parts.length > 0 ? parts.join(': ') : null;
    const key = `${r.entry.group}|${r.entry.section ?? ''}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, title, rows: [r] });
  }
  return out;
}

function Row({ row, onChange }: { row: SheetRow; onChange: (path: string, value: number | boolean) => void }) {
  const { entry, value, defaultValue } = row;
  const inputId = useId();
  const tipId = useId();
  const errorId = useId();
  const changed = isChanged(row);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className={`adv-row${changed ? ' is-changed' : ''}`} data-path={entry.path}>
      <div className="adv-row-head">
        <span className="adv-dot" aria-hidden="true" />
        <label className="adv-label" htmlFor={inputId}>
          {entry.label}
          {changed ? <span className="sr-only"> (changed)</span> : null}
        </label>
        <span className="adv-source" tabIndex={0} aria-describedby={tipId}>
          <Tag kind={entry.quality} />
          <span role="tooltip" id={tipId} className="adv-tip">
            {entry.source}
          </span>
        </span>
      </div>
      <div className="adv-row-input">
        {typeof value === 'boolean' ? (
          <input
            id={inputId}
            type="checkbox"
            className="adv-check"
            checked={value}
            onChange={(e) => onChange(entry.path, e.target.checked)}
          />
        ) : row.options ? (
          <select
            id={inputId}
            className="adv-input adv-select num"
            value={String(value)}
            onChange={(e) => onChange(entry.path, Number(e.target.value))}
          >
            {(row.options.includes(value) ? row.options : [...row.options, value]).map((o) => (
              <option key={o} value={String(o)}>
                {formatValue(entry, o)}
              </option>
            ))}
          </select>
        ) : (
          <NumberInput
            id={inputId}
            row={row}
            value={value}
            errorId={errorId}
            onError={setError}
            onApply={(x) => onChange(entry.path, x)}
          />
        )}
        <span className="adv-unit">{entry.format === 'pct' && entry.unit === '%' ? '' : entry.unit}</span>
        {changed ? (
          <button
            type="button"
            className="btn btn-link adv-reset"
            aria-label={`Reset ${entry.label} to ${formatValue(entry, defaultValue)}`}
            onClick={() => {
              setError(null);
              onChange(entry.path, defaultValue);
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      <p className="adv-default num">Default {formatValue(entry, defaultValue)}</p>
      {error ? (
        <p className="adv-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

interface NumberInputProps {
  id: string;
  row: SheetRow;
  value: number;
  errorId: string;
  onError: (message: string | null) => void;
  onApply: (stored: number) => void;
}

/** A number box that applies a valid value 150 ms after the last keystroke and holds back an invalid one. */
function NumberInput({ id, row, value, errorId, onError, onApply }: NumberInputProps) {
  const { entry } = row;
  const range = row.range ?? { min: entry.min, max: entry.max };
  const [text, setText] = useState(() => String(toShown(entry, value)));
  const [invalid, setInvalid] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef(value);
  // The timer calls the latest callback, not the one from the keystroke that started it.
  const apply = useRef(onApply);
  useEffect(() => {
    apply.current = onApply;
  });

  // A change from outside (a reset, another link) replaces the text.
  useEffect(() => {
    if (value === applied.current) return;
    applied.current = value;
    setText(String(toShown(entry, value)));
    setInvalid(false);
  }, [value, entry]);

  // Leaving the row (another tab, a search, closing the sheet) applies a pending value instead of dropping it.
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current === null) return;
      clearTimeout(timer.current);
      if (pending.current !== null) apply.current(pending.current);
    },
    [],
  );

  const onInput = (next: string) => {
    setText(next);
    if (timer.current !== null) clearTimeout(timer.current);
    const shown = next.trim() === '' ? NaN : Number(next);
    const stored = Number.isFinite(shown) ? fromShown(entry, shown) : NaN;
    if (!Number.isFinite(stored) || stored < range.min || stored > range.max) {
      setInvalid(true);
      onError(`Enter a number ${rangeText(entry, range)}. This value is not used.`);
      return;
    }
    setInvalid(false);
    onError(null);
    pending.current = stored;
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = null;
      applied.current = stored;
      apply.current(stored);
    }, APPLY_DELAY_MS);
  };

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className="adv-input num"
      min={toShown(entry, range.min)}
      max={toShown(entry, range.max)}
      step={clean(entry.format === 'pct' ? entry.step * 100 : entry.step)}
      value={text}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(e) => onInput(e.target.value)}
    />
  );
}

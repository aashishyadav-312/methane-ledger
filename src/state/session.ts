// Session overrides: changes to assumptions that last for this browser tab (Steps 9 and 10 write them).
// A path names the value it replaces, for example `settings.powerPriceUsdPerMwh`, `tech.power.capexUsdPerKw`,
// `constants.lhvGjPerT` or `mine.bccl-moonidih.drainedConc`. The URL stays the source of truth for the mine page
// controls; these overrides only change the defaults underneath them.

export type OverrideValue = number | boolean | string;
export type Overrides = Readonly<Record<string, OverrideValue>>;

const STORAGE_KEY = 'methane-ledger:overrides';
const EMPTY: Overrides = Object.freeze({});

let current: Overrides = load();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // storage can be blocked (private mode, sandboxed frames)
  }
}

function isOverrideValue(v: unknown): v is OverrideValue {
  return typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

function load(): Overrides {
  try {
    const text = storage()?.getItem(STORAGE_KEY);
    if (!text) return EMPTY;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY;
    const out: Record<string, OverrideValue> = {};
    for (const [k, v] of Object.entries(parsed)) if (isOverrideValue(v)) out[k] = v;
    return Object.freeze(out);
  } catch {
    return EMPTY;
  }
}

function save(next: Overrides): void {
  current = next;
  try {
    const store = storage();
    if (Object.keys(next).length === 0) store?.removeItem(STORAGE_KEY);
    else store?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory copy; storage is a convenience, not a requirement.
  }
  listeners.forEach((fn) => fn());
}

/** The current overrides. The same object is returned until something changes, so it is safe to memoise on. */
export function getOverrides(): Overrides {
  return current;
}

/** Set one override. `undefined` removes it. */
export function setOverride(path: string, value: OverrideValue | undefined): void {
  const next: Record<string, OverrideValue> = { ...current };
  if (value === undefined) delete next[path];
  else next[path] = value;
  save(Object.freeze(next));
}

/** Remove every override. */
export function reset(): void {
  if (current !== EMPTY) save(EMPTY);
}

/** Listen for changes (for `useSyncExternalStore`). Returns the unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The overrides under `prefix`, with the prefix and its dot removed. */
export function overridesUnder(overrides: Overrides, prefix: string): [string, OverrideValue][] {
  const head = `${prefix}.`;
  return Object.entries(overrides)
    .filter(([path]) => path.startsWith(head))
    .map(([path, v]) => [path.slice(head.length), v]);
}

/**
 * A copy of `target` with the overrides under `prefix` written in. Paths are dotted keys into the object
 * (`power.capexUsdPerKw`). A path whose parent is missing, or that would replace an object, is ignored.
 */
export function applyOverrides<T extends object>(target: T, overrides: Overrides, prefix: string): T {
  const entries = overridesUnder(overrides, prefix);
  if (entries.length === 0) return target;
  const out = structuredClone(target);
  for (const [path, value] of entries) {
    const keys = path.split('.');
    let node: Record<string, unknown> = out as Record<string, unknown>;
    let ok = true;
    for (const key of keys.slice(0, -1)) {
      const child = node[key];
      if (typeof child !== 'object' || child === null) {
        ok = false;
        break;
      }
      node = child as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    if (!ok || (typeof node[last] === 'object' && node[last] !== null)) continue;
    node[last] = value;
  }
  return out;
}

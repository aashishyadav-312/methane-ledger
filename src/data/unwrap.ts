import type { Quality } from '../model/types';

/** A wrapped value as stored in `data/*.json`: the value plus where it came from. */
export interface WrappedField {
  value: unknown;
  unit: string;
  source: string;
  quality: Quality;
}

/** Type-level mirror of `unwrap`: replaces every `{ value, unit, source, quality }` with its `value`. */
export type Unwrap<T> = T extends { value: infer V; unit: string; source: string; quality: Quality }
  ? V
  : T extends readonly unknown[]
    ? { [K in keyof T]: Unwrap<T[K]> }
    : T extends object
      ? { [K in keyof T]: Unwrap<T[K]> }
      : T;

export function isWrappedField(x: unknown): x is WrappedField {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return 'value' in o && typeof o.unit === 'string' && typeof o.source === 'string' && typeof o.quality === 'string';
}

/** Strips the `{ value, unit, source, quality }` wrapper everywhere in a validated record. */
export function unwrap<T>(x: T): Unwrap<T> {
  return unwrapAny(x) as Unwrap<T>;
}

function unwrapAny(x: unknown): unknown {
  if (isWrappedField(x)) return x.value;
  if (Array.isArray(x)) return x.map(unwrapAny);
  if (typeof x === 'object' && x !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      if (v !== undefined) out[k] = unwrapAny(v);
    }
    return out;
  }
  return x;
}

export interface FieldAt {
  path: string;
  field: WrappedField;
}

/** Every wrapped field in a record with its path, for provenance tables and the "Illustrative inputs" tag. */
export function collectFields(x: unknown, basePath = ''): FieldAt[] {
  if (isWrappedField(x)) return [{ path: basePath, field: x }];
  const out: FieldAt[] = [];
  if (Array.isArray(x)) {
    x.forEach((v, i) => out.push(...collectFields(v, `${basePath}[${i}]`)));
  } else if (typeof x === 'object' && x !== null) {
    for (const [k, v] of Object.entries(x)) out.push(...collectFields(v, basePath ? `${basePath}.${k}` : k));
  }
  return out;
}

export function listDummyFields(x: unknown, basePath = ''): FieldAt[] {
  return collectFields(x, basePath).filter((f) => f.field.quality === 'dummy');
}

export function hasDummyField(x: unknown): boolean {
  return listDummyFields(x).length > 0;
}

import type { z } from 'zod';

export interface DataIssue {
  /** Path inside the file, such as `[1].captureEff.vam.value`. */
  path: string;
  message: string;
}

/** Thrown when a data file does not match its schema. The message names the file, the path and the expected type. */
export class DataValidationError extends Error {
  readonly file: string;
  readonly issues: DataIssue[];

  constructor(file: string, issues: DataIssue[]) {
    const shown = issues.slice(0, 12).map((i) => `  ${i.path || '(file)'}: ${i.message}`);
    const more = issues.length > shown.length ? [`  ...and ${issues.length - shown.length} more`] : [];
    super([`Invalid data in ${file}`, ...shown, ...more].join('\n'));
    this.name = 'DataValidationError';
    this.file = file;
    this.issues = issues;
  }
}

/** Joins a Zod path into `[1].captureEff.vam.value`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

type RawIssue = z.core.$ZodIssue;

function flatten(issue: RawIssue, base: readonly PropertyKey[]): DataIssue[] {
  const path = [...base, ...issue.path];
  // A failed union carries one list of issues per branch; show the branch that got furthest.
  if (issue.code === 'invalid_union' && Array.isArray(issue.errors) && issue.errors.length > 0) {
    const branches = (issue.errors as RawIssue[][]).map((branch) => branch.flatMap((i) => flatten(i, path)));
    const deepest = branches.reduce((best, b) => (depth(b) > depth(best) ? b : best), branches[0] ?? []);
    if (deepest.length > 0) return deepest;
  }
  return [{ path: formatPath(path), message: issue.message }];
}

function depth(issues: DataIssue[]): number {
  return issues.reduce((m, i) => Math.max(m, i.path.split(/[.[]/).length), 0);
}

export function parseData<S extends z.ZodType>(file: string, schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new DataValidationError(
    file,
    result.error.issues.flatMap((i) => flatten(i, [])),
  );
}

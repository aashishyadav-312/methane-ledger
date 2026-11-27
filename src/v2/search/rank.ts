import type { MineId, MineV2 } from '../contracts';

/*
 * Mine search ranking (PLAN_V2 Appendix G). Pure: no React, no browser. The scoring numbers below are the
 * Appendix G table, kept in one place so a change is one edit.
 */

/** The fields of a mine that search reads. A `MineV2` fits. */
export interface SearchableMine {
  id: MineId;
  name: string;
  company: string;
  state: string;
  type: string;
  /** Coalfield id, for example `s_karanpura`. */
  field: string;
  band: MineV2['band'];
  runoutYear: number | null;
  /** "2034", "After 2225" or "No date". */
  runoutLabel: string;
}

export type MatchedField = 'name' | 'company' | 'state' | 'field';

export interface RankedMine<M extends SearchableMine = SearchableMine> {
  mine: M;
  /** Best field score times that field's weight. */
  score: number;
  matchedField: MatchedField;
}

export interface RankResult<M extends SearchableMine = SearchableMine> {
  /** The top matches, best first, at most `limit`. */
  results: RankedMine<M>[];
  /** How many mines match in all (the "N" in "N of 311"). */
  total: number;
}

/** Appendix G "Fields": the weight of each searched field. */
export const FIELD_WEIGHT: Record<MatchedField, number> = { name: 1.0, company: 0.6, state: 0.5, field: 0.5 };

/** Appendix G "Score per field". */
export const MATCH_SCORE = { exact: 100, prefix: 80, wordPrefix: 60, substring: 40, typo: 25 } as const;

/** A one-letter typo only counts for queries of at least this many characters. */
export const TYPO_MIN_QUERY_CHARS = 5;

/** Appendix G "Show": the number of rows in the results list. */
export const RESULT_LIMIT = 8;

/** Appendix G "Normalise": words dropped from mine names unless the query itself contains them. */
const DROPPED_WORDS: ReadonlySet<string> = new Set([
  'colliery',
  'project',
  'mine',
  'mines',
  'ug',
  'oc',
  'ocp',
  'ocm',
  'incline',
  'pit',
  'expn',
  'expansion',
]);

/** Closing-soonest first. */
const BAND_ORDER: Record<SearchableMine['band'], number> = {
  by2031: 0,
  by2036: 1,
  by2050: 2,
  after2050: 3,
  nodate: 4,
};

const COMBINING_MARKS = /\p{M}/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const APOSTROPHES = new Set(["'", '`', '‘', '’', '´']);

/**
 * Lower-case, strip accents (NFKD) and punctuation, collapse spaces. Apostrophes vanish (`Hurra'C'` is `hurrac`);
 * any other punctuation separates words. `map[i]` is the index in `text` of the character that produced
 * `folded[i]`, so a match can be highlighted in the original text.
 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (APOSTROPHES.has(ch)) continue;
    const base = ch.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();
    for (const c of base) {
      if (LETTER_OR_DIGIT.test(c)) {
        if (pendingSpace && folded !== '') {
          folded += ' ';
          map.push(i);
        }
        pendingSpace = false;
        folded += c;
        map.push(i);
      } else {
        pendingSpace = true;
      }
    }
  }
  return { folded, map };
}

/** Lower-case, no accents, no punctuation, single spaces. */
export function fold(text: string): string {
  return foldWithMap(text).folded;
}

/**
 * `fold`, then drop the Appendix G words (colliery, ug, oc, expn and so on) unless `keep` holds them. `keep` is
 * the set of dropped words the query itself contains.
 */
export function normalise(text: string, keep: ReadonlySet<string> = new Set()): string {
  return fold(text)
    .split(' ')
    .filter((word) => word !== '' && (!DROPPED_WORDS.has(word) || keep.has(word)))
    .join(' ');
}

/** The dropped words that appear in a query (they stay in names for that query). */
function keptWords(foldedQuery: string): Set<string> {
  return new Set(foldedQuery.split(' ').filter((word) => DROPPED_WORDS.has(word)));
}

/** Damerau-Levenshtein distance (adjacent swaps count as one edit), optimal string alignment form. */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/** Score of one normalised field against the normalised query: 0 when it does not match. */
export function scoreField(query: string, field: string): number {
  if (query === '' || field === '') return 0;
  if (field === query) return MATCH_SCORE.exact;
  if (field.startsWith(query)) return MATCH_SCORE.prefix;
  if (field.includes(` ${query}`)) return MATCH_SCORE.wordPrefix;
  if (field.includes(query)) return MATCH_SCORE.substring;
  if (query.length >= TYPO_MIN_QUERY_CHARS) {
    if (damerauLevenshtein(query, field) <= 1) return MATCH_SCORE.typo;
    for (const word of field.split(' ')) {
      if (word.length >= TYPO_MIN_QUERY_CHARS - 1 && damerauLevenshtein(query, word) <= 1) return MATCH_SCORE.typo;
    }
  }
  return 0;
}

/**
 * Coalfield display name from its id: `s_karanpura` becomes "south karanpura", so search sees the words a person
 * would type. Only the direction prefixes and the `ib_valley` underscore need spelling out.
 */
export function coalfieldName(fieldId: string): string {
  const parts = fieldId.split('_').filter(Boolean);
  const direction: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west' };
  if (parts.length > 1 && direction[parts[0]]) parts[0] = direction[parts[0]];
  return parts.join(' ');
}

function bestField(
  mine: SearchableMine,
  query: string,
  keep: ReadonlySet<string>,
): { score: number; field: MatchedField } {
  const candidates: [MatchedField, string][] = [
    ['name', normalise(mine.name, keep)],
    ['company', normalise(mine.company, keep)],
    ['state', normalise(mine.state, keep)],
    ['field', normalise(coalfieldName(mine.field), keep)],
  ];
  let best = { score: 0, field: 'name' as MatchedField };
  for (const [field, value] of candidates) {
    const score = scoreField(query, value) * FIELD_WEIGHT[field];
    if (score > best.score) best = { score, field };
  }
  return best;
}

function compareRanked(a: RankedMine, b: RankedMine): number {
  return (
    b.score - a.score ||
    BAND_ORDER[a.mine.band] - BAND_ORDER[b.mine.band] ||
    a.mine.name.length - b.mine.name.length ||
    a.mine.name.localeCompare(b.mine.name) ||
    a.mine.id.localeCompare(b.mine.id)
  );
}

/**
 * Rank `mines` for a typed query. An empty query matches nothing. Ties go to the closing-soonest band, then the
 * shorter name, then alphabetical.
 */
export function rank<M extends SearchableMine>(
  rawQuery: string,
  mines: readonly M[],
  limit: number = RESULT_LIMIT,
): RankResult<M> {
  const foldedQuery = fold(rawQuery);
  if (foldedQuery === '') return { results: [], total: 0 };
  const keep = keptWords(foldedQuery);
  const matched: RankedMine<M>[] = [];
  for (const mine of mines) {
    const { score, field } = bestField(mine, foldedQuery, keep);
    if (score > 0) matched.push({ mine, score, matchedField: field });
  }
  matched.sort(compareRanked);
  return { results: matched.slice(0, limit), total: matched.length };
}

/**
 * Where the query sits in a mine's name, as `[start, end)` indexes into `name`, ignoring case, accents and
 * punctuation. `null` when the name does not contain the query (the match was on another field, or a typo).
 */
export function matchRange(name: string, rawQuery: string): [number, number] | null {
  const query = fold(rawQuery);
  if (query === '') return null;
  const { folded, map } = foldWithMap(name);
  const at = folded.indexOf(query);
  if (at < 0) return null;
  return [map[at], map[at + query.length - 1] + 1];
}

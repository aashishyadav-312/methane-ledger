// Copy for the mine page (docs/PLAN_V1.md Appendix F). Every number comes in as a value from `evaluate`
// or the data files; nothing here is typed by hand.
import type { Result, StreamResult, Tech } from '../../model/types';
import { EXPLOSIVE_RANGE_CONC } from '../../model/constants';
import { DASH, pct, usdM, usdPerT } from '../../lib/format';
import { HEADLINE_CAP_USD_PER_T } from './controls';

/** A price as people say it: `$15`, `$18.25`. Whole dollars drop the cents. */
export function usdPrice(x: number): string {
  const text = usdPerT(x);
  return Math.round(x * 100) % 100 === 0 ? text.replace(/\.00$/, '') : text;
}

export function headlineText(breakevenUsdPerT: number | null): string {
  if (breakevenUsdPerT === null) return DASH;
  if (breakevenUsdPerT > HEADLINE_CAP_USD_PER_T) return `>${usdPrice(HEADLINE_CAP_USD_PER_T)}`;
  return usdPerT(breakevenUsdPerT);
}

export type Verdict = { kind: 'ok' | 'short' | 'none'; text: string };

export function verdict(result: Result, priceUsdPerT: number): Verdict {
  const be = result.breakevenUsdPerT;
  if (!result.abatable || be === null) return { kind: 'none', text: 'Not abatable with v1 technologies' };
  if (priceUsdPerT >= be) return { kind: 'ok', text: `Covered at ${usdPrice(priceUsdPerT)}` };
  return { kind: 'short', text: `Short by ${usdPerT(be - priceUsdPerT)} a tonne` };
}

/** The result sentence under the headline. */
export function resultSentence(result: Result, priceUsdPerT: number, creditingYears: number): string {
  const head = `At ${usdPrice(priceUsdPerT)} a tonne, the project`;
  const noPayback = `does not pay back within ${creditingYears} years`;
  if (result.npvUsd >= 0) {
    const tail =
      result.paybackYear === null
        ? `but ${noPayback}`
        : `and pays back its ${usdM(result.capexUsd)} build cost by ${result.paybackYear}`;
    return `${head} earns ${usdM(result.npvUsd)} more than it costs in today's money, ${tail}.`;
  }
  const tail = result.paybackYear === null ? `, and ${noPayback}` : '';
  return `${head} falls ${usdM(-result.npvUsd)} short in today's money${tail}.`;
}

/** Why a mine is not abatable, from the stream statuses. */
export function notAbatableReason(streams: StreamResult[]): string {
  const dilute = streams.filter((s) => s.status === 'needs_enrichment').map((s) => s.label.toLowerCase());
  if (dilute.length > 0) {
    return `The ${joinWords(dilute)} ${dilute.length > 1 ? 'are' : 'is'} too dilute for engines, flares or thermal oxidisers, and there is no other gas to destroy.`;
  }
  return 'There is no gas to destroy in the crediting period.';
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const TECH_TEXT: Record<Tech, string> = {
  power: 'Engines make power',
  flare: 'Enclosed flare',
  rto: 'Thermal oxidiser',
};

/** "How it is destroyed" for the stream table. */
export function techText(stream: StreamResult): string {
  if (stream.status === 'needs_enrichment') return 'Too dilute to destroy';
  if (stream.status === 'no_gas' || stream.tech === null) return 'No gas in this period';
  const base = TECH_TEXT[stream.tech];
  return stream.kind === 'amm' ? `${base}, sealed shafts` : base;
}

/** The safety line for a stream inside the explosive range, or `null`. */
export function safetyText(stream: StreamResult): string | null {
  if (!stream.warnings.includes('unsafe_range')) return null;
  const range = `${pct(EXPLOSIVE_RANGE_CONC.lower, 0)} to ${pct(EXPLOSIVE_RANGE_CONC.upper, 0)}`;
  return `Safety: ${stream.label.toLowerCase()} at this strength is inside the explosive range of methane in air (${range}). It needs a safety case before any use.`;
}

/** Closure basis button labels (Appendix F). */
export function basisLabel(label: string, year: number | null): string {
  return year === null ? label : `${label} (${year})`;
}

const MINE_TYPES: Record<string, string> = { UG: 'Underground', OC: 'Opencast', mixed: 'Underground and opencast' };
const ROMAN = ['', 'I', 'II', 'III'];
const SUBSIDIARIES: Record<string, string> = {
  BCCL: 'Bharat Coking Coal',
  CCL: 'Central Coalfields',
  ECL: 'Eastern Coalfields',
  MCL: 'Mahanadi Coalfields',
  NCL: 'Northern Coalfields',
  SECL: 'South Eastern Coalfields',
  WCL: 'Western Coalfields',
  NEC: 'North Eastern Coalfields',
};

export interface MetaInput {
  subsidiary: string;
  coalfield: string;
  state: string;
  mineType: string;
  dgmsDegree: number | null;
}

/** "Bharat Coking Coal · Jharia coalfield, Jharkhand · Underground · Degree III, the gassiest grade". */
export function metaLine(m: MetaInput): string {
  const parts: string[] = [];
  parts.push(SUBSIDIARIES[m.subsidiary] ?? m.subsidiary);
  if (m.coalfield !== 'n/a')
    parts.push(m.state !== 'n/a' ? `${m.coalfield} coalfield, ${m.state}` : `${m.coalfield} coalfield`);
  parts.push(MINE_TYPES[m.mineType] ?? m.mineType);
  if (m.dgmsDegree !== null && ROMAN[m.dgmsDegree]) {
    const last = ROMAN.length - 1;
    parts.push(`Degree ${ROMAN[m.dgmsDegree]}${m.dgmsDegree === last ? ', the gassiest grade' : ''}`);
  }
  return parts.join(' · ');
}

export const BAND_CHIP: Record<string, { label: string; token: string }> = {
  by2031: { label: 'Closing by 2031', token: 'band-2031' },
  by2036: { label: 'Closing 2032 to 2036', token: 'band-2036' },
  by2050: { label: 'Closing 2037 to 2050', token: 'band-2050' },
  after2050: { label: 'Closing after 2050', token: 'band-after' },
  nodate: { label: 'No closure date', token: 'band-nodate' },
  closed: { label: 'Already closed', token: 'band-closed' },
};

export const FINANCE_STRUCTURES = [
  { key: 'A', title: 'Coal India funds it' },
  { key: 'B', title: 'A developer builds and runs it' },
  { key: 'C', title: 'A buyer pays in advance' },
  { key: 'D', title: 'A price floor' },
  { key: 'E', title: 'A grant or gap funding' },
] as const;

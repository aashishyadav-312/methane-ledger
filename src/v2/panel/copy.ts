// Words for the v2 inputs panel. DESIGN_V2 "Copy": sentence case, no all-caps labels, no middle dots, no arrows.
import type { GassinessDegree } from '../../model/types';
import type { MineV2 } from '../contracts';
import { coalfieldName } from '../search';

/** Coal India subsidiaries by their short name, as on the v1 mine page. */
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

const TYPE_WORDS: Record<MineV2['type'], string> = { UG: 'Underground', OC: 'Opencast', Mixed: 'Underground and opencast' };

export const ROMAN: Record<GassinessDegree, string> = { 1: 'I', 2: 'II', 3: 'III' };

const capitalise = (s: string) => (s === '' ? s : s[0].toUpperCase() + s.slice(1));

/** "Bharat Coking Coal, Jharia coalfield, Jharkhand". */
export function factsLine(mine: MineV2): string {
  const field = coalfieldName(mine.field);
  return [SUBSIDIARIES[mine.company] ?? mine.company, field ? `${capitalise(field)} coalfield` : '', mine.state]
    .filter(Boolean)
    .join(', ');
}

/** "BCCL, Jharkhand". The short form for the phone sheet. */
export function shortFacts(mine: MineV2): string {
  return [mine.company, mine.state].filter(Boolean).join(', ');
}

/** "Coal runs out 2034", "Coal runs out after 2225", "No closure date". */
export function runoutChip(mine: MineV2): string {
  if (mine.runoutYear !== null) return `Coal runs out ${mine.runoutYear}`;
  return mine.band === 'nodate' ? 'No closure date' : `Coal runs out ${mine.runoutLabel.toLowerCase()}`;
}

/** "Underground, gassiest grade", "Underground and opencast, grade II", "Opencast". */
export function typeChip(type: MineV2['type'], degree: GassinessDegree | null): string {
  const words = TYPE_WORDS[type];
  if (degree === null) return words;
  return `${words}, ${degree === 3 ? 'gassiest grade' : `grade ${ROMAN[degree]}`}`;
}

/** DESIGN_V2 "Copy": estimated inputs carry "Estimated inputs"; a measured record shows "Illustrative inputs". */
export function dataTag(source: 'record' | 'estimate'): string {
  return source === 'record' ? 'Illustrative inputs' : 'Estimated inputs';
}

/** The one input that would let the model run, for a mine it cannot model. */
export function fixHint(status: 'not_abatable' | 'no_output'): string {
  return status === 'no_output'
    ? 'Enter the coal output to model this mine.'
    : 'Set the gassiness grade to II or III if the mine has gassy underground workings.';
}

// Copy for the mine page (docs/PLAN_V1.md Appendix F). Every number comes in as a value from `evaluate`
// or the data files; nothing here is typed by hand.
import type { Result, StreamResult, Tech } from '../../model/types';
import { EXPLOSIVE_RANGE_CONC } from '../../model/constants';
import type { FinancingResult } from '../../model/financing';
import type { ExplainTerm } from '../../model/explain';
import type { TornadoKey, TornadoRow } from '../../model/tornado';
import { DASH, pct } from '../../lib/format';
import { HEADLINE_CAP_USD_PER_T } from './controls';
import type { StructureKey } from './pageState';
import type { StructureView } from './structures';
import { usdPrice, type Units } from './units';

export { usdPrice };

export function headlineText(breakevenUsdPerT: number | null, units: Pick<Units, 'perT' | 'price'>): string {
  if (breakevenUsdPerT === null) return DASH;
  if (breakevenUsdPerT > HEADLINE_CAP_USD_PER_T) return `>${units.price(HEADLINE_CAP_USD_PER_T)}`;
  return units.perT(breakevenUsdPerT);
}

export type Verdict = { kind: 'ok' | 'short' | 'none'; text: string };

/** The verdict pill for a break-even (the project's, or Coal India's under a structure). */
export function verdict(
  abatable: boolean,
  breakevenUsdPerT: number | null,
  priceUsdPerT: number,
  units: Pick<Units, 'perT' | 'price'>,
): Verdict {
  const be = breakevenUsdPerT;
  if (!abatable || be === null) return { kind: 'none', text: 'Not abatable with v1 technologies' };
  if (priceUsdPerT >= be) return { kind: 'ok', text: `Covered at ${units.price(priceUsdPerT)}` };
  return { kind: 'short', text: `Short by ${units.perT(be - priceUsdPerT)} a tonne` };
}

/** The result sentence under the headline, for the project as a whole (Appendix F). */
export function resultSentence(
  result: Result,
  priceUsdPerT: number,
  creditingYears: number,
  units: Pick<Units, 'amount' | 'price'>,
): string {
  const head = `At ${units.price(priceUsdPerT)} a tonne, the project`;
  const noPayback = `does not pay back within ${creditingYears} years`;
  if (result.npvUsd >= 0) {
    const tail =
      result.paybackYear === null
        ? `but ${noPayback}`
        : `and pays back its ${units.amount(result.capexUsd)} build cost by ${result.paybackYear}`;
    return `${head} earns ${units.amount(result.npvUsd)} more than it costs in today's money, ${tail}.`;
  }
  const tail = result.paybackYear === null ? `, and ${noPayback}` : '';
  return `${head} falls ${units.amount(-result.npvUsd)} short in today's money${tail}.`;
}

/**
 * The result sentence from Coal India's side, for structures where that differs from the project
 * (B, C and D). `paybackYear` is the calendar year Coal India gets its outlay back, or `null`.
 */
export function structureSentence(
  view: StructureView,
  paybackYear: number | null,
  priceUsdPerT: number,
  creditingYears: number,
  units: Pick<Units, 'amount' | 'price'>,
): string {
  const head = `At ${units.price(priceUsdPerT)} a tonne, Coal India`;
  if (view.upfrontUsd <= 0) {
    const gets = view.npvUsd >= 0 ? `receives ${units.amount(view.npvUsd)}` : `loses ${units.amount(-view.npvUsd)}`;
    return `${head} puts up no capital and ${gets} in today's money.`;
  }
  const noPayback = `does not get its outlay back within ${creditingYears} years`;
  if (view.npvUsd >= 0) {
    const tail =
      paybackYear === null
        ? `but ${noPayback}`
        : `and gets back its ${units.amount(view.upfrontUsd)} outlay by ${paybackYear}`;
    return `${head} earns ${units.amount(view.npvUsd)} more than it puts in, in today's money, ${tail}.`;
  }
  const tail = paybackYear === null ? `, and ${noPayback}` : '';
  return `${head} falls ${units.amount(-view.npvUsd)} short in today's money${tail}.`;
}

/** Structure B when the developer's return is below its hurdle (Step 8). */
export function developerDeclinesText(
  priceUsdPerT: number,
  developerBreakevenUsdPerT: number | null,
  units: Pick<Units, 'perT' | 'price'>,
): string {
  const head = `No developer would take this at ${units.price(priceUsdPerT)} a tonne.`;
  if (developerBreakevenUsdPerT === null) return head;
  return `${head} They would need about ${units.perT(developerBreakevenUsdPerT)}.`;
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

export interface FinanceStructureCopy {
  key: StructureKey;
  title: string;
  /** Appendix F. */
  description: string;
}

export const FINANCE_STRUCTURES: readonly FinanceStructureCopy[] = [
  {
    key: 'A',
    title: 'Coal India funds it',
    description:
      "Coal India pays the build cost from its own capital and keeps all credit and power revenue. Simplest to set up, but it competes with Coal India's other spending.",
  },
  {
    key: 'B',
    title: 'A developer builds and runs it',
    description:
      'A specialist developer pays for and operates the plant, sells the credits, and pays Coal India a royalty on gas revenue. Coal India puts up no capital and shares the upside.',
  },
  {
    key: 'C',
    title: 'A buyer pays in advance',
    description:
      'A credit buyer pays now for the first three years of credits at a discount, and that payment helps fund the build. The buyer takes on delivery risk, so the price is lower.',
  },
  {
    key: 'D',
    title: 'A price floor',
    description:
      "A public facility guarantees a minimum price for the first five years of credits, as the World Bank's Pilot Auction Facility did for methane. Lenders can then count on that revenue.",
  },
  {
    key: 'E',
    title: 'A grant or gap funding',
    description:
      'Public money covers part of the build cost. Move the grant control to see how much it lowers the break-even price.',
  },
];

export function structureTitle(key: StructureKey): string {
  return FINANCE_STRUCTURES.find((f) => f.key === key)?.title ?? key;
}

/** A small figure shown with a structure: a label, a value and a note. */
export interface StructureFact {
  label: string;
  value: string;
  note: string;
}

/** The figures that belong to one structure, beside the description. */
export function structureFacts(
  fin: FinancingResult,
  key: StructureKey,
  units: Pick<Units, 'amount' | 'perT' | 'price'>,
): StructureFact[] {
  const p = fin.params;
  switch (key) {
    case 'B':
      return [
        {
          label: "Developer's return (IRR)",
          value: pct(fin.B.developerIrr, 1),
          note: `it needs ${pct(p.developerHurdleRate, 0)}`,
        },
        {
          label: "Coal India's royalty",
          value: pct(p.royaltyShare, 0),
          note: `of gas revenue, ${units.amount(fin.B.cilNpvUsd)} in today's money`,
        },
        {
          label: 'Most royalty the developer could pay',
          value: pct(fin.B.maxRoyaltyShare, 0),
          note: `and still earn ${pct(p.developerHurdleRate, 0)}`,
        },
      ];
    case 'C':
      return [
        {
          label: "Buyer's prepayment",
          value: units.amount(fin.C.prepaymentUsd),
          note: `${pct(fin.C.prepaymentShareOfCapex, 0)} of the build cost, at a ${pct(p.forwardDiscount, 0)} discount`,
        },
        {
          label: 'Credits sold in advance',
          value: `${p.forwardYears} years`,
          note: 'no credit revenue in those years',
        },
      ];
    case 'D':
      return [
        {
          label: 'Price floor',
          value: units.price(p.floorUsdPerT),
          note: `a tonne, for the first ${p.floorYears} years`,
        },
        {
          label: 'Premium paid for the floor',
          value: units.amount(fin.D.premiumPaidUsd),
          note: `${units.perT(p.floorPremiumUsdPerT)} a credit, paid at the start`,
        },
      ];
    case 'E':
      return [
        {
          label: 'Grant',
          value: units.amount(fin.E.grantUsd),
          note: `${pct(p.grantShare, 0)} of the build cost`,
        },
      ];
    default:
      return [];
  }
}

/** Structure D when the floor alone pays for the project. */
export const FLOOR_COVERS_TEXT = 'The floor alone covers the project, even at a market price of zero.';

/** "$40 to $120 per MWh", from a tornado row's own low and high inputs. */
export function tornadoRangeText(row: TornadoRow, units: Pick<Units, 'price'>): string {
  const lo = row.lowInput;
  const hi = row.highInput;
  const pair = (f: (x: number) => string) => `${f(lo)} to ${f(hi)}`;
  const byKey: Record<TornadoKey, () => string> = {
    power_price: () => `${pair(units.price)} per MWh`,
    engine_capex: () => `${pair(units.price)} per kW`,
    rto_capex: () => `${pair(units.price)} per m³/s`,
    drained: () => `${pair(String)} Mm³ a year`,
    closure: () => pair(String),
    discount: () => pair((x) => pct(x, 0)),
    gwp: () => pair(String),
    f_amm: () => `${pair((x) => pct(x, 0))} of last-year gas`,
    vam_conc: () => pair((x) => pct(x, 1)),
    contingency: () => pair((x) => pct(x, 0)),
  };
  return byKey[row.key]();
}

/** The symbol each break-even term has in the formula (plain HTML, Step 8). `sub` is written as a subscript. */
export const EXPLAIN_SYMBOLS: Record<ExplainTerm['key'], { main: string; sub?: string; wrap?: string }> = {
  capex: { main: 'K' },
  opex: { main: 'PV', sub: 'r', wrap: 'running cost' },
  mrv: { main: 'PV', sub: 'r', wrap: 'monitoring' },
  fees: { main: 'PV', sub: 'r', wrap: 'fees' },
  energy: { main: 'PV', sub: 'r', wrap: 'power' },
  sellerShare: { main: '(1 − b)' },
  discountedReductions: { main: 'PV', sub: 'r', wrap: 'credits' },
};

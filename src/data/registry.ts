// The variable registry (PLAN_V1 Step 13b, Appendix G): one entry for every value a person can adjust.
// The mine page's "All assumptions" sheet renders from it, and the Assumptions page will too. It is the only list.
// Labels, short units, ranges and steps are written here; values, sources and quality come from the data files.

import type { Quality } from '../model/types';
import { FIN_DEFAULTS, type FinancingParams } from '../model/financing';
import { getCostsRecord, getPrices, getSettingsRecord, getTechRecord } from './load';
import type { CostsRecord, MineRecord, SettingsRecord, TechRecord } from './schemas';
import { isWrappedField } from './unwrap';

export const REGISTRY_GROUPS = ['Market', 'Mine and gas', 'Technology', 'Costs', 'Finance', 'Accounting'] as const;
export type RegistryGroup = (typeof REGISTRY_GROUPS)[number];

/** How a value is written. `pct` values are stored as fractions and entered as percentages. */
export type RegistryFormat = 'usd' | 'usdPerT' | 'inr' | 'pct' | 'factor' | 'int' | 'year';

/** Mine page controls with their own short URL key. The sheet edits these through the control, not `x=`. */
export type ViewKey =
  | 'priceUsdPerT'
  | 'drainedMm3PerYr'
  | 'closureYear'
  | 'vamConc'
  | 'grantShare'
  | 'discountRate'
  | 'gwp'
  | 'creditingYears';

export interface RegistryEntry {
  /** Starts with `settings.`, `tech.`, `costs.`, `mine.`, `finance.` or `prices.`. Mine paths are relative to the mine. */
  path: string;
  label: string;
  group: RegistryGroup;
  /** A heading inside the group, for example "Gas engines (power)". */
  section?: string;
  /** Short unit written next to the input, for example `$ per kW` or `%`. */
  unit: string;
  kind: 'number' | 'boolean';
  /** In stored units: fractions for `pct`. Booleans use 0 to 1. */
  min: number;
  max: number;
  step: number;
  format: RegistryFormat;
  source: string;
  quality: Quality;
  /** Set when a mine page control owns the value; the sheet then changes that control. */
  view?: ViewKey;
}

type Spec = Omit<RegistryEntry, 'path' | 'group' | 'source' | 'quality' | 'kind'> & { kind?: 'number' | 'boolean' };
type Ranged = Pick<RegistryEntry, 'min' | 'max' | 'step'>;

const PCT: Ranged = { min: 0, max: 1, step: 0.01 };
const BOOL: Ranged = { min: 0, max: 1, step: 1 };

/** Finance parameters have no data file yet: they are the illustration's knobs from reference/ref_v1.py `FIN`. */
const FINANCE_SOURCE = 'DUMMY. Illustration parameters from reference/ref_v1.py FIN (PLAN_V1 Appendix B8)';

/* ---------- settings ---------- */

const SETTINGS: Record<keyof SettingsRecord, Spec & { group: RegistryGroup }> = {
  creditPriceUsdPerT: {
    group: 'Market',
    label: 'Credit price',
    unit: '$ per tCO2e',
    min: 0,
    max: 200,
    step: 0.01,
    format: 'usdPerT',
    view: 'priceUsdPerT',
  },
  priceEscalation: {
    group: 'Market',
    label: 'Credit price change each year',
    unit: '% a year',
    min: -0.1,
    max: 0.2,
    step: 0.005,
    format: 'pct',
  },
  powerPriceUsdPerMwh: {
    group: 'Market',
    label: 'Power price',
    unit: '$ per MWh',
    min: 0,
    max: 300,
    step: 1,
    format: 'usd',
  },
  brokerShare: { group: 'Market', label: 'Broker share of credit revenue', unit: '%', ...PCT, max: 0.5, format: 'pct' },
  issuanceFeeUsdPerT: {
    group: 'Market',
    label: 'Issuance fee',
    unit: '$ per tCO2e',
    min: 0,
    max: 5,
    step: 0.01,
    format: 'usdPerT',
  },
  usdToInr: {
    group: 'Market',
    label: 'Rupees per US dollar',
    unit: '₹ per $',
    min: 50,
    max: 150,
    step: 0.5,
    format: 'factor',
  },
  contingency: { group: 'Costs', label: 'Contingency on build cost', unit: '%', ...PCT, max: 0.5, format: 'pct' },
  validationCostUsd: {
    group: 'Costs',
    label: 'Validation, in year one',
    unit: '$',
    min: 0,
    max: 1_000_000,
    step: 1000,
    format: 'usd',
  },
  verificationCostUsdPerYr: {
    group: 'Costs',
    label: 'Verification, each year',
    unit: '$ a year',
    min: 0,
    max: 500_000,
    step: 1000,
    format: 'usd',
  },
  grantShare: {
    group: 'Finance',
    label: 'Grant toward the build cost',
    unit: '%',
    ...PCT,
    format: 'pct',
    view: 'grantShare',
  },
  startYear: {
    group: 'Accounting',
    label: 'First crediting year',
    unit: 'year',
    min: 2026,
    max: 2035,
    step: 1,
    format: 'year',
  },
  discountRate: {
    group: 'Accounting',
    label: 'Discount rate',
    unit: '% real',
    ...PCT,
    max: 0.3,
    format: 'pct',
    view: 'discountRate',
  },
  gwp: {
    group: 'Accounting',
    label: 'Warming factor for methane (GWP)',
    unit: '× CO2',
    min: 1,
    max: 100,
    step: 0.1,
    format: 'factor',
    view: 'gwp',
  },
  creditingYears: {
    group: 'Accounting',
    label: 'Crediting period',
    unit: 'years',
    min: 10,
    max: 15,
    step: 5,
    format: 'int',
    view: 'creditingYears',
  },
};

/* ---------- technology ---------- */

const TECH_SECTIONS: Record<keyof TechRecord, string> = {
  power: 'Gas engines (power)',
  flare: 'Enclosed flare',
  rto: 'Ventilation-air oxidiser (RTO)',
  drainage: 'Drainage system',
  monitoring: 'Monitoring kit',
};

const MIN_CONC: Spec = { label: 'Lowest methane share it takes', unit: '%', ...PCT, step: 0.005, format: 'pct' };
const DESTRUCTION: Spec = { label: 'Methane destroyed', unit: '%', ...PCT, step: 0.001, format: 'pct' };
const OPEX_FRAC: Spec = {
  label: 'Running cost, share of build cost',
  unit: '% a year',
  ...PCT,
  max: 0.3,
  step: 0.005,
  format: 'pct',
};

const TECH: { [G in keyof TechRecord]: Record<keyof TechRecord[G], Spec> } = {
  power: {
    minConc: MIN_CONC,
    destructionEff: DESTRUCTION,
    electricalEff: { label: 'Electrical efficiency', unit: '%', ...PCT, max: 0.6, step: 0.005, format: 'pct' },
    capexUsdPerKw: { label: 'Build cost per kW', unit: '$ per kW', min: 100, max: 5000, step: 10, format: 'usd' },
    opexUsdPerMwh: {
      label: 'Running cost per MWh (v1)',
      unit: '$ per MWh',
      min: 0,
      max: 100,
      step: 0.5,
      format: 'usd',
    },
    availability: { label: 'Availability', unit: '%', ...PCT, format: 'pct' },
  },
  flare: {
    minConc: MIN_CONC,
    destructionEff: DESTRUCTION,
    capexUsdPerMm3Yr: {
      label: 'Build cost per Mm³ a year',
      unit: '$ per Mm³ a year',
      min: 0,
      max: 500_000,
      step: 1000,
      format: 'usd',
    },
    opexFracOfCapex: { ...OPEX_FRAC, label: 'Running cost, share of build cost (v1)' },
  },
  rto: {
    minConc: { ...MIN_CONC, max: 0.05, step: 0.0005 },
    destructionEff: DESTRUCTION,
    capexUsdPerM3s: {
      label: 'Build cost per m³ a second of air',
      unit: '$ per m³/s',
      min: 0,
      max: 500_000,
      step: 1000,
      format: 'usd',
    },
    opexFracOfCapex: { ...OPEX_FRAC, label: 'Running cost, share of build cost (v1)' },
    fanKwhPerM3sYr: {
      label: 'Fan power per m³ a second',
      unit: 'kWh per m³/s a year',
      min: 0,
      max: 500_000,
      step: 1000,
      format: 'int',
    },
  },
  drainage: {
    capexUsdPerMm3Yr: {
      label: 'Build cost per Mm³ a year',
      unit: '$ per Mm³ a year',
      min: 0,
      max: 2_000_000,
      step: 5000,
      format: 'usd',
    },
    opexFracOfCapex: { ...OPEX_FRAC, label: 'Running cost, share of build cost (v1)' },
  },
  monitoring: {
    capexUsd: { label: 'Build cost per project', unit: '$', min: 0, max: 2_000_000, step: 10_000, format: 'usd' },
  },
};

/* ---------- cost build-up ---------- */

type SplitKey = keyof CostsRecord['split'];
const SPLIT_KEYS: readonly SplitKey[] = ['power', 'flare', 'rto', 'drainage'];
const SPLIT_ITEM_LABELS: Record<SplitKey, string> = {
  power: 'Engines',
  flare: 'Flare',
  rto: 'Oxidiser',
  drainage: 'Drainage',
};
const SPLIT_PARTS = ['equipment', 'materials', 'installation labour', 'civil works'] as const;
const HEADCOUNT_LABELS: Record<keyof CostsRecord['headcount'], string> = {
  power: 'Staff for the engines',
  flare: 'Staff for the flare',
  rto: 'Staff for the oxidiser',
  drainage: 'Staff for drainage',
  monitoring: 'Staff for monitoring',
};

function costSpecs(): [string, Spec][] {
  const out: [string, Spec][] = [
    [
      'localFactor',
      {
        label: 'Local factor for Indian labour and civil works',
        unit: '×',
        min: 0.2,
        max: 1.5,
        step: 0.05,
        format: 'factor',
        section: 'India factors',
      },
    ],
    [
      'importMarkup',
      { label: 'Import markup: duty, freight, insurance', unit: '%', ...PCT, format: 'pct', section: 'India factors' },
    ],
    [
      'ownersCost',
      {
        label: "Owner's costs: engineering, permits, project management",
        unit: '%',
        ...PCT,
        max: 0.5,
        format: 'pct',
        section: 'India factors',
      },
    ],
    [
      'gridConnectionUsd',
      { label: 'Grid connection', unit: '$', min: 0, max: 5_000_000, step: 10_000, format: 'usd', section: 'Site' },
    ],
    [
      'decommissioning',
      {
        label: 'Decommissioning, share of build cost',
        unit: '%',
        ...PCT,
        max: 0.3,
        step: 0.005,
        format: 'pct',
        section: 'Site',
      },
    ],
    [
      'insurance',
      {
        label: 'Insurance, share of build cost a year',
        unit: '% a year',
        ...PCT,
        max: 0.05,
        step: 0.001,
        format: 'pct',
        section: 'Site',
      },
    ],
    [
      'staffCostInr',
      {
        label: 'Staff cost per person-year',
        unit: '₹ a person-year',
        min: 0,
        max: 10_000_000,
        step: 10_000,
        format: 'inr',
        section: 'Staff',
      },
    ],
  ];
  for (const k of Object.keys(HEADCOUNT_LABELS) as (keyof CostsRecord['headcount'])[]) {
    out.push([
      `headcount.${k}`,
      { label: HEADCOUNT_LABELS[k], unit: 'people', min: 0, max: 100, step: 1, format: 'int', section: 'Staff' },
    ]);
  }
  for (const k of SPLIT_KEYS) {
    SPLIT_PARTS.forEach((part, i) => {
      out.push([
        `split.${k}.${i}`,
        {
          label: `${SPLIT_ITEM_LABELS[k]}: share for ${part}`,
          unit: '%',
          ...PCT,
          format: 'pct',
          section: 'How each build cost splits',
        },
      ]);
    });
  }
  for (const k of SPLIT_KEYS) {
    out.push([
      `imported.${k}`,
      {
        label: `${SPLIT_ITEM_LABELS[k]}: imported share of equipment`,
        unit: '%',
        ...PCT,
        format: 'pct',
        section: 'Imported equipment',
      },
    ]);
  }
  out.push(
    [
      'nonlabourOm.powerPerMwh',
      {
        label: 'Engines: running cost without staff',
        unit: '$ per MWh',
        min: 0,
        max: 50,
        step: 0.5,
        format: 'usd',
        section: 'Running costs',
      },
    ],
    [
      'nonlabourOm.flareFrac',
      {
        label: 'Flare: running cost without staff',
        unit: '% of build cost a year',
        ...PCT,
        max: 0.2,
        step: 0.005,
        format: 'pct',
        section: 'Running costs',
      },
    ],
    [
      'nonlabourOm.rtoFrac',
      {
        label: 'Oxidiser: running cost without staff',
        unit: '% of build cost a year',
        ...PCT,
        max: 0.2,
        step: 0.005,
        format: 'pct',
        section: 'Running costs',
      },
    ],
    [
      'nonlabourOm.drainageFrac',
      {
        label: 'Drainage: running cost without staff',
        unit: '% of build cost a year',
        ...PCT,
        max: 0.2,
        step: 0.005,
        format: 'pct',
        section: 'Running costs',
      },
    ],
    [
      'overhaulUsdPerKw',
      {
        label: 'Engine overhaul cost',
        unit: '$ per kW',
        min: 0,
        max: 1000,
        step: 10,
        format: 'usd',
        section: 'Running costs',
      },
    ],
    [
      'overhaulHours',
      {
        label: 'Running hours between overhauls',
        unit: 'hours',
        min: 1000,
        max: 200_000,
        step: 1000,
        format: 'int',
        section: 'Running costs',
      },
    ],
  );
  return out;
}

/* ---------- finance ---------- */

const FINANCE: Partial<Record<keyof FinancingParams, Spec>> = {
  royaltyShare: {
    label: 'Royalty to Coal India, share of revenue',
    unit: '%',
    ...PCT,
    max: 0.5,
    format: 'pct',
    section: 'A developer builds and runs it',
  },
  developerHurdleRate: {
    label: "Developer's required return",
    unit: '%',
    ...PCT,
    max: 0.4,
    step: 0.005,
    format: 'pct',
    section: 'A developer builds and runs it',
  },
  forwardYears: {
    label: 'Years of credits sold in advance',
    unit: 'years',
    min: 1,
    max: 10,
    step: 1,
    format: 'int',
    section: 'A buyer pays in advance',
  },
  forwardDiscount: {
    label: 'Discount for paying in advance',
    unit: '%',
    ...PCT,
    max: 0.8,
    format: 'pct',
    section: 'A buyer pays in advance',
  },
  floorUsdPerT: {
    label: 'Guaranteed lowest price',
    unit: '$ per tCO2e',
    min: 0,
    max: 50,
    step: 0.5,
    format: 'usdPerT',
    section: 'A price floor',
  },
  floorPremiumUsdPerT: {
    label: 'Cost of the floor, per credit covered',
    unit: '$ per tCO2e',
    min: 0,
    max: 5,
    step: 0.05,
    format: 'usdPerT',
    section: 'A price floor',
  },
  floorYears: {
    label: 'Years the floor covers',
    unit: 'years',
    min: 1,
    max: 10,
    step: 1,
    format: 'int',
    section: 'A price floor',
  },
  // grantShare: structure E takes the grant control's share (Settings, "Grant toward the build cost").
};

/* ---------- mine record ---------- */

const MINE: Record<string, Spec> = {
  closureYear: {
    label: 'Last year of mining',
    unit: 'year',
    min: 2026,
    max: 2060,
    step: 1,
    format: 'year',
    view: 'closureYear',
  },
  productionMtPerYr: { label: 'Coal output', unit: 'Mt a year', min: 0, max: 50, step: 0.05, format: 'factor' },
  specificEmissionM3PerT: {
    label: 'Methane per tonne of coal',
    unit: 'm³ per t',
    min: 0,
    max: 50,
    step: 0.25,
    format: 'factor',
  },
  drainedMm3PerYr: {
    label: 'Drained gas',
    unit: 'Mm³ a year',
    min: 5,
    max: 80,
    step: 1,
    format: 'factor',
    view: 'drainedMm3PerYr',
  },
  drainedShare: { label: 'Share of methane drained', unit: '%', ...PCT, format: 'pct' },
  drainedConc: { label: 'Methane in drained gas', unit: '%', ...PCT, format: 'pct' },
  vamMm3PerYr: {
    label: 'Methane in ventilation air, volume',
    unit: 'Mm³ a year',
    min: 0,
    max: 100,
    step: 0.05,
    format: 'factor',
  },
  vamConc: {
    label: 'Methane in ventilation air',
    unit: '%',
    ...PCT,
    max: 0.02,
    step: 0.0005,
    format: 'pct',
    view: 'vamConc',
  },
  vamAirflowM3s: { label: 'Ventilation airflow', unit: 'm³ a second', min: 1, max: 2000, step: 1, format: 'int' },
  hasDrainageSystem: {
    kind: 'boolean',
    label: 'Drainage system already in place',
    unit: 'yes or no',
    ...BOOL,
    format: 'int',
  },
  powerOfftake: { kind: 'boolean', label: 'Power can be sold', unit: 'yes or no', ...BOOL, format: 'int' },
  'captureEff.drained': {
    label: 'Drained gas collected',
    unit: '%',
    ...PCT,
    format: 'pct',
    section: 'How much is collected',
  },
  'captureEff.vam': {
    label: 'Ventilation-air methane collected',
    unit: '%',
    ...PCT,
    format: 'pct',
    section: 'How much is collected',
  },
  'captureEff.amm': {
    label: 'Gas after closure collected',
    unit: '%',
    ...PCT,
    format: 'pct',
    section: 'How much is collected',
  },
  'amm.fAmm': {
    label: 'Gas after closure, share of the last year',
    unit: '%',
    ...PCT,
    format: 'pct',
    section: 'Gas after closure',
  },
  'amm.declineD': {
    label: 'Yearly decline rate',
    unit: 'per year',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: 'factor',
    section: 'Gas after closure',
  },
  'amm.hyperbolicB': {
    label: 'Decline curve shape (b)',
    unit: '',
    min: 0.01,
    max: 2,
    step: 0.05,
    format: 'factor',
    section: 'Gas after closure',
  },
  'amm.conc': { label: 'Methane in gas after closure', unit: '%', ...PCT, format: 'pct', section: 'Gas after closure' },
  'amm.floodingYear': {
    label: 'Year the mine floods',
    unit: 'year',
    min: 2026,
    max: 2080,
    step: 1,
    format: 'year',
    section: 'Gas after closure',
  },
  'amm.floodingFactor': {
    label: 'Gas left once flooded',
    unit: '%',
    ...PCT,
    format: 'pct',
    section: 'Gas after closure',
  },
  'amm.q0Mm3': {
    label: 'Gas in the first year after closure',
    unit: 'Mm³',
    min: 0,
    max: 100,
    step: 0.1,
    format: 'factor',
    section: 'Gas after closure',
  },
  'amm.yearsSinceClosure': {
    label: 'Years since closure',
    unit: 'years',
    min: 0,
    max: 50,
    step: 1,
    format: 'int',
    section: 'Gas after closure',
  },
  'destructionMandated.drained': {
    kind: 'boolean',
    label: 'Law already requires destroying drained gas',
    unit: 'yes or no',
    ...BOOL,
    format: 'int',
    section: 'What the law already requires',
  },
  'destructionMandated.vam': {
    kind: 'boolean',
    label: 'Law already requires destroying ventilation-air methane',
    unit: 'yes or no',
    ...BOOL,
    format: 'int',
    section: 'What the law already requires',
  },
  'destructionMandated.amm': {
    kind: 'boolean',
    label: 'Law already requires destroying gas after closure',
    unit: 'yes or no',
    ...BOOL,
    format: 'int',
    section: 'What the law already requires',
  },
};

/* ---------- lookups ---------- */

interface Provenance {
  source: string;
  quality: Quality;
}

/** Has a source and a quality: a wrapped field, or a closure year that reads `{ from: 'timeline' }`. */
function hasProvenance(x: unknown): x is Provenance {
  if (isWrappedField(x)) return true;
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return 'from' in o && typeof o.source === 'string' && typeof o.quality === 'string';
}

/** The wrapped field at `path` in a record, or the nearest wrapped parent (a list such as `split.power`). */
function provenance(record: unknown, path: string): Provenance | null {
  let node: unknown = record;
  for (const key of path.split('.')) {
    if (hasProvenance(node)) break;
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return hasProvenance(node) ? { source: node.source, quality: node.quality } : null;
}

/** The value at a dotted path in a plain object, or `undefined`. */
export function valueAt(target: unknown, path: string): unknown {
  let node: unknown = target;
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function entry(prefix: string, key: string, spec: Spec, group: RegistryGroup, p: Provenance): RegistryEntry {
  const { kind = 'number', ...rest } = spec;
  return { path: `${prefix}.${key}`, group, kind, ...rest, ...p };
}

/** Every adjustable value for one mine, in display order within each group. */
export function buildRegistry(mine: MineRecord): RegistryEntry[] {
  const settingsRec = getSettingsRecord();
  const techRec = getTechRecord();
  const costsRec = getCostsRecord();
  const out: RegistryEntry[] = [];

  for (const [key, spec] of Object.entries(SETTINGS)) {
    const { group, ...rest } = spec;
    const p = provenance(settingsRec, key);
    if (p) out.push(entry('settings', key, rest, group, p));
  }

  for (const s of getPrices()) {
    if (s.priceUsdPerT === null) continue;
    out.push({
      path: `prices.${s.id}`,
      label: s.label,
      group: 'Market',
      section: 'Price scenarios',
      kind: 'number',
      unit: '$ per tCO2e',
      min: 0,
      max: 200,
      step: 0.01,
      format: 'usdPerT',
      source: s.priceUsdPerT.source,
      quality: s.priceUsdPerT.quality,
    });
  }

  for (const [key, spec] of Object.entries(MINE)) {
    const p = provenance(mine, key);
    if (p === null) continue;
    // A yearly series (a list of values) is edited on the Data page, not here.
    if (Array.isArray((valueAt(mine, key) as { value?: unknown } | undefined)?.value)) continue;
    out.push(entry('mine', key, spec, 'Mine and gas', p));
  }

  for (const group of Object.keys(TECH) as (keyof TechRecord)[]) {
    const specs = TECH[group] as Record<string, Spec>;
    for (const [key, spec] of Object.entries(specs)) {
      const p = provenance(techRec, `${group}.${key}`);
      if (p) out.push(entry('tech', `${group}.${key}`, { ...spec, section: TECH_SECTIONS[group] }, 'Technology', p));
    }
  }

  for (const [key, spec] of costSpecs()) {
    const p = provenance(costsRec, key);
    if (p) out.push(entry('costs', key, spec, 'Costs', p));
  }

  for (const [key, spec] of Object.entries(FINANCE) as [keyof FinancingParams, Spec][]) {
    if (FIN_DEFAULTS[key] === undefined) continue;
    out.push(entry('finance', key, spec, 'Finance', { source: FINANCE_SOURCE, quality: 'dummy' }));
  }

  // Group order, keeping each group's own order.
  return REGISTRY_GROUPS.flatMap((g) => out.filter((e) => e.group === g));
}

/** True when `value` fits the entry: the right type, inside its range. */
export function acceptsValue(entry: RegistryEntry, value: unknown): value is number | boolean {
  if (entry.kind === 'boolean') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value) && value >= entry.min && value <= entry.max;
}

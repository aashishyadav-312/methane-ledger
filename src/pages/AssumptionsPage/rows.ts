// Rows for the Assumptions tables. Values, units, sources and quality all come from the data files.
// Only the names and the grouping are written here.

import { z } from 'zod';
import { getConstantsRecord, getCosts, getSettingsRecord, getTechRecord, listMines } from '../../data/load';
import { buildRegistry, valueAt } from '../../data/registry';
import {
  ConstantsRecordSchema,
  SettingsRecordSchema,
  TechRecordSchema,
  type ConstantsRecord,
  type SettingsRecord,
  type TechRecord,
} from '../../data/schemas';
import type { Quality } from '../../model';

export type OverrideGroup = 'settings' | 'tech' | 'constants';

export interface AssumptionRow {
  /** The session override path, for example `tech.power.capexUsdPerKw`. */
  path: string;
  label: string;
  value: number | number[];
  unit: string;
  source: string;
  quality: Quality;
  /** `false` for values the mine page controls own, and for lists. */
  editable: boolean;
}

export interface AssumptionTable {
  id: string;
  title: string;
  rows: AssumptionRow[];
}

const SETTING_LABELS: Record<keyof SettingsRecord, string> = {
  startYear: 'First crediting year',
  creditingYears: 'Crediting period',
  creditPriceUsdPerT: 'Credit price',
  priceEscalation: 'Credit price escalation',
  discountRate: 'Discount rate',
  gwp: 'Global warming potential (GWP)',
  brokerShare: 'Broker share of credit revenue',
  issuanceFeeUsdPerT: 'Issuance fee',
  powerPriceUsdPerMwh: 'Power price',
  validationCostUsd: 'Validation cost',
  verificationCostUsdPerYr: 'Verification cost',
  contingency: 'Contingency on build cost',
  grantShare: 'Grant toward build cost',
  usdToInr: 'Rupees per US dollar',
};

/** The first crediting year is a model convention, and the crediting period has its own control on the mine page. */
const SETTINGS_NOT_EDITED_HERE: ReadonlySet<keyof SettingsRecord> = new Set(['startYear', 'creditingYears']);

const CONSTANT_LABELS: Record<keyof ConstantsRecord, string> = {
  rhoTPerThousandM3: 'Methane density',
  lhvGjPerT: 'Energy content of methane',
  co2PerCh4: 'Carbon dioxide from burning methane',
  gwpOptions: 'GWP options',
};

const TECH_TITLES: Record<keyof TechRecord, string> = {
  power: 'Gas engines (power)',
  flare: 'Enclosed flare',
  rto: 'Regenerative thermal oxidiser (RTO)',
  drainage: 'Drainage system',
  monitoring: 'Monitoring kit',
};

const TECH_LABELS: { [G in keyof TechRecord]: Record<keyof TechRecord[G], string> } = {
  power: {
    minConc: 'Minimum methane share',
    destructionEff: 'Destruction efficiency',
    electricalEff: 'Electrical efficiency',
    capexUsdPerKw: 'Build cost per kW',
    opexUsdPerMwh: 'Running cost per MWh',
    availability: 'Availability',
  },
  flare: {
    minConc: 'Minimum methane share',
    destructionEff: 'Destruction efficiency',
    capexUsdPerMm3Yr: 'Build cost per Mm³ a year',
    opexFracOfCapex: 'Running cost, share of build cost',
  },
  rto: {
    minConc: 'Minimum methane share',
    destructionEff: 'Destruction efficiency',
    capexUsdPerM3s: 'Build cost per m³ a second of air',
    opexFracOfCapex: 'Running cost, share of build cost',
    fanKwhPerM3sYr: 'Fan power per m³ a second',
  },
  drainage: {
    capexUsdPerMm3Yr: 'Build cost per Mm³ a year',
    opexFracOfCapex: 'Running cost, share of build cost',
  },
  monitoring: {
    capexUsd: 'Build cost per project',
  },
};

interface Wrapped {
  value: number | number[];
  unit: string;
  source: string;
  quality: Quality;
}

function row(path: string, label: string, f: Wrapped, editable: boolean): AssumptionRow {
  return {
    path,
    label,
    value: f.value,
    unit: f.unit,
    source: f.source,
    quality: f.quality,
    editable: editable && typeof f.value === 'number',
  };
}

export function settingsTable(): AssumptionTable {
  const rec = getSettingsRecord();
  const keys = Object.keys(SETTING_LABELS) as (keyof SettingsRecord)[];
  return {
    id: 'settings',
    title: 'Settings',
    rows: keys.map((k) => row(`settings.${k}`, SETTING_LABELS[k], rec[k], !SETTINGS_NOT_EDITED_HERE.has(k))),
  };
}

export function techTables(): AssumptionTable[] {
  const rec = getTechRecord();
  return (Object.keys(TECH_TITLES) as (keyof TechRecord)[]).map((group) => {
    const labels = TECH_LABELS[group] as Record<string, string>;
    const fields = rec[group] as Record<string, Wrapped>;
    return {
      id: `tech-${group}`,
      title: TECH_TITLES[group],
      rows: Object.keys(labels).map((k) => row(`tech.${group}.${k}`, labels[k], fields[k], true)),
    };
  });
}

/**
 * The cost build-up parameters, one table per registry section. Labels, units, sources and quality come from
 * `src/data/registry.ts`; values come from `getCosts()`. Shares show as percentages. They are read-only here.
 */
export function costsTables(): AssumptionTable[] {
  const costs = getCosts();
  const entries = buildRegistry(listMines()[0]).filter((e) => e.path.startsWith('costs.'));
  const tables = new Map<string, AssumptionRow[]>();
  for (const e of entries) {
    const raw = valueAt(costs, e.path.slice('costs.'.length));
    if (typeof raw !== 'number') continue;
    const section = e.section ?? 'Costs';
    const rows = tables.get(section) ?? [];
    rows.push({
      path: e.path,
      label: e.label,
      value: e.format === 'pct' ? Number((raw * 100).toPrecision(12)) : raw,
      unit: e.unit,
      source: e.source,
      quality: e.quality,
      editable: false,
    });
    tables.set(section, rows);
  }
  return [...tables].map(([title, rows]) => ({ id: `costs-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`, title, rows }));
}

export function constantsTable(): AssumptionTable {
  const rec = getConstantsRecord();
  const keys = Object.keys(CONSTANT_LABELS) as (keyof ConstantsRecord)[];
  return {
    id: 'constants',
    title: 'Constants',
    rows: keys.map((k) => row(`constants.${k}`, CONSTANT_LABELS[k], rec[k], true)),
  };
}

function hasShape(x: unknown): x is { shape: Record<string, unknown> } {
  return typeof x === 'object' && x !== null && 'shape' in x;
}

/** The Zod schema for the value at an override path, taken from the data schemas so the limits are the same. */
function valueSchema(path: string): z.ZodType | null {
  const [group, ...keys] = path.split('.');
  let node: unknown =
    group === 'settings' ? SettingsRecordSchema : group === 'tech' ? TechRecordSchema : group === 'constants' ? ConstantsRecordSchema : null;
  for (const key of keys) {
    if (!hasShape(node)) return null;
    node = node.shape[key];
  }
  if (!hasShape(node)) return null;
  const value = node.shape.value;
  return value instanceof z.ZodType ? value : null;
}

/** `null` when `value` is allowed at `path`; otherwise a short reason the data schema gives. */
export function overrideProblem(path: string, value: number): string | null {
  const schema = valueSchema(path);
  if (schema === null) return 'This value cannot be changed here';
  const parsed = schema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Not an allowed value');
}

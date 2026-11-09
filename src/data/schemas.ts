import { z } from 'zod';
import type { Quality } from '../model/types';

/* ---------- building blocks ---------- */

export const QUALITY_VALUES = ['measured', 'estimated', 'literature', 'dummy'] as const satisfies readonly Quality[];
export const QualitySchema = z.enum(QUALITY_VALUES);

const text = z.string().min(1);
const fraction = z.number().min(0).max(1);
const nonNegative = z.number().min(0);
const positive = z.number().gt(0);
const year = z.number().int().min(1900).max(2300);

/** `{ value, unit, source, quality }`: every authored number in `data/` is stored this way. */
export function field<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, unit: text, source: text, quality: QualitySchema });
}

/* ---------- constants.json ---------- */

export const ConstantsRecordSchema = z.strictObject({
  rhoTPerThousandM3: field(positive),
  lhvGjPerT: field(positive),
  co2PerCh4: field(positive),
  gwpOptions: field(z.array(positive).min(1)),
});
export type ConstantsRecord = z.infer<typeof ConstantsRecordSchema>;

/* ---------- technologies.json ---------- */

export const TechRecordSchema = z.strictObject({
  power: z.strictObject({
    minConc: field(fraction),
    destructionEff: field(fraction),
    electricalEff: field(fraction),
    capexUsdPerKw: field(nonNegative),
    opexUsdPerMwh: field(nonNegative),
    availability: field(fraction),
  }),
  flare: z.strictObject({
    minConc: field(fraction),
    destructionEff: field(fraction),
    capexUsdPerMm3Yr: field(nonNegative),
    opexFracOfCapex: field(fraction),
  }),
  rto: z.strictObject({
    minConc: field(fraction),
    destructionEff: field(fraction),
    capexUsdPerM3s: field(nonNegative),
    opexFracOfCapex: field(fraction),
    fanKwhPerM3sYr: field(nonNegative),
  }),
  drainage: z.strictObject({
    capexUsdPerMm3Yr: field(nonNegative),
    opexFracOfCapex: field(fraction),
  }),
  monitoring: z.strictObject({
    capexUsd: field(nonNegative),
  }),
});
export type TechRecord = z.infer<typeof TechRecordSchema>;

/* ---------- settings.default.json ---------- */

export const SettingsRecordSchema = z.strictObject({
  startYear: field(year),
  creditingYears: field(z.union([z.literal(10), z.literal(15)])),
  creditPriceUsdPerT: field(nonNegative),
  priceEscalation: field(z.number().min(-0.5).max(1)),
  discountRate: field(z.number().min(0).max(1)),
  gwp: field(positive),
  brokerShare: field(fraction),
  issuanceFeeUsdPerT: field(nonNegative),
  powerPriceUsdPerMwh: field(nonNegative),
  validationCostUsd: field(nonNegative),
  verificationCostUsdPerYr: field(nonNegative),
  contingency: field(nonNegative),
  grantShare: field(fraction),
  usdToInr: field(positive),
});
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>;

/* ---------- prices.json ---------- */

export const PRICE_BADGE_KINDS = ['sellable_now', 'sellable_later', 'benchmark'] as const;

export const PriceScenarioSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/, 'expected lower-case letters, digits and underscores'),
  label: text,
  /** Short form for chips, without the price: the UI appends "$11". */
  shortLabel: text,
  /** `null` only for the user's own `custom` scenario. */
  priceUsdPerT: field(nonNegative).nullable(),
  badge: z.strictObject({ kind: z.enum(PRICE_BADGE_KINDS), label: text }).nullable(),
  /** Shown as a chip above the slider. */
  chip: z.boolean(),
  /** Drawn as a tick on the price ruler. */
  ruler: z.boolean(),
  /** The scenario the mine page starts on. Exactly one. */
  default: z.boolean(),
  note: text,
  /** When the price was read, as text ("Aug to Oct 2026"). `null` for `custom`. */
  asOf: text.nullable(),
});
export type PriceScenario = z.infer<typeof PriceScenarioSchema>;

export const PriceScenariosSchema = z
  .array(PriceScenarioSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((s, i) => {
      if (seen.has(s.id))
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate price scenario id "${s.id}"` });
      seen.add(s.id);
      if ((s.id === 'custom') !== (s.priceUsdPerT === null)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'priceUsdPerT'],
          message: 'expected null for "custom" and a priced field for every other scenario',
        });
      }
      if (s.priceUsdPerT === null && s.asOf !== null) {
        ctx.addIssue({ code: 'custom', path: [i, 'asOf'], message: 'expected null when the scenario has no price' });
      }
      if (s.priceUsdPerT !== null && s.asOf === null) {
        ctx.addIssue({ code: 'custom', path: [i, 'asOf'], message: 'expected a date for a priced scenario' });
      }
    });
    const defaults = list.filter((s) => s.default).length;
    if (defaults !== 1)
      ctx.addIssue({ code: 'custom', message: `expected exactly one default scenario, found ${defaults}` });
  });

/* ---------- mines.json ---------- */

const closureFromTimeline = z.strictObject({
  from: z.literal('timeline'),
  unit: text,
  source: text,
  quality: QualitySchema,
});

const volumeOrSeries = z.union([nonNegative, z.array(nonNegative).min(1)]);

const ClosureAlternativeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: text,
  value: year,
  unit: text,
  source: text,
  quality: QualitySchema,
});

export const MineRecordSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'expected a lower-case slug such as "bccl-moonidih"'),
    kind: z.enum(['mine', 'archetype']),
    name: text,
    subsidiary: text,
    coalfield: text,
    state: text,
    mineType: z.enum(['UG', 'OC', 'mixed']),
    dgmsDegree: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    status: z.enum(['active', 'closing', 'closed']),
    /** A wrapped year, or `{ from: 'timeline' }` to read the run-out year from `closure_timeline.json`. */
    closureYear: z.union([field(year), closureFromTimeline]),
    /** Other closure bases the mine page offers as buttons, such as the FY2026-27 target year. */
    closureAlternatives: z.array(ClosureAlternativeSchema).optional(),
    productionMtPerYr: field(volumeOrSeries),
    specificEmissionM3PerT: field(nonNegative).optional(),
    drainedMm3PerYr: field(volumeOrSeries).optional(),
    drainedShare: field(fraction).optional(),
    drainedConc: field(fraction),
    vamMm3PerYr: field(volumeOrSeries).optional(),
    vamConc: field(fraction),
    vamAirflowM3s: field(positive).optional(),
    hasDrainageSystem: field(z.boolean()),
    powerOfftake: field(z.boolean()),
    captureEff: z.strictObject({ drained: field(fraction), vam: field(fraction), amm: field(fraction) }),
    amm: z
      .strictObject({
        fAmm: field(fraction),
        declineD: field(positive),
        hyperbolicB: field(positive),
        conc: field(fraction),
        q0BasisMm3: field(nonNegative).optional(),
        floodingYear: field(year).optional(),
        floodingFactor: field(fraction),
        q0Mm3: field(nonNegative).optional(),
        yearsSinceClosure: field(nonNegative).optional(),
      })
      .optional(),
    destructionMandated: field(z.strictObject({ drained: z.boolean(), vam: z.boolean(), amm: z.boolean() })),
    techOverride: z
      .strictObject({
        drained: z.enum(['power', 'flare', 'rto']).optional(),
        vam: z.enum(['power', 'flare', 'rto']).optional(),
        amm: z.enum(['power', 'flare', 'rto']).optional(),
      })
      .optional(),
    notes: z.array(text),
    sources: z.array(z.strictObject({ label: text, url: z.url() })),
  })
  .superRefine((m, ctx) => {
    // B1: liberated gas L = production x specific emission is needed unless both streams are measured.
    const needsLiberated = m.drainedMm3PerYr === undefined || m.vamMm3PerYr === undefined;
    if (needsLiberated && m.specificEmissionM3PerT === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['specificEmissionM3PerT'],
        message: 'required when drainedMm3PerYr or vamMm3PerYr is not given',
      });
    }
    if (m.drainedMm3PerYr === undefined && m.drainedShare === undefined) {
      ctx.addIssue({ code: 'custom', path: ['drainedShare'], message: 'required when drainedMm3PerYr is not given' });
    }
    if (m.mineType === 'OC' && m.dgmsDegree !== null) {
      ctx.addIssue({ code: 'custom', path: ['dgmsDegree'], message: 'expected null for an opencast mine' });
    }
    if (m.mineType === 'UG' && m.dgmsDegree === null) {
      ctx.addIssue({ code: 'custom', path: ['dgmsDegree'], message: 'expected 1, 2 or 3 for an underground mine' });
    }
  });
export type MineRecord = z.infer<typeof MineRecordSchema>;

export const MineRecordsSchema = z
  .array(MineRecordSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((m, i) => {
      if (seen.has(m.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate mine id "${m.id}"` });
      seen.add(m.id);
    });
  });

/* ---------- generated files (PLAN_V1 Appendix D) ---------- */
/* Generated files use plain objects, so Step 1 can add keys without breaking the loader. */

export const BAND_KEYS = ['by2031', 'by2036', 'by2050', 'after2050', 'nodate'] as const;
export type BandKey = (typeof BAND_KEYS)[number] | 'closed';

const numberOrNull = z.number().nullable();

export const MapMineSchema = z.object({
  id: text,
  wbId: text,
  name: text,
  company: text,
  state: text,
  type: text,
  band: z.enum(BAND_KEYS),
  runoutYear: numberOrNull,
  runoutLabel: text,
  status: text,
  field: text,
  x: z.number(),
  y: z.number(),
  modelled: z.boolean(),
});
export type MapMine = z.infer<typeof MapMineSchema>;

const point4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const MapDataSchema = z.object({
  generatedAt: text,
  sources: z.array(text),
  note: text,
  viewBox: point4,
  projection: z.object({ lat0: z.number(), k: z.number(), lonMin: z.number(), latMax: z.number() }),
  outline: text,
  coalStates: z.array(z.object({ name: text, d: text })),
  cities: z.array(z.object({ name: text, x: z.number(), y: z.number(), side: text })),
  lens: z.object({ window: point4, box: z.tuple([z.number(), z.number(), z.number()]) }),
  bands: z.object({
    by2031: z.number().int().min(0),
    by2036: z.number().int().min(0),
    by2050: z.number().int().min(0),
    after2050: z.number().int().min(0),
    nodate: z.number().int().min(0),
    closed: z.number().int().min(0),
  }),
  mines: z.array(MapMineSchema),
  closed: z.array(z.object({ name: text, company: text, field: text, x: z.number(), y: z.number() })),
});
export type MapData = z.infer<typeof MapDataSchema>;

export const TimelineEntrySchema = z.object({
  wbId: text,
  reserve2024Mt: numberOrNull,
  reserveLeft2026Mt: numberOrNull,
  outputMt: z.object({ fy2324: numberOrNull, fy2425: numberOrNull, fy2526: numberOrNull }),
  targetFy2627Mt: numberOrNull,
  rateUsedMtPerYr: numberOrNull,
  yearsLeft: numberOrNull,
  runoutYear: numberOrNull,
  runoutLabel: text,
  status: text,
  yearAtTarget: numberOrNull,
  ecCapacityMtPerYr: numberOrNull,
  yearAtEc: numberOrNull,
  note: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** Mine entries keyed by ID. The Step 1 pipeline also writes a `_meta` block (sources, date), which is dropped. */
export const ClosureTimelineSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const { _meta, ...entries } = raw as Record<string, unknown>;
  void _meta;
  return entries;
}, z.record(text, TimelineEntrySchema));
export type ClosureTimeline = z.infer<typeof ClosureTimelineSchema>;

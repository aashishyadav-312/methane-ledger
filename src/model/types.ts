export type Quality = 'measured' | 'estimated' | 'literature' | 'dummy';
export interface Field<T = number> { value: T; unit: string; source: string; quality: Quality }

export type Tech = 'power' | 'flare' | 'rto';
export type StreamKind = 'drained' | 'vam' | 'amm';
export type StreamStatus = 'ok' | 'needs_enrichment' | 'no_gas';
export type Warning = 'unsafe_range' | 'needs_enrichment' | 'closure_outside_window';

export interface Constants {
  rhoTPerThousandM3: number;   // 0.67
  lhvGjPerT: number;           // 50
  co2PerCh4: number;           // 44/16
  gwpOptions: number[];        // [21, 28, 29.8]
}

export interface TechLibrary {
  power: { minConc: number; destructionEff: number; electricalEff: number; capexUsdPerKw: number; opexUsdPerMwh: number; availability: number };
  flare: { minConc: number; destructionEff: number; capexUsdPerMm3Yr: number; opexFracOfCapex: number };
  rto: { minConc: number; destructionEff: number; capexUsdPerM3s: number; opexFracOfCapex: number; fanKwhPerM3sYr: number };
  drainage: { capexUsdPerMm3Yr: number; opexFracOfCapex: number };
  monitoring: { capexUsd: number };
}

export interface Settings {
  startYear: number;              // 2027
  creditingYears: 10 | 15;
  creditPriceUsdPerT: number;     // 15
  priceEscalation: number;        // 0 = flat; 0.03 = +3% a year
  discountRate: number;           // 0.10 real
  gwp: number;                    // 28
  brokerShare: number;            // 0.05
  issuanceFeeUsdPerT: number;     // 0.20
  powerPriceUsdPerMwh: number;    // 80
  validationCostUsd: number;      // 80000, year 1
  verificationCostUsdPerYr: number; // 50000
  contingency: number;            // 0.15
  grantShare: number;             // 0
  usdToInr: number;               // 95 (rupees per US dollar); converts the staff cost in the cost build-up
  /** Cost basis. Missing means 'v1' (all-in unit costs), so v1 fixtures keep working. 'buildup' needs `CostParams`. */
  costModel?: CostModel;
}

/* ---------- cost build-up (PLAN_V1 Appendix G) ---------- */

export type CostModel = 'v1' | 'buildup';
export type CostCategory = 'equipment' | 'materials' | 'labour' | 'civil';
export type CostItem = 'power' | 'flare' | 'rto' | 'drainage' | 'grid_connection' | 'monitoring';
export type OpexType = 'om' | 'overhaul' | 'staff' | 'insurance' | 'fan_power' | 'decommissioning';

export interface CostParams {
  localFactor: number; importMarkup: number; ownersCost: number; gridConnectionUsd: number;
  decommissioning: number; insurance: number; staffCostInr: number;
  headcount: Record<'power' | 'flare' | 'rto' | 'drainage' | 'monitoring', number>;
  split: Record<'power' | 'flare' | 'rto' | 'drainage', [number, number, number, number]>;
  imported: Record<'power' | 'flare' | 'rto' | 'drainage', number>;
  nonlabourOm: { powerPerMwh: number; flareFrac: number; rtoFrac: number; drainageFrac: number };
  overhaulUsdPerKw: number; overhaulHours: number;
}

/**
 * What the build-up costs, before any grant: `capexItems` sum to `capexUsd / (1 - grantShare)`.
 * `opexByType[type][i]` is the cost in crediting year i + 1.
 */
export interface CostBreakdown {
  capexItems: { stream: StreamKind | 'site'; item: CostItem; category: CostCategory; usd: number }[];
  capexByCategory: Record<CostCategory, number>;
  opexByType: Record<OpexType, number[]>;
}

export interface MineInput {
  id: string;
  name: string;
  closureYear: number;
  productionMtPerYr: number | number[];
  specificEmissionM3PerT?: number;
  drainedMm3PerYr?: number | number[];
  drainedShare?: number;
  drainedConc: number;
  vamMm3PerYr?: number | number[];
  vamConc: number;
  vamAirflowM3s?: number;          // if given, RTO is sized on it
  hasDrainageSystem: boolean;
  powerOfftake: boolean;
  captureEff: { drained: number; vam: number; amm: number };
  amm?: { fAmm: number; declineD: number; hyperbolicB: number; conc: number; q0BasisMm3?: number; floodingYear?: number; floodingFactor: number; q0Mm3?: number; yearsSinceClosure?: number };
  destructionMandated: { drained: boolean; vam: boolean; amm: boolean };
  techOverride?: Partial<Record<StreamKind, Tech>>;
}

export interface StreamInput {
  kind: StreamKind; label: string; concFraction: number; ch4Mm3ByYear: number[];
  tech: Tech | null; status: StreamStatus; captureEff: number;
  needsDrainageCapex: boolean; destructionMandated: boolean; warnings: Warning[];
  airflowM3s?: number;             // VAM only: measured ventilation airflow; if given, the RTO is sized on it
}

export interface YearRow {
  year: number; erTco2e: number; ch4CapturedT: number; priceUsdPerT: number;
  creditRevUsd: number; energyRevUsd: number; opexUsd: number; mrvUsd: number; cashUsd: number; cumCashUsd: number;
  byStream: Record<StreamKind, { erTco2e: number; ch4Mm3: number }>;
}

export interface StreamResult {
  kind: StreamKind; label: string; tech: Tech | null; status: StreamStatus;
  capexUsd: number; erTotalTco2e: number; breakevenUsdPerT: number | null; warnings: Warning[];
}

export interface Result {
  abatable: boolean; activeYears: number; postYears: number;
  capexUsd: number; cashUsd: number[]; years: YearRow[];
  erTotalTco2e: number; erYear1Tco2e: number;
  breakevenUsdPerT: number | null; npvUsd: number; irr: number | null;
  paybackIndex: number | null; paybackYear: number | null;
  streams: StreamResult[]; warnings: Warning[];
  /** Present only with `settings.costModel === 'buildup'`. */
  costs?: CostBreakdown;
}

/* ---------- estimated inputs for every mine (PLAN_V2 Appendix B) and the closure-year curve (Appendix C) ---------- */

/** DGMS gassiness grade (degree): I, II or III. */
export type GassinessDegree = 1 | 2 | 3;

/** Gas parameters of one gassiness grade. Every value is ESTIMATED until a mine-wise DGMS list replaces it. */
export interface DegreeParams {
  /** m3 of CH4 per tonne of coal mined. */
  specificEmissionM3PerT: number;
  /** Share of the liberated gas that is drained (0 to 1). */
  drainedShare: number;
  /** CH4 fraction of the drained gas. */
  drainedConc: number;
  /** CH4 fraction of the ventilation air. */
  vamConc: number;
}

/** The Appendix B parameters, as plain numbers (`data/estimation.json` holds them with unit, source and quality). */
export interface EstimationParams {
  /** Gassiness grade by coalfield key (the `field` of a mine). */
  degreeByField: Record<string, GassinessDegree>;
  /** Grade of every coalfield not in `degreeByField`. */
  defaultDegree: GassinessDegree;
  byDegree: Record<'1' | '2' | '3', DegreeParams>;
  /** Opencast mines: m3 of CH4 per tonne. There is no drained gas and no ventilation air stream. */
  opencastSpecificEmissionM3PerT: number;
  /** Share of a mixed mine's output assumed to come from underground workings (0 to 1). */
  mixedUndergroundShare: number;
  /** Abandoned mine methane after closure: first-year flow as a share of the last active year's gas, and its CH4 fraction. */
  afterClosure: { fAmm: number; conc: number };
  /** Capture efficiency by stream (share of the liberated gas collected). */
  captureEff: { drained: number; vam: number; amm: number };
  /** Lowest ventilation-air CH4 fraction an oxidiser accepts. Equals `rto.minConc` in `data/technologies.json` (a test checks). */
  oxidiserMinVamConc: number;
}

export type EstimateStatus = 'ok' | 'not_abatable' | 'no_output';
export type EstimateWarning = 'closure_uncertain';

/** The part of a mine's map record the estimate needs. */
export interface EstimateMine {
  id: string;
  name: string;
  type: 'UG' | 'OC' | 'Mixed';
  /** Coalfield key, for example `jharia`. */
  field: string;
}

/** The part of a mine's closure timeline entry the estimate needs. */
export interface EstimateTimeline {
  /** FY2025-26 output used for the run-out, Mt a year; null when unknown. */
  rateUsedMtPerYr: number | null;
  /** Last year of mining; null for "After 2225". */
  runoutYear: number | null;
  /** `Producing`, `Not producing` or `Past reported reserve`. */
  status: string;
}

/** Values the inputs panel can change before the estimate is built. Each one replaces the estimated value. */
export interface EstimateOverrides {
  /** Applies to any mine type; on an opencast mine the whole output is then treated as underground. */
  degree?: GassinessDegree;
  /** Coal output, Mt a year. */
  outputMtPerYr?: number;
  /** Total CH4 liberated, Mm3 a year; split into drained gas and ventilation air by the grade's drained share. */
  totalMm3?: number;
  /** Last year of mining. */
  closureYear?: number;
}

export interface EstimateResult {
  /** The model input; null unless `status` is `ok`. */
  input: MineInput | null;
  status: EstimateStatus;
  /** Why the mine cannot be modelled. Present unless `status` is `ok`. */
  reason?: string;
  /** Gassiness grade used; null for an opencast mine. */
  degree: GassinessDegree | null;
  /** m3 of CH4 per tonne of underground coal. */
  specificEmission: number;
  /** Total CH4 liberated, Mm3 a year. 0 when there is no output. */
  totalMm3: number;
  warnings: EstimateWarning[];
  /** Coal output used, Mt a year. */
  productionMtPerYr: number;
  /** Last year of mining used (after any clamp to the first model year). */
  closureYear: number;
  /** Years of the crediting window in which the mine still produces. */
  activeYears: number;
  drainedMm3: number;
  vamMm3: number;
}

/** Break-even price (USD per tCO2e) for each closure year of the crediting window, drained and after-closure gas to power or to a flare. */
export interface ClosureCurve {
  years: number[];
  /** `null` where no break-even exists. */
  power: (number | null)[];
  flare: (number | null)[];
  /** First year where power is at or below flare; null if there is none. */
  crossoverYear: number | null;
}

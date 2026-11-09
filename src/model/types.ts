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

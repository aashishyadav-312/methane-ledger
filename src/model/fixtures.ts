import type { MineInput, Settings, TechLibrary } from './types';
import { AMM_DEFAULTS, CAPTURE_EFF_DEFAULTS } from './constants';

/**
 * Golden-case inputs (PLAN_V1 Appendix B6). These reproduce reference/ref_v1.py and tests/golden/*.json.
 * All values are DUMMY placeholders until CMPDI data arrives. Step 3 builds the same inputs from data/ JSON,
 * and a test checks the two agree. The app reads data/, not this file.
 */

/** Reference settings. Source: reference/cmm_model.py `Settings` defaults (all DUMMY). */
export const REFERENCE_SETTINGS: Settings = {
  startYear: 2027,
  creditingYears: 10,
  creditPriceUsdPerT: 15,
  priceEscalation: 0,
  discountRate: 0.1,
  gwp: 28,
  brokerShare: 0.05,
  issuanceFeeUsdPerT: 0.2,
  powerPriceUsdPerMwh: 80,
  validationCostUsd: 80_000,
  verificationCostUsdPerYr: 50_000,
  contingency: 0.15,
  grantShare: 0,
  usdToInr: 85, // placeholder, not used by the model
};

/** Reference technology library. Source: reference/cmm_model.py `TECH` and `Settings.monitoring_capex` (DUMMY). */
export const REFERENCE_TECH: TechLibrary = {
  power: { minConc: 0.3, destructionEff: 0.995, electricalEff: 0.38, capexUsdPerKw: 1300, opexUsdPerMwh: 15, availability: 0.9 },
  flare: { minConc: 0.25, destructionEff: 0.98, capexUsdPerMm3Yr: 40_000, opexFracOfCapex: 0.05 },
  rto: { minConc: 0.002, destructionEff: 0.97, capexUsdPerM3s: 60_000, opexFracOfCapex: 0.06, fanKwhPerM3sYr: 60_000 },
  drainage: { capexUsdPerMm3Yr: 250_000, opexFracOfCapex: 0.04 },
  monitoring: { capexUsd: 250_000 },
};

const NOTHING_MANDATED = { drained: false, vam: false, amm: false };

/** AMM as at Moonidih: 30% of last-year liberation, hyperbolic decline D 0.25, b 1, conc 0.60, no flooding. */
const MOONIDIH_AMM: NonNullable<MineInput['amm']> = {
  fAmm: AMM_DEFAULTS.fAmm,
  declineD: AMM_DEFAULTS.declineD,
  hyperbolicB: AMM_DEFAULTS.hyperbolicB,
  conc: 0.6,
  floodingFactor: AMM_DEFAULTS.floodingFactor,
};

/** moonidih_v1: closure end 2030, measured drained 20 Mm3 at 50% and VAM 3.45 Mm3 at 0.3%. */
export const MOONIDIH_V1: MineInput = {
  id: 'moonidih',
  name: 'Moonidih',
  closureYear: 2030,
  productionMtPerYr: 0.6,
  drainedMm3PerYr: 20,
  drainedConc: 0.5,
  vamMm3PerYr: 3.45,
  vamConc: 0.003,
  hasDrainageSystem: false,
  powerOfftake: true,
  captureEff: { ...CAPTURE_EFF_DEFAULTS },
  amm: { ...MOONIDIH_AMM },
  destructionMandated: { ...NOTHING_MANDATED },
};

/** moonidih_wb2034: the same, with closure 2034 from the v5 workbook. */
export const MOONIDIH_WB2034: MineInput = { ...MOONIDIH_V1, closureYear: 2034, amm: { ...MOONIDIH_AMM } };

function archetype(
  id: string,
  name: string,
  p: { productionMtPerYr: number; se: number; drainedShare: number; drainedConc: number; vamConc: number; closureYear: number },
  withAmm: boolean,
): MineInput {
  const mine: MineInput = {
    id,
    name,
    closureYear: p.closureYear,
    productionMtPerYr: p.productionMtPerYr,
    specificEmissionM3PerT: p.se,
    drainedShare: p.drainedShare,
    drainedConc: p.drainedConc,
    vamConc: p.vamConc,
    hasDrainageSystem: false,
    powerOfftake: true,
    captureEff: { ...CAPTURE_EFF_DEFAULTS },
    destructionMandated: { ...NOTHING_MANDATED },
  };
  if (withAmm) mine.amm = { ...MOONIDIH_AMM };
  return mine;
}

/** The five archetypes, keyed by their names in tests/golden/archetypes_v1.json. Drained conc "n/a" is 0. */
export const ARCHETYPES: Record<string, MineInput> = {
  'Degree I underground': archetype(
    'degree-1',
    'Degree I underground',
    { productionMtPerYr: 0.5, se: 0.8, drainedShare: 0, drainedConc: 0, vamConc: 0.0005, closureYear: 2036 },
    false,
  ),
  'Degree II underground': archetype(
    'degree-2',
    'Degree II underground',
    { productionMtPerYr: 0.5, se: 5, drainedShare: 0.3, drainedConc: 0.35, vamConc: 0.002, closureYear: 2036 },
    false,
  ),
  'Degree III underground': archetype(
    'degree-3',
    'Degree III underground',
    { productionMtPerYr: 0.5, se: 15, drainedShare: 0.5, drainedConc: 0.5, vamConc: 0.004, closureYear: 2036 },
    false,
  ),
  'Degree III, closing in 4 yrs': archetype(
    'degree-3-closing',
    'Degree III, closing in 4 years',
    { productionMtPerYr: 0.5, se: 15, drainedShare: 0.5, drainedConc: 0.5, vamConc: 0.004, closureYear: 2030 },
    true,
  ),
  Opencast: archetype(
    'opencast',
    'Opencast',
    { productionMtPerYr: 5, se: 0.3, drainedShare: 0, drainedConc: 0, vamConc: 0, closureYear: 2036 },
    false,
  ),
};

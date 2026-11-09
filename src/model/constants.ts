import type { Constants } from './types';

/**
 * Physical constants. Every value carries its source.
 * The model takes these as an argument (`evaluate(mine, settings, tech, constants)`) so nothing is hidden.
 */
export const CONSTANTS: Constants = {
  // Density of CH4 at 20 C and 1 atm: 0.67 t per 1,000 m3 (= kg/m3). Source: UNFCCC ACM0008 convention,
  // reference/cmm_model.py RHO.
  rhoTPerThousandM3: 0.67,
  // Lower heating value of CH4: 50 GJ per t. Source: reference/cmm_model.py LHV (IPCC 2006 Vol. 2 Table 1.2, 50.0).
  lhvGjPerT: 50,
  // CO2 from burning 1 t CH4: molar mass ratio 44/16 = 2.75 t CO2. Source: stoichiometry, reference/cmm_model.py.
  co2PerCh4: 44 / 16,
  // GWP100 options: 21 (IPCC SAR, legacy CDM), 28 (IPCC AR5), 29.8 (IPCC AR6 fossil CH4).
  // Source: reference/cmm_model.py Settings.gwp comment.
  gwpOptions: [21, 28, 29.8],
};

/** Unit conversions (exact by definition). */
export const M3_PER_MM3 = 1e6;
export const THOUSAND_M3_PER_MM3 = 1000;
export const HOURS_PER_YEAR = 8760; // 365 days x 24 h, as in reference/cmm_model.py
export const SECONDS_PER_YEAR = HOURS_PER_YEAR * 3600; // 31,536,000 s
export const GJ_PER_MWH = 3.6;
export const KW_PER_MW = 1000;
export const KWH_PER_MWH = 1000;

/**
 * Explosive range of methane in air, as a CH4 fraction: 5% (lower explosive limit) to 15% (upper explosive limit).
 * Source: PLAN_V1 Appendix B2; standard LEL/UEL for methane (for example DGMS circulars, NIOSH).
 */
export const EXPLOSIVE_RANGE_CONC = { lower: 0.05, upper: 0.15 } as const;

/**
 * Abandoned mine methane (AMM) defaults. Source: PLAN_V1 Appendix B1 and reference/cmm_model.py
 * (`amm_profile` D = 0.25, b = 1; Moonidih q0 = 0.30 x last-year liberation). All DUMMY.
 */
export const AMM_DEFAULTS = {
  fAmm: 0.3,
  declineD: 0.25,
  hyperbolicB: 1,
  floodingFactor: 0.5,
} as const;

/**
 * Capture efficiency defaults (share of liberated CH4 the system collects). Source: PLAN_V1 Appendix B2 and
 * reference/cmm_model.py `moonidih()` (drained 1.0, VAM 0.85, AMM 0.70). All DUMMY.
 */
export const CAPTURE_EFF_DEFAULTS = { drained: 1.0, vam: 0.85, amm: 0.7 } as const;

/** Stream labels, from docs/DESIGN.md stream colour tokens. */
export const STREAM_LABELS = {
  drained: 'Drained gas',
  vam: 'Ventilation air',
  amm: 'After closure',
} as const;

/** The three streams in display order. */
export const STREAM_KINDS = ['drained', 'vam', 'amm'] as const;

/** IRR search (PLAN_V1 Appendix B5, reference/ref_v1.py `irr`). */
export const IRR_SEARCH = { highRate: 10, lowRate: -0.9, step: 0.01, bisections: 200 } as const;

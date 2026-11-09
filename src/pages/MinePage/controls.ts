// Ranges and options for the mine page controls. Source: docs/PLAN_V1.md Step 6 (layout) and
// design/Moonidih.dc.html. These are control settings, not model inputs: each one only picks a value that is
// then handed to `evaluate`.

/** Credit price slider, US$ per tCO2e. */
export const PRICE_SLIDER_USD_PER_T = { min: 0, max: 40, step: 1 } as const;
/** Credit price number input, US$ per tCO2e (Step 6: "a number input up to $200"). */
export const PRICE_INPUT_USD_PER_T = { min: 0, max: 200, step: 0.01 } as const;
/** The NPV chart spans the slider: 41 points at $1 steps from $0 to $40. */
export const NPV_CURVE_STEP_USD_PER_T = 1;

/** Drained gas slider, Mm3 CH4 a year. */
export const DRAINED_SLIDER_MM3_PER_YR = { min: 5, max: 80, step: 1 } as const;

/** Methane in ventilation air, as a fraction: 0.1%, 0.3%, 0.6%. */
export const VAM_CONC_OPTIONS = [0.001, 0.003, 0.006] as const;
/** Grant toward the build cost, as a share: none, 15%, 30%. */
export const GRANT_OPTIONS = [0, 0.15, 0.3] as const;
/** Real discount rate: 8%, 10%, 12%. */
export const DISCOUNT_OPTIONS = [0.08, 0.1, 0.12] as const;
/** Crediting period, years. */
export const CREDITING_OPTIONS = [10, 15] as const;

/** Above this the headline shows ">$99" instead of the number (design/Moonidih.dc.html). */
export const HEADLINE_CAP_USD_PER_T = 99;

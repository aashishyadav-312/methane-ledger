import type { Constants, MineInput, Settings, TechLibrary } from './types';
import { breakevenUsdPerT } from './finance';
import { mineComponents } from './waterfall';

export type TornadoKey =
  | 'power_price'
  | 'engine_capex'
  | 'rto_capex'
  | 'drained'
  | 'closure'
  | 'discount'
  | 'gwp'
  | 'f_amm'
  | 'vam_conc'
  | 'contingency';

/** A low and a high value for one input. Source of every pair: PLAN_V1 Appendix B8 tornado table (DUMMY ranges). */
export interface Range {
  low: number;
  high: number;
}

export interface TornadoParams {
  powerPriceUsdPerMwh: Range;
  engineCapexUsdPerKw: Range;
  rtoCapexUsdPerM3s: Range;
  drainedMm3PerYr: Range;
  /** Years earlier (low) and later (high) than the mine's closure year, as positive numbers. */
  closureYearsEitherSide: number;
  discountRate: Range;
  gwp: Range;
  fAmm: Range;
  vamConc: Range;
  contingency: Range;
}

export const TORNADO_DEFAULTS: TornadoParams = {
  powerPriceUsdPerMwh: { low: 40, high: 120 },
  engineCapexUsdPerKw: { low: 910, high: 1690 },
  rtoCapexUsdPerM3s: { low: 42_000, high: 78_000 },
  drainedMm3PerYr: { low: 10, high: 30 },
  closureYearsEitherSide: 2,
  discountRate: { low: 0.08, high: 0.12 },
  gwp: { low: 21, high: 29.8 },
  fAmm: { low: 0.15, high: 0.45 },
  vamConc: { low: 0.002, high: 0.006 },
  contingency: { low: 0, high: 0.4 },
};

export interface TornadoRow {
  key: TornadoKey;
  label: string;
  /** Unit of `lowInput` and `highInput`. */
  inputUnit: string;
  /** The input value used for the low case (for closure, the year after clamping to the window). */
  lowInput: number;
  highInput: number;
  /** Break-even at the low case; `null` when there are no reductions. */
  lowCaseUsdPerT: number | null;
  highCaseUsdPerT: number | null;
  /** |high - low|; 0 when either case has no break-even. */
  swingUsdPerT: number;
}

export interface TornadoResult {
  baseUsdPerT: number | null;
  /** All ten rows, sorted by swing, largest first (ties keep table order). */
  rows: TornadoRow[];
  /** Keys of the first six rows. */
  top6: TornadoKey[];
}

interface Scenario {
  mine: MineInput;
  settings: Settings;
  tech: TechLibrary;
}

interface RowSpec {
  key: TornadoKey;
  label: string;
  inputUnit: string;
  range: Range;
  /** Apply one value to a copy of the inputs; returns the inputs unchanged when the mine has nothing to perturb. */
  apply: (s: Scenario, value: number) => Scenario;
}

/** Closure year clamped so the active years stay inside the crediting window. */
function clampClosureYear(year: number, settings: Settings): number {
  return Math.min(Math.max(year, settings.startYear - 1), settings.startYear + settings.creditingYears - 1);
}

function specs(mine: MineInput, settings: Settings, p: TornadoParams): RowSpec[] {
  const closure = (yearsOffset: number) => clampClosureYear(mine.closureYear + yearsOffset, settings);
  return [
    {
      key: 'power_price',
      label: 'Power value',
      inputUnit: 'USD per MWh',
      range: p.powerPriceUsdPerMwh,
      apply: (s, v) => ({ ...s, settings: { ...s.settings, powerPriceUsdPerMwh: v } }),
    },
    {
      key: 'engine_capex',
      label: 'Engine capex',
      inputUnit: 'USD per kW',
      range: p.engineCapexUsdPerKw,
      apply: (s, v) => ({ ...s, tech: { ...s.tech, power: { ...s.tech.power, capexUsdPerKw: v } } }),
    },
    {
      key: 'rto_capex',
      label: 'RTO capex',
      inputUnit: 'USD per m3/s',
      range: p.rtoCapexUsdPerM3s,
      apply: (s, v) => ({ ...s, tech: { ...s.tech, rto: { ...s.tech.rto, capexUsdPerM3s: v } } }),
    },
    {
      key: 'drained',
      label: 'Drained gas',
      inputUnit: 'Mm3 a year',
      range: p.drainedMm3PerYr,
      apply: (s, v) => ({ ...s, mine: { ...s.mine, drainedMm3PerYr: v } }),
    },
    {
      key: 'closure',
      label: 'Closure year',
      inputUnit: 'year',
      range: { low: closure(-p.closureYearsEitherSide), high: closure(p.closureYearsEitherSide) },
      apply: (s, v) => ({ ...s, mine: { ...s.mine, closureYear: v } }),
    },
    {
      key: 'discount',
      label: 'Discount rate',
      inputUnit: 'fraction a year',
      range: p.discountRate,
      apply: (s, v) => ({ ...s, settings: { ...s.settings, discountRate: v } }),
    },
    {
      key: 'gwp',
      label: 'Global warming potential',
      inputUnit: 'tCO2e per t CH4',
      range: p.gwp,
      apply: (s, v) => ({ ...s, settings: { ...s.settings, gwp: v } }),
    },
    {
      key: 'f_amm',
      label: 'Gas after closure',
      inputUnit: 'fraction of last-year gas',
      range: p.fAmm,
      // A mine with no `amm` input has no gas after closure to change.
      apply: (s, v) => (s.mine.amm ? { ...s, mine: { ...s.mine, amm: { ...s.mine.amm, fAmm: v } } } : s),
    },
    {
      key: 'vam_conc',
      label: 'Ventilation methane',
      inputUnit: 'fraction CH4 in air',
      range: p.vamConc,
      apply: (s, v) => ({ ...s, mine: { ...s.mine, vamConc: v } }),
    },
    {
      key: 'contingency',
      label: 'Contingency',
      inputUnit: 'fraction of capex',
      range: p.contingency,
      apply: (s, v) => ({ ...s, settings: { ...s.settings, contingency: v } }),
    },
  ];
}

/**
 * Appendix B8 tornado: ten one-at-a-time perturbations of the break-even, sorted by swing.
 * Works for any `MineInput`; closure is clamped to the window. A row whose input does not exist for the mine
 * (for example gas after closure on a mine with no `amm`) shows the base value at both ends.
 */
export function tornado(
  mine: MineInput,
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
  params: TornadoParams = TORNADO_DEFAULTS,
): TornadoResult {
  const breakeven = (s: Scenario) => breakevenUsdPerT(mineComponents(s.mine, s.settings, s.tech, constants), s.settings);
  const start: Scenario = { mine, settings, tech };
  const rows = specs(mine, settings, params).map((spec): TornadoRow => {
    const lowCaseUsdPerT = breakeven(spec.apply(start, spec.range.low));
    const highCaseUsdPerT = breakeven(spec.apply(start, spec.range.high));
    return {
      key: spec.key,
      label: spec.label,
      inputUnit: spec.inputUnit,
      lowInput: spec.range.low,
      highInput: spec.range.high,
      lowCaseUsdPerT,
      highCaseUsdPerT,
      swingUsdPerT: lowCaseUsdPerT === null || highCaseUsdPerT === null ? 0 : Math.abs(highCaseUsdPerT - lowCaseUsdPerT),
    };
  });
  const sorted = [...rows].sort((a, b) => b.swingUsdPerT - a.swingUsdPerT);
  return { baseUsdPerT: breakeven(start), rows: sorted, top6: sorted.slice(0, 6).map((r) => r.key) };
}

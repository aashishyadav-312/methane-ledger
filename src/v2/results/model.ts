// Everything the results dashboard shows beyond the `Result` it is given: the financing structures, the break-even
// waterfall, the tornado and the closure-year curve. Each is the model's own function (src/model); this file only
// chooses the inputs, so every number on the dashboard traces to `evaluate`, `financing`, `waterfall`, `tornado` or
// `closureCurve`.
import { getConstants, getCosts, getDefaultSettings, getPrices, getTech } from '../../data/load';
import type { PriceScenario } from '../../data/schemas';
import { closureCurve } from '../../model/closureCurve';
import { FIN_DEFAULTS, financing, type FinancingParams, type FinancingResult } from '../../model/financing';
import { TORNADO_DEFAULTS, tornado, type TornadoResult } from '../../model/tornado';
import type { ClosureCurve, Constants, CostParams, MineInput, Settings, TechLibrary } from '../../model/types';
import { waterfall, type Waterfall } from '../../model/waterfall';

export type StructureKey = 'A' | 'B' | 'C' | 'D' | 'E';
export const STRUCTURE_KEYS: readonly StructureKey[] = ['A', 'B', 'C', 'D', 'E'];

/** The model data the dashboard runs on. Defaults to the data files, as the rest of the app does. */
export interface ResultsData {
  tech: TechLibrary;
  constants: Constants;
  costs: CostParams;
  /** Structure parameters. E is the 30% grant of the illustration, whatever the panel's own grant is. */
  finance: FinancingParams;
  prices: PriceScenario[];
}

export function defaultResultsData(): ResultsData {
  return { tech: getTech(), constants: getConstants(), costs: getCosts(), finance: FIN_DEFAULTS, prices: getPrices() };
}

/** Default settings at the panel's credit price; what the dashboard uses when its caller passes no settings. */
export function settingsAtPrice(priceUsdPerT: number, base: Settings = getDefaultSettings()): Settings {
  return { ...base, creditPriceUsdPerT: priceUsdPerT };
}

export interface ResultsModel {
  finance: FinancingResult;
  /** `null` when there are no reductions. */
  waterfall: Waterfall | null;
  tornado: TornadoResult;
  curve: ClosureCurve;
}

/**
 * The break-even does not depend on the credit price, so the waterfall, tornado and closure curve are built once
 * per input and settings-without-price; only `financing` needs the price. Callers memoise on that split.
 */
export function priceFreeModel(
  input: MineInput,
  settings: Settings,
  data: ResultsData,
): Pick<ResultsModel, 'waterfall' | 'tornado' | 'curve'> {
  const { tech, constants, costs } = data;
  return {
    waterfall: waterfall(input, settings, tech, constants, costs),
    tornado: tornado(input, settings, tech, constants, TORNADO_DEFAULTS, costs),
    curve: closureCurve(input, settings, tech, constants, costs),
  };
}

export function financeModel(input: MineInput, settings: Settings, data: ResultsData): FinancingResult {
  return financing(input, settings, data.tech, data.constants, data.finance, data.costs);
}

export function resultsModel(input: MineInput, settings: Settings, data: ResultsData = defaultResultsData()): ResultsModel {
  return { ...priceFreeModel(input, settings, data), finance: financeModel(input, settings, data) };
}

/** A price scenario's value, or null when it has none. */
export function scenarioPrice(prices: PriceScenario[], id: string): { label: string; usdPerT: number } | null {
  const s = prices.find((p) => p.id === id);
  return s && s.priceUsdPerT !== null ? { label: s.label, usdPerT: s.priceUsdPerT.value } : null;
}

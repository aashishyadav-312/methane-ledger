import { useMemo } from 'react';
import {
  evaluate,
  selectTech,
  type Constants,
  type CostParams,
  type MineInput,
  type Result,
  type Settings,
  type TechLibrary,
} from '../../model';
import { explain, type Explanation } from '../../model/explain';
import { FIN_DEFAULTS, financing, type FinancingParams, type FinancingResult } from '../../model/financing';
import { TORNADO_DEFAULTS, tornado, type TornadoResult } from '../../model/tornado';
import { waterfall, type Waterfall } from '../../model/waterfall';
import {
  getConstants,
  getCosts,
  getDefaultSettings,
  getPrices,
  getTech,
  getTimeline,
  unwrapMine,
} from '../../data/load';
import type { MineRecord, PriceScenario } from '../../data/schemas';
import { applyOverrides, type Overrides } from '../../state/session';
import { applyUploadedSeries } from '../DataPage/upload';
import { CUSTOM_BASIS, type DrainedUse, type MineView, type PanelChanges, type PanelState } from '../../state/url';
import { NPV_CURVE_STEP_USD_PER_T, PRICE_SLIDER_USD_PER_T } from './controls';

export interface ClosureBasis {
  id: string;
  label: string;
  year: number;
}

/** Everything about a mine that does not depend on the controls. */
export interface MineBase {
  record: MineRecord;
  /** The record as `evaluate` takes it, with session overrides and uploaded yearly series applied. */
  input: MineInput;
  /** True when an upload set a yearly series for this mine. */
  hasUploadedSeries: boolean;
  /** The session overrides this base was built from. */
  overrides: Overrides;
  /** Settings with the cost basis from the panel (`cm=`); the short-key controls are applied later. */
  settings: Settings;
  tech: TechLibrary;
  constants: Constants;
  /** The cost build-up parameters (used when `settings.costModel` is "buildup"). */
  costs: CostParams;
  /** Financing structure parameters; E's grant is replaced by the grant control. */
  finance: FinancingParams;
  /** Price scenarios with any panel changes to their prices. */
  prices: PriceScenario[];
  /** The panel state this base was built from. */
  panel: PanelState;
  /** `now` first, then the record's closure alternatives. Empty when the record has none. */
  bases: ClosureBasis[];
  defaults: MineView;
}

function defaultUse(input: MineInput, tech: TechLibrary): DrainedUse {
  const choice = selectTech('drained', input.drainedConc, input.powerOfftake, tech, input.techOverride?.drained);
  return choice.tech === 'flare' ? 'flare' : 'power';
}

function withPrices(prices: PriceScenario[], changes: PanelChanges): PriceScenario[] {
  return prices.map((s) => {
    const p = changes[`prices.${s.id}`];
    return typeof p === 'number' && s.priceUsdPerT !== null
      ? { ...s, priceUsdPerT: { ...s.priceUsdPerT, value: p } }
      : s;
  });
}

/**
 * v1's all-in unit costs with no panel changes. The Compare page (and its tests) build mine bases with this
 * until they pass cost parameters to the model; the mine page passes its own panel state.
 */
export const V1_PANEL: PanelState = Object.freeze({ costModel: 'v1', changes: Object.freeze({}) });

/**
 * The fixed inputs and the default view for a mine. Layers, last wins: the data files, the session overrides
 * (Assumptions and Data pages), then the "All assumptions" panel changes from the link (`x=`, `cm=`).
 */
export function mineBase(record: MineRecord, overrides: Overrides, panel: PanelState = V1_PANEL): MineBase {
  const layer = <T extends object>(target: T, sessionPrefix: string, panelPrefix = sessionPrefix): T =>
    applyOverrides(applyOverrides(target, overrides, sessionPrefix), panel.changes, panelPrefix);
  const settings: Settings = { ...layer(getDefaultSettings(), 'settings'), costModel: panel.costModel };
  const tech = layer(getTech(), 'tech');
  const costs = layer(getCosts(), 'costs');
  const constants = applyOverrides(getConstants(), overrides, 'constants');
  const finance = applyOverrides(FIN_DEFAULTS, panel.changes, 'finance');
  const prices = withPrices(getPrices(), panel.changes);
  const plain = layer(unwrapMine(record, getTimeline()), `mine.${record.id}`, 'mine');
  const input = applyUploadedSeries(plain, overrides);

  const alternatives = record.closureAlternatives ?? [];
  const bases: ClosureBasis[] =
    alternatives.length === 0
      ? []
      : [
          { id: 'now', label: 'At current output', year: input.closureYear },
          ...alternatives.map((a) => ({ id: a.id, label: a.label, year: a.value })),
        ];

  const defaults: MineView = {
    priceUsdPerT: settings.creditPriceUsdPerT,
    drainedMm3PerYr: typeof input.drainedMm3PerYr === 'number' ? input.drainedMm3PerYr : null,
    closureBasis: bases.length > 0 ? 'now' : CUSTOM_BASIS,
    closureYear: input.closureYear,
    vamConc: input.vamConc,
    drainedUse: defaultUse(input, tech),
    grantShare: settings.grantShare,
    discountRate: settings.discountRate,
    gwp: settings.gwp,
    creditingYears: settings.creditingYears,
  };
  return {
    record,
    input,
    hasUploadedSeries: input !== plain,
    overrides,
    settings,
    tech,
    constants,
    costs,
    finance,
    prices,
    panel,
    bases,
    defaults,
  };
}

export interface NpvPoint {
  priceUsdPerT: number;
  npvUsd: number;
}

export interface MineModel {
  input: MineInput;
  settings: Settings;
  result: Result;
  /** NPV at $0, $1, ... $40 (41 points). */
  npvCurve: NpvPoint[];
  /** Structures A to E at your price. E's grant is the grant control. */
  finance: FinancingResult;
  /** The project break-even split into its parts; `null` when there are no reductions. */
  waterfall: Waterfall | null;
  tornado: TornadoResult;
  explanation: Explanation;
}

const CURVE_PRICES_USD_PER_T = Array.from(
  { length: (PRICE_SLIDER_USD_PER_T.max - PRICE_SLIDER_USD_PER_T.min) / NPV_CURVE_STEP_USD_PER_T + 1 },
  (_, i) => PRICE_SLIDER_USD_PER_T.min + i * NPV_CURVE_STEP_USD_PER_T,
);

/**
 * Runs `evaluate` for the current view. The mine input and settings are memoised on the controls that feed
 * them, so a price move re-runs one evaluation and leaves the 41-point NPV curve alone.
 */
export function useMineModel(base: MineBase, view: MineView): MineModel {
  const { closureYear, vamConc, drainedMm3PerYr, drainedUse, discountRate, gwp, grantShare, creditingYears } = view;

  const input = useMemo<MineInput>(() => {
    const next: MineInput = {
      ...base.input,
      closureYear,
      vamConc,
      techOverride: { ...base.input.techOverride, drained: drainedUse, amm: drainedUse },
    };
    if (drainedMm3PerYr !== null) next.drainedMm3PerYr = drainedMm3PerYr;
    // Same order as the Compare page, so the two pages agree: an uploaded series wins over the slider.
    return applyUploadedSeries(next, base.overrides);
  }, [base.input, base.overrides, closureYear, vamConc, drainedMm3PerYr, drainedUse]);

  const settingsAtAnyPrice = useMemo<Settings>(
    () => ({ ...base.settings, discountRate, gwp, grantShare, creditingYears }),
    [base.settings, discountRate, gwp, grantShare, creditingYears],
  );

  const settings = useMemo<Settings>(
    () => ({ ...settingsAtAnyPrice, creditPriceUsdPerT: view.priceUsdPerT }),
    [settingsAtAnyPrice, view.priceUsdPerT],
  );

  const { tech, constants, costs } = base;
  const result = useMemo(
    () => evaluate(input, settings, tech, constants, costs),
    [input, settings, tech, constants, costs],
  );

  const npvCurve = useMemo(
    () =>
      CURVE_PRICES_USD_PER_T.map((p) => ({
        priceUsdPerT: p,
        npvUsd: evaluate(input, { ...settingsAtAnyPrice, creditPriceUsdPerT: p }, tech, constants, costs).npvUsd,
      })),
    [input, settingsAtAnyPrice, tech, constants, costs],
  );

  // Structure E is a grant, so it takes the grant control's share (Step 8: "for E, links the grant control").
  const finance = useMemo(
    () => financing(input, settings, tech, constants, { ...base.finance, grantShare }, costs),
    [input, settings, tech, constants, base.finance, grantShare, costs],
  );

  // The break-even does not depend on the price, so these stay put while the price moves.
  const breakdown = useMemo(
    () => ({
      waterfall: waterfall(input, settingsAtAnyPrice, tech, constants, costs),
      tornado: tornado(input, settingsAtAnyPrice, tech, constants, TORNADO_DEFAULTS, costs),
      explanation: explain(input, settingsAtAnyPrice, tech, constants, costs),
    }),
    [input, settingsAtAnyPrice, tech, constants, costs],
  );

  return { input, settings, result, npvCurve, finance, ...breakdown };
}

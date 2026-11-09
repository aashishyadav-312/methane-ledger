import { useMemo } from 'react';
import {
  evaluate,
  selectTech,
  type Constants,
  type MineInput,
  type Result,
  type Settings,
  type TechLibrary,
} from '../../model';
import { explain, type Explanation } from '../../model/explain';
import { FIN_DEFAULTS, financing, type FinancingResult } from '../../model/financing';
import { tornado, type TornadoResult } from '../../model/tornado';
import { waterfall, type Waterfall } from '../../model/waterfall';
import { getConstants, getSettings, getTech, getTimeline, unwrapMine } from '../../data/load';
import type { MineRecord } from '../../data/schemas';
import { applyOverrides, type Overrides } from '../../state/session';
import { applyUploadedSeries } from '../DataPage/upload';
import { CUSTOM_BASIS, type DrainedUse, type MineView } from '../../state/url';
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
  settings: Settings;
  tech: TechLibrary;
  constants: Constants;
  /** `now` first, then the record's closure alternatives. Empty when the record has none. */
  bases: ClosureBasis[];
  defaults: MineView;
}

function defaultUse(input: MineInput, tech: TechLibrary): DrainedUse {
  const choice = selectTech('drained', input.drainedConc, input.powerOfftake, tech, input.techOverride?.drained);
  return choice.tech === 'flare' ? 'flare' : 'power';
}

/** The fixed inputs and the default view for a mine. */
export function mineBase(record: MineRecord, overrides: Overrides): MineBase {
  const settings = applyOverrides(getSettings(), overrides, 'settings');
  const tech = applyOverrides(getTech(), overrides, 'tech');
  const constants = applyOverrides(getConstants(), overrides, 'constants');
  const plain = applyOverrides(unwrapMine(record, getTimeline()), overrides, `mine.${record.id}`);
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
  return { record, input, hasUploadedSeries: input !== plain, overrides, settings, tech, constants, bases, defaults };
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

  const result = useMemo(
    () => evaluate(input, settings, base.tech, base.constants),
    [input, settings, base.tech, base.constants],
  );

  const npvCurve = useMemo(
    () =>
      CURVE_PRICES_USD_PER_T.map((p) => ({
        priceUsdPerT: p,
        npvUsd: evaluate(input, { ...settingsAtAnyPrice, creditPriceUsdPerT: p }, base.tech, base.constants).npvUsd,
      })),
    [input, settingsAtAnyPrice, base.tech, base.constants],
  );

  // Structure E is a grant, so it takes the grant control's share (Step 8: "for E, links the grant control").
  const finance = useMemo(
    () => financing(input, settings, base.tech, base.constants, { ...FIN_DEFAULTS, grantShare }),
    [input, settings, base.tech, base.constants, grantShare],
  );

  // The break-even does not depend on the price, so these stay put while the price moves.
  const breakdown = useMemo(
    () => ({
      waterfall: waterfall(input, settingsAtAnyPrice, base.tech, base.constants),
      tornado: tornado(input, settingsAtAnyPrice, base.tech, base.constants),
      explanation: explain(input, settingsAtAnyPrice, base.tech, base.constants),
    }),
    [input, settingsAtAnyPrice, base.tech, base.constants],
  );

  return { input, settings, result, npvCurve, finance, ...breakdown };
}

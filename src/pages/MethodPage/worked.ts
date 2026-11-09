// The worked example on the Method page: Moonidih on the default inputs, run through `evaluate` once.
// Every number in the page copy comes from here, from the data files, or from the model constants.

import { getConstants, getCosts, getMapData, getMineInput, getPrices, getSettings, getTech, getTimeline } from '../../data/load';
import {
  COST_CATEGORIES,
  evaluate,
  EXPLOSIVE_RANGE_CONC,
  OPEX_TYPES,
  THOUSAND_M3_PER_MM3,
  type CostCategory,
  type CostParams,
  type MineInput,
  type OpexType,
  type Result,
  type StreamResult,
} from '../../model';
import { explain, type Explanation } from '../../model/explain';

export const MINE_ID = 'bccl-moonidih';

/** A share written the short way: 0.3 is "30%", 0.002 is "0.2%". */
export function shareText(x: number): string {
  return `${Number((x * 100).toPrecision(6))}%`;
}

/** A plain number with up to `digits` decimals and thousands separators: `num(0.39, 2)` is "0.39". */
export function num(x: number, digits = 2): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Whole US dollars: `$80,000`. Negative amounts use the true minus sign. */
export function usdWhole(x: number): string {
  const text = `$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
  return x < 0 ? `−${text}` : text;
}

export interface WorkedCase {
  mine: MineInput;
  /** The case at the workbook closure year, and at the FY2026-27 target year (`null` if the mine has none). */
  result: Result;
  targetClosureYear: number | null;
  targetBreakevenUsdPerT: number | null;
  /** The same case with destruction of the drained gas made mandatory. */
  mandatedBreakevenUsdPerT: number | null;
  explanation: Explanation;
  creditingYears: number;
  discountRate: number;
  gwp: number;
  brokerShare: number;
  issuanceFeeUsdPerT: number;
  validationCostUsd: number;
  verificationCostUsdPerYr: number;
  contingency: number;
  powerPriceUsdPerMwh: number;
  priceUsdPerT: number;
  /** Year-1 drained gas, step by step. */
  drained: {
    stream: StreamResult;
    ch4Mm3: number;
    captureEff: number;
    tonnesPerMm3: number;
    destructionEff: number;
    co2PerCh4: number;
    netTco2ePerTCh4: number;
    erTco2e: number;
  };
  thresholds: {
    powerMinConc: number;
    flareMinConc: number;
    rtoMinConc: number;
    explosiveLower: number;
    explosiveUpper: number;
  };
  /** Mines on the map by band, for "positions are approximate". */
  operatingMines: number;
  mapNote: string;
  /** The closure workbook row for the mine, for "how closure years were estimated". */
  workbook: {
    reserve2024Mt: number | null;
    rateMtPerYr: number | null;
    yearsLeft: number | null;
    runoutYear: number | null;
    targetFy2627Mt: number | null;
    yearAtTarget: number | null;
  };
  benchmarkLabels: string[];
  /** The cost build-up for the example (Appendix G): parameters, capex by category and year-1 opex by type. */
  costs: {
    params: CostParams;
    usdToInr: number;
    capexUsd: number;
    capexByCategoryUsd: Record<CostCategory, number>;
    year1OpexByTypeUsd: Record<OpexType, number>;
    lastYearDecommissioningUsd: number;
  };
}

let cached: WorkedCase | null = null;

export function workedCase(): WorkedCase {
  if (cached) return cached;
  const settings = getSettings();
  const costParams = getCosts();
  const tech = getTech();
  const constants = getConstants();
  const mine = getMineInput(MINE_ID);
  if (!mine) throw new Error(`data/mines.json has no mine "${MINE_ID}"`);

  const result = evaluate(mine, settings, tech, constants, costParams);
  const explanation = explain(mine, settings, tech, constants, costParams);

  const target = getMineInput(MINE_ID, { closureYear: workbookTargetYear() ?? mine.closureYear });
  const targetYear = workbookTargetYear();
  const targetResult = target && targetYear !== null ? evaluate(target, settings, tech, constants, costParams) : null;

  const mandated = evaluate(
    { ...mine, destructionMandated: { ...mine.destructionMandated, drained: true } },
    settings,
    tech,
    constants,
    costParams,
  );

  const drainedStream = result.streams.find((s) => s.kind === 'drained');
  if (!drainedStream || drainedStream.tech === null) throw new Error('The Moonidih example needs a drained gas stream');
  const year1 = result.years[0].byStream.drained;
  const timeline = getTimeline()[MINE_ID];
  const map = getMapData();

  const breakdown = result.costs;
  if (!breakdown) throw new Error('The Moonidih example needs the cost build-up (settings.costModel "buildup")');
  const year1OpexByTypeUsd = Object.fromEntries(OPEX_TYPES.map((t) => [t, breakdown.opexByType[t][0]])) as Record<
    OpexType,
    number
  >;

  cached = {
    mine,
    result,
    targetClosureYear: targetYear,
    targetBreakevenUsdPerT: targetResult?.breakevenUsdPerT ?? null,
    mandatedBreakevenUsdPerT: mandated.breakevenUsdPerT,
    explanation,
    creditingYears: settings.creditingYears,
    discountRate: settings.discountRate,
    gwp: settings.gwp,
    brokerShare: settings.brokerShare,
    issuanceFeeUsdPerT: settings.issuanceFeeUsdPerT,
    validationCostUsd: settings.validationCostUsd,
    verificationCostUsdPerYr: settings.verificationCostUsdPerYr,
    contingency: settings.contingency,
    powerPriceUsdPerMwh: settings.powerPriceUsdPerMwh,
    priceUsdPerT: settings.creditPriceUsdPerT,
    drained: {
      stream: drainedStream,
      ch4Mm3: year1.ch4Mm3,
      captureEff: mine.captureEff.drained,
      tonnesPerMm3: constants.rhoTPerThousandM3 * THOUSAND_M3_PER_MM3,
      destructionEff: tech[drainedStream.tech].destructionEff,
      co2PerCh4: constants.co2PerCh4,
      netTco2ePerTCh4: settings.gwp - constants.co2PerCh4,
      erTco2e: year1.erTco2e,
    },
    thresholds: {
      powerMinConc: tech.power.minConc,
      flareMinConc: tech.flare.minConc,
      rtoMinConc: tech.rto.minConc,
      explosiveLower: EXPLOSIVE_RANGE_CONC.lower,
      explosiveUpper: EXPLOSIVE_RANGE_CONC.upper,
    },
    operatingMines: map.bands.by2031 + map.bands.by2036 + map.bands.by2050 + map.bands.after2050 + map.bands.nodate,
    mapNote: map.note,
    workbook: {
      reserve2024Mt: timeline?.reserve2024Mt ?? null,
      rateMtPerYr: timeline?.rateUsedMtPerYr ?? null,
      yearsLeft: timeline?.yearsLeft ?? null,
      runoutYear: timeline?.runoutYear ?? null,
      targetFy2627Mt: timeline?.targetFy2627Mt ?? null,
      yearAtTarget: timeline?.yearAtTarget ?? null,
    },
    costs: {
      params: costParams,
      usdToInr: settings.usdToInr,
      capexUsd: result.capexUsd,
      capexByCategoryUsd: Object.fromEntries(COST_CATEGORIES.map((c) => [c, breakdown.capexByCategory[c]])) as Record<
        CostCategory,
        number
      >,
      year1OpexByTypeUsd,
      lastYearDecommissioningUsd: breakdown.opexByType.decommissioning[breakdown.opexByType.decommissioning.length - 1],
    },
    benchmarkLabels: getPrices()
      .filter((p) => p.badge?.kind === 'benchmark')
      .map((p) => p.label),
  };
  return cached;
}

function workbookTargetYear(): number | null {
  return getTimeline()[MINE_ID]?.yearAtTarget ?? null;
}

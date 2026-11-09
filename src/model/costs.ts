import type {
  Constants,
  CostBreakdown,
  CostCategory,
  CostItem,
  CostParams,
  OpexType,
  Settings,
  StreamInput,
  TechLibrary,
} from './types';
import type { StreamCashflow, StreamYear } from './cashflow';
import { KWH_PER_MWH } from './constants';
import { erTco2ePerTDestroyed, massTFromMm3 } from './physics';
import { airflowM3sFromMm3, powerMwhFromT, sizeStream } from './technology';
import type { ProjectComponents } from './finance';

/**
 * Cost build-up (PLAN_V1 Appendix G; mirrors `flows_buildup` in reference/ref_v1_1.py).
 * Replaces v1's all-in unit costs with equipment, materials, installation labour and civil works, Indian cost
 * factors, owner's costs, grid connection, staff, insurance, engine overhauls and decommissioning.
 * Two v1 quirks are kept on purpose: flare and oxidiser O&M are a share of the whole stream capex including
 * drainage, and drainage O&M uses the base cost with no contingency.
 */

export const COST_CATEGORIES = ['equipment', 'materials', 'labour', 'civil'] as const satisfies readonly CostCategory[];
export const OPEX_TYPES = [
  'om',
  'overhaul',
  'staff',
  'insurance',
  'fan_power',
  'decommissioning',
] as const satisfies readonly OpexType[];

type CapexRow = CostBreakdown['capexItems'][number];
type SplitKey = 'power' | 'flare' | 'rto' | 'drainage';

const emptyOpex = (n: number): Record<OpexType, number[]> =>
  Object.fromEntries(OPEX_TYPES.map((t) => [t, new Array<number>(n).fill(0)])) as Record<OpexType, number[]>;

/**
 * Multiplier on an item's base cost for each category, before owner's costs and contingency:
 * equipment e x (m x (1 + importMarkup) + (1 - m)), materials, labour x localFactor, civil x localFactor.
 * Here e is the equipment share and m the imported share of the equipment.
 */
export function categoryFactors(costs: CostParams, key: SplitKey): Record<CostCategory, number> {
  const [equipment, materials, labour, civil] = costs.split[key];
  const m = costs.imported[key];
  return {
    equipment: equipment * (m * (1 + costs.importMarkup) + (1 - m)),
    materials,
    labour: labour * costs.localFactor,
    civil: civil * costs.localFactor,
  };
}

/** Staff cost per person-year in USD: rupees divided by the rate (0 when the rate is 0). */
export function staffUsdPerPersonYear(costs: CostParams, settings: Settings): number {
  return settings.usdToInr > 0 ? costs.staffCostInr / settings.usdToInr : 0;
}

interface StreamBuildup {
  capexRows: CapexRow[];
  capexUsd: number;
  rows: StreamYear[];
  opexByType: Record<OpexType, number[]>;
  makesPower: boolean;
}

function streamBuildup(
  stream: StreamInput,
  settings: Settings,
  lib: TechLibrary,
  constants: Constants,
  costs: CostParams,
  years: number,
): StreamBuildup {
  const opexByType = emptyOpex(years);
  if (stream.status !== 'ok' || stream.tech === null) {
    return {
      capexRows: [],
      capexUsd: 0,
      rows: stream.ch4Mm3ByYear.map(() => ({ ch4CapturedT: 0, erTco2e: 0, energyRevUsd: 0, opexUsd: 0 })),
      opexByType,
      makesPower: false,
    };
  }
  const tech = stream.tech;
  const size = sizeStream(stream, settings, lib, constants);
  const maxMm3 = Math.max(...stream.ch4Mm3ByYear);

  // Base cost of each item: the v1 formula, with no contingency.
  const base: { item: SplitKey; usd: number }[] = [];
  if (tech === 'power') base.push({ item: 'power', usd: size.powerKw * lib.power.capexUsdPerKw });
  else if (tech === 'flare') base.push({ item: 'flare', usd: size.capMm3PerYr * lib.flare.capexUsdPerMm3Yr });
  else base.push({ item: 'rto', usd: size.airflowM3s * lib.rto.capexUsdPerM3s });
  if (stream.needsDrainageCapex) {
    base.push({ item: 'drainage', usd: size.capMm3PerYr * lib.drainage.capexUsdPerMm3Yr });
  }

  const capexRows: CapexRow[] = [];
  let capexUsd = 0;
  for (const { item, usd } of base) {
    const factors = categoryFactors(costs, item);
    for (const category of COST_CATEGORIES) {
      const value = usd * factors[category] * (1 + costs.ownersCost) * (1 + settings.contingency);
      capexRows.push({ stream: stream.kind, item, category, usd: value });
      capexUsd += value;
    }
  }

  const staffUsd = staffUsdPerPersonYear(costs, settings);
  const destructionEff = lib[tech].destructionEff;
  const erPerT = erTco2ePerTDestroyed(settings.gwp, constants);
  const drainageOmUsd = stream.needsDrainageCapex
    ? maxMm3 * lib.drainage.capexUsdPerMm3Yr * costs.nonlabourOm.drainageFrac
    : 0;

  const rows = stream.ch4Mm3ByYear.slice(0, years).map((vMm3, i): StreamYear => {
    const capturedMm3 = vMm3 * stream.captureEff;
    const ch4CapturedT = massTFromMm3(capturedMm3, constants);
    const erTco2e = stream.destructionMandated ? 0 : ch4CapturedT * destructionEff * erPerT;
    const running = vMm3 > 0;
    let energyRevUsd = 0;
    if (tech === 'power') {
      const mwh = powerMwhFromT(ch4CapturedT, lib, constants);
      energyRevUsd = mwh * settings.powerPriceUsdPerMwh;
      opexByType.om[i] += mwh * costs.nonlabourOm.powerPerMwh;
      if (size.powerKw > 0 && costs.overhaulHours > 0) {
        opexByType.overhaul[i] += (costs.overhaulUsdPerKw * mwh * 1000) / costs.overhaulHours;
      }
    } else if (tech === 'flare') {
      opexByType.om[i] += capexUsd * costs.nonlabourOm.flareFrac;
    } else {
      opexByType.om[i] += capexUsd * costs.nonlabourOm.rtoFrac;
      const airflowM3s =
        stream.airflowM3s !== undefined
          ? (stream.airflowM3s * vMm3) / maxMm3
          : airflowM3sFromMm3(capturedMm3, stream.concFraction);
      opexByType.fan_power[i] += ((airflowM3s * lib.rto.fanKwhPerM3sYr) / KWH_PER_MWH) * settings.powerPriceUsdPerMwh;
    }
    if (stream.needsDrainageCapex) {
      opexByType.om[i] += drainageOmUsd; // every year of the window, as in v1
      if (running) opexByType.staff[i] += costs.headcount.drainage * staffUsd;
    }
    if (running) opexByType.staff[i] += costs.headcount[tech] * staffUsd;
    const opexUsd = opexByType.om[i] + opexByType.overhaul[i] + opexByType.staff[i] + opexByType.fan_power[i];
    return { ch4CapturedT, erTco2e, energyRevUsd, opexUsd };
  });
  return { capexRows, capexUsd, rows, opexByType, makesPower: tech === 'power' };
}

export interface BuildupFlows {
  components: ProjectComponents;
  cashflows: StreamCashflow[];
}

/**
 * Project flows on the cost build-up. Stream rows carry the direct costs of the stream (O&M, overhauls, staff, fan
 * power). Insurance, decommissioning and the monitoring staff belong to the project and appear only in the
 * components, because they depend on total capex.
 */
export function buildupFlows(
  streams: StreamInput[],
  settings: Settings,
  lib: TechLibrary,
  constants: Constants,
  costs: CostParams,
): BuildupFlows {
  const n = settings.creditingYears;
  const per = streams.map((s) => streamBuildup(s, settings, lib, constants, costs, n));
  const opexByType = emptyOpex(n);
  const erTco2e = new Array<number>(n).fill(0);
  const energyRevUsd = new Array<number>(n).fill(0);
  const capexItems: CapexRow[] = [];
  per.forEach((p) => {
    capexItems.push(...p.capexRows);
    for (let i = 0; i < n; i++) {
      erTco2e[i] += p.rows[i].erTco2e;
      energyRevUsd[i] += p.rows[i].energyRevUsd;
      for (const t of OPEX_TYPES) opexByType[t][i] += p.opexByType[t][i];
    }
  });
  if (per.some((p) => p.makesPower) && costs.gridConnectionUsd > 0) {
    capexItems.push({ stream: 'site', item: 'grid_connection', category: 'civil', usd: costs.gridConnectionUsd });
  }
  capexItems.push({ stream: 'site', item: 'monitoring', category: 'equipment', usd: lib.monitoring.capexUsd });

  const capexUsd = capexItems.reduce((sum, r) => sum + r.usd, 0) * (1 - settings.grantShare);
  const staffUsd = staffUsdPerPersonYear(costs, settings);
  for (let i = 0; i < n; i++) {
    opexByType.staff[i] += costs.headcount.monitoring * staffUsd;
    opexByType.insurance[i] += costs.insurance * capexUsd;
  }
  opexByType.decommissioning[n - 1] += costs.decommissioning * capexUsd;

  const opexUsd = Array.from({ length: n }, (_, i) => OPEX_TYPES.reduce((sum, t) => sum + opexByType[t][i], 0));
  const mrvUsd = Array.from(
    { length: n },
    (_, i) => settings.verificationCostUsdPerYr + (i === 0 ? settings.validationCostUsd : 0),
  );
  const capexByCategory = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, capexItems.filter((r) => r.category === c).reduce((sum, r) => sum + r.usd, 0)]),
  ) as Record<CostCategory, number>;

  return {
    components: {
      capexUsd,
      erTco2e,
      energyRevUsd,
      opexUsd,
      mrvUsd,
      costs: { capexItems, capexByCategory, opexByType },
    },
    cashflows: per.map((p) => ({ capexUsd: p.capexUsd, rows: p.rows })),
  };
}

/** Capex by item, summed over categories and streams (for example `power` or `grid_connection`). */
export function capexByItem(costs: CostBreakdown): Partial<Record<CostItem, number>> {
  const out: Partial<Record<CostItem, number>> = {};
  for (const r of costs.capexItems) out[r.item] = (out[r.item] ?? 0) + r.usd;
  return out;
}

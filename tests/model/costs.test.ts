import { describe, expect, test } from 'vitest';
import {
  CONSTANTS,
  OPEX_TYPES,
  capexByItem,
  evaluate,
  type CostCategory,
  type CostParams,
  type MineInput,
  type Result,
  type Settings,
} from '../../src/model';
import { explain } from '../../src/model/explain';
import { financing } from '../../src/model/financing';
import { tornado } from '../../src/model/tornado';
import { waterfall } from '../../src/model/waterfall';
import { MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_SETTINGS, REFERENCE_TECH } from '../../src/model/fixtures';
import { getCosts } from '../../src/data/load';
import { expectGolden, settingsWith } from './helpers';
import golden from '../golden/costs_v1_1.json';
import moonidihV1 from '../golden/moonidih_v1.json';
import moonidihWb2034 from '../golden/moonidih_wb2034.json';

type GoldenParams = typeof golden.params_default;
interface GoldenCase {
  capex: number;
  capex_by_category: Record<string, number>;
  capex_by_item: Record<string, number>;
  opex_year1_by_type: Record<string, number>;
  opex_year1: number;
  opex_total: number;
  breakeven: number;
  npv_at_15: number;
  irr_at_15: number;
  payback_index: number;
  er_total: number;
  cash: number[];
}

/** Golden parameters (snake_case, from reference/ref_v1_1.py) as the TypeScript `CostParams`. */
function toCostParams(g: GoldenParams): CostParams {
  return {
    localFactor: g.local_factor,
    importMarkup: g.import_markup,
    ownersCost: g.owners_cost,
    gridConnectionUsd: g.grid_connection_usd,
    decommissioning: g.decommissioning,
    insurance: g.insurance,
    staffCostInr: g.staff_cost_inr,
    headcount: { ...g.headcount },
    split: {
      power: g.split.power as [number, number, number, number],
      flare: g.split.flare as [number, number, number, number],
      rto: g.split.rto as [number, number, number, number],
      drainage: g.split.drainage as [number, number, number, number],
    },
    imported: { ...g.imported },
    nonlabourOm: {
      powerPerMwh: g.nonlabour_om.power_per_mwh,
      flareFrac: g.nonlabour_om.flare_frac,
      rtoFrac: g.nonlabour_om.rto_frac,
      drainageFrac: g.nonlabour_om.drainage_frac,
    },
    overhaulUsdPerKw: g.overhaul_usd_per_kw,
    overhaulHours: g.overhaul_hours,
  };
}

const DEFAULT = toCostParams(golden.params_default);
const NEUTRAL = toCostParams(golden.params_neutral);
const FLARE: MineInput = { ...MOONIDIH_V1, techOverride: { drained: 'flare', amm: 'flare' } };

const buildup = (patch: Partial<Settings> = {}): Settings => settingsWith({ costModel: 'buildup', usdToInr: 95, ...patch });
const run = (mine: MineInput, costs: CostParams = DEFAULT, patch: Partial<Settings> = {}): Result =>
  evaluate(mine, buildup(patch), REFERENCE_TECH, CONSTANTS, costs);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Every number of one golden case, checked with Step 2's tolerances. */
function checkCase(r: Result, g: GoldenCase, label: string, grantShare = 0) {
  expectGolden(r.breakevenUsdPerT, g.breakeven, 'usdPerT', `${label} break-even`);
  expectGolden(r.capexUsd, g.capex, 'usd', `${label} capex`);
  expectGolden(r.npvUsd, g.npv_at_15, 'usd', `${label} NPV`);
  expectGolden(r.irr, g.irr_at_15, 'irr', `${label} IRR`);
  expectGolden(r.paybackIndex, g.payback_index, 'index', `${label} payback`);
  expectGolden(r.erTotalTco2e, g.er_total, 'tco2e', `${label} reductions`);
  expectGolden(r.years[0].opexUsd, g.opex_year1, 'usd', `${label} year-1 opex`);
  const costs = r.costs;
  if (costs === undefined) throw new Error(`${label} has no cost breakdown`);
  for (const type of OPEX_TYPES) {
    expectGolden(costs.opexByType[type][0], g.opex_year1_by_type[type], 'usd', `${label} year-1 ${type}`);
  }
  expectGolden(sum(r.years.map((y) => y.opexUsd)), g.opex_total, 'usd', `${label} total opex`);
  // The reference reports capex before the grant, so compare the items scaled back up by it.
  const gross = 1 / (1 - grantShare);
  for (const [category, usd] of Object.entries(g.capex_by_category)) {
    expectGolden(
      costs.capexByCategory[category as CostCategory],
      usd,
      'usd',
      `${label} capex ${category}`,
    );
  }
  const byItem = capexByItem(costs);
  for (const [item, usd] of Object.entries(g.capex_by_item)) {
    expectGolden(byItem[item as keyof typeof byItem] ?? 0, usd, 'usd', `${label} capex ${item}`);
  }
  expect(r.capexUsd * gross).toBeCloseTo(sum(costs.capexItems.map((i) => i.usd)), 6);
  g.cash.forEach((c, i) => expectGolden(r.cashUsd[i], c, 'usd', `${label} cash[${i}]`));
}

describe('cost build-up reproduces reference/ref_v1_1.py (tests/golden/costs_v1_1.json)', () => {
  test('data/costs.json holds the golden default parameters', () => {
    expect(getCosts()).toEqual(DEFAULT);
  });

  test.each([
    ['closure 2030', MOONIDIH_V1, DEFAULT, {}, golden.moonidih_2030_default],
    ['closure 2034', MOONIDIH_WB2034, DEFAULT, {}, golden.moonidih_2034_default],
    ['2030, 85 rupees per dollar', MOONIDIH_V1, DEFAULT, { usdToInr: 85 }, golden.moonidih_2030_fx85],
    ['2030, local factor 1.0', MOONIDIH_V1, { ...DEFAULT, localFactor: 1 }, {}, golden.moonidih_2030_local_factor_1],
    ['2030, no import markup', MOONIDIH_V1, { ...DEFAULT, importMarkup: 0 }, {}, golden.moonidih_2030_no_import_markup],
    ['2030, staff cost x2', MOONIDIH_V1, { ...DEFAULT, staffCostInr: 1_800_000 }, {}, golden.moonidih_2030_staff_x2],
    ['2030, flare instead of engines', FLARE, DEFAULT, {}, golden.moonidih_2030_flare_default],
  ] as const)('%s', (label, mine, costs, patch, expected) => {
    checkCase(run(mine, costs, patch), expected, label);
  });

  test('2030 with a 30% grant', () => {
    checkCase(run(MOONIDIH_V1, DEFAULT, { grantShare: 0.3 }), golden.moonidih_2030_default_grant30, 'grant 30%', 0.3);
  });

  test('the headline numbers from Appendix G', () => {
    expect(run(MOONIDIH_V1).breakevenUsdPerT).toBeCloseTo(11.54, 2);
    expect(run(MOONIDIH_WB2034).breakevenUsdPerT).toBeCloseTo(3.37, 2);
    expect(run(MOONIDIH_V1, DEFAULT, { grantShare: 0.3 }).breakevenUsdPerT).toBeCloseTo(4.94, 2);
    expect(run(MOONIDIH_V1).capexUsd / 1e6).toBeCloseTo(26.39, 2);
  });
});

describe('neutral parameters give the v1 goldens', () => {
  const v1 = (g: Record<string, number | null>, r: Result, label: string) => {
    expectGolden(r.breakevenUsdPerT, g.breakeven as number, 'usdPerT', `${label} break-even`);
    expectGolden(r.capexUsd, g.capex as number, 'usd', `${label} capex`);
    expectGolden(r.npvUsd, g.npv_at_15 as number, 'usd', `${label} NPV`);
    expectGolden(r.irr, g.irr_at_15 as number | null, 'irr', `${label} IRR`);
  };

  test('closure 2030', () => {
    v1(moonidihV1 as unknown as Record<string, number | null>, run(MOONIDIH_V1, NEUTRAL), '2030');
  });

  test('closure 2034', () => {
    v1(moonidihWb2034 as unknown as Record<string, number | null>, run(MOONIDIH_WB2034, NEUTRAL), '2034');
  });

  test('every year of cash flow matches the v1 model', () => {
    for (const mine of [MOONIDIH_V1, MOONIDIH_WB2034, FLARE]) {
      const a = evaluate(mine, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS);
      const b = run(mine, NEUTRAL);
      expect(b.breakevenUsdPerT).toBeCloseTo(a.breakevenUsdPerT as number, 8);
      a.cashUsd.forEach((c, i) => expect(b.cashUsd[i]).toBeCloseTo(c, 4));
    }
  });
});

describe('the cost model switch', () => {
  test('a missing costModel is v1, and v1 carries no cost breakdown', () => {
    const { costModel: _ignored, ...bare } = REFERENCE_SETTINGS;
    void _ignored;
    const r = evaluate(MOONIDIH_V1, bare, REFERENCE_TECH, CONSTANTS);
    expect(r.costs).toBeUndefined();
    expect(r.breakevenUsdPerT).toBeCloseTo(
      evaluate(MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS).breakevenUsdPerT as number,
      12,
    );
  });

  test('the build-up without cost parameters is an error, not a silent v1 result', () => {
    expect(() => evaluate(MOONIDIH_V1, buildup(), REFERENCE_TECH, CONSTANTS)).toThrow(/cost parameters/);
  });

  test('costs are ignored on v1', () => {
    const a = evaluate(MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS, DEFAULT);
    expect(a.costs).toBeUndefined();
    expect(a.capexUsd).toBeCloseTo(
      evaluate(MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS).capexUsd,
      6,
    );
  });
});

describe('the parts add up', () => {
  test.each([
    ['2030', MOONIDIH_V1, {}],
    ['2034', MOONIDIH_WB2034, {}],
    ['flare', FLARE, {}],
    ['grant 30%', MOONIDIH_V1, { grantShare: 0.3 }],
  ] as const)('%s: capex categories sum to total capex, opex types to total opex', (_label, mine, patch) => {
    const r = run(mine, DEFAULT, patch);
    const c = r.costs!;
    const grant = (patch as Partial<Settings>).grantShare ?? 0;
    expect(Math.abs(sum(Object.values(c.capexByCategory)) * (1 - grant) - r.capexUsd)).toBeLessThan(1);
    r.years.forEach((y, i) => {
      const byType = sum(OPEX_TYPES.map((t) => c.opexByType[t][i]));
      expect(Math.abs(byType - y.opexUsd)).toBeLessThan(1);
    });
  });

  test('the waterfall parts sum to the break-even, and the opex parts to the opex part', () => {
    const w = waterfall(MOONIDIH_V1, buildup(), REFERENCE_TECH, CONSTANTS, DEFAULT)!;
    const r = run(MOONIDIH_V1);
    expect(w.totalUsdPerT).toBeCloseTo(r.breakevenUsdPerT as number, 9);
    expect(sum(Object.values(w.opexPartsUsdPerT!))).toBeCloseTo(w.opexUsdPerT, 9);
    expect(Object.keys(w.opexPartsUsdPerT!).sort()).toEqual([...OPEX_TYPES].sort());
  });

  test('on v1 the waterfall has no opex parts', () => {
    expect(waterfall(MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH, CONSTANTS)!.opexPartsUsdPerT).toBeUndefined();
  });

  test('explain agrees with evaluate on the build-up', () => {
    const e = explain(MOONIDIH_V1, buildup(), REFERENCE_TECH, CONSTANTS, DEFAULT);
    expect(e.breakevenUsdPerT).toBeCloseTo(run(MOONIDIH_V1).breakevenUsdPerT as number, 9);
  });

  test('the tornado base case is the build-up break-even', () => {
    const t = tornado(MOONIDIH_V1, buildup(), REFERENCE_TECH, CONSTANTS, undefined, DEFAULT);
    expect(t.baseUsdPerT).toBeCloseTo(run(MOONIDIH_V1).breakevenUsdPerT as number, 9);
  });

  test('financing structure A uses the build-up, and a grant also shrinks insurance', () => {
    const f = financing(MOONIDIH_V1, buildup(), REFERENCE_TECH, CONSTANTS, undefined, DEFAULT);
    expect(f.A.breakevenUsdPerT).toBeCloseTo(run(MOONIDIH_V1).breakevenUsdPerT as number, 9);
    // Structure E (30% grant) must match a full run with that grant, insurance and decommissioning included.
    expect(f.E.breakevenUsdPerT).toBeCloseTo(
      run(MOONIDIH_V1, DEFAULT, { grantShare: 0.3 }).breakevenUsdPerT as number,
      9,
    );
  });
});

describe('the parameters move the results the right way', () => {
  test('a higher rupee rate lowers staff cost in USD', () => {
    const lo = run(MOONIDIH_V1, DEFAULT, { usdToInr: 85 }).costs!.opexByType.staff[0];
    const hi = run(MOONIDIH_V1, DEFAULT, { usdToInr: 105 }).costs!.opexByType.staff[0];
    expect(hi).toBeLessThan(lo);
    expect(hi * 105).toBeCloseTo(lo * 85, 6);
  });

  test('a higher local factor raises capex', () => {
    const lo = run(MOONIDIH_V1, { ...DEFAULT, localFactor: 0.5 }).capexUsd;
    const hi = run(MOONIDIH_V1, { ...DEFAULT, localFactor: 0.9 }).capexUsd;
    expect(hi).toBeGreaterThan(lo);
  });

  test('a higher import markup raises equipment capex only', () => {
    const a = run(MOONIDIH_V1, DEFAULT).costs!.capexByCategory;
    const b = run(MOONIDIH_V1, { ...DEFAULT, importMarkup: 0.3 }).costs!.capexByCategory;
    expect(b.equipment).toBeGreaterThan(a.equipment);
    expect(b.materials).toBeCloseTo(a.materials, 6);
    expect(b.labour).toBeCloseTo(a.labour, 6);
    expect(b.civil).toBeCloseTo(a.civil, 6);
  });

  test('grid connection is charged only when a stream makes power', () => {
    const withPower = capexByItem(run(MOONIDIH_V1).costs!);
    const flareOnly = capexByItem(run(FLARE).costs!);
    expect(withPower.grid_connection).toBe(DEFAULT.gridConnectionUsd);
    expect(flareOnly.grid_connection).toBeUndefined();
  });

  test('decommissioning falls in the last year only, and insurance in every year', () => {
    const c = run(MOONIDIH_V1).costs!;
    expect(c.opexByType.decommissioning.slice(0, -1).every((x) => x === 0)).toBe(true);
    expect(c.opexByType.decommissioning.at(-1)).toBeGreaterThan(0);
    expect(c.opexByType.insurance.every((x) => x > 0)).toBe(true);
  });

  test('drainage opex runs after closure, but staff stop when the stream stops', () => {
    const c = run(MOONIDIH_V1).costs!;
    const last = c.opexByType.staff.at(-1)!;
    // After closure the engines run on AMM, so staff continue only for the AMM stream and monitoring.
    expect(last).toBeLessThan(c.opexByType.staff[0]);
  });

  test('overhauls follow the energy generated', () => {
    const c = run(MOONIDIH_V1).costs!;
    expect(c.opexByType.overhaul[0]).toBeGreaterThan(0);
    expect(run(FLARE).costs!.opexByType.overhaul.every((x) => x === 0)).toBe(true);
  });
});

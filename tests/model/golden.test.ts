import { describe, expect, test } from 'vitest';
import {
  CONSTANTS,
  erTco2ePerTDestroyed,
  massTFromMm3,
  pv,
  type MineInput,
  type Result,
  type StreamKind,
} from '../../src/model';
import { ARCHETYPES, MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_SETTINGS } from '../../src/model/fixtures';
import { expectGolden, run, type Unit } from './helpers';

import moonidihV1 from '../golden/moonidih_v1.json';
import moonidihWb2034 from '../golden/moonidih_wb2034.json';
import sensitivitiesV1 from '../golden/sensitivities_v1.json';
import archetypesV1 from '../golden/archetypes_v1.json';
import physicsV1 from '../golden/physics_v1.json';

type Json = Record<string, unknown>;
const GOLDENS: Record<string, unknown> = {
  moonidih_v1: moonidihV1,
  moonidih_wb2034: moonidihWb2034,
  sensitivities_v1: sensitivitiesV1,
  archetypes_v1: archetypesV1,
  physics_v1: physicsV1,
};
const load = (name: string): Json => GOLDENS[name] as Json;

/** Unit of each scalar key the goldens use. An unknown key fails the test, so no number goes unchecked. */
const UNIT: Record<string, Unit> = {
  capex: 'usd',
  er_total: 'tco2e',
  er_year1: 'tco2e',
  breakeven: 'usdPerT',
  breakeven_year1_price: 'usdPerT',
  npv_at_15: 'usd',
  irr_at_15: 'irr',
  payback_index: 'index',
};

function summary(r: Result): Record<string, number | null> {
  return {
    capex: r.capexUsd,
    er_total: r.erTotalTco2e,
    er_year1: r.erYear1Tco2e,
    breakeven: r.breakevenUsdPerT,
    breakeven_year1_price: r.breakevenUsdPerT,
    npv_at_15: r.npvUsd,
    irr_at_15: r.irr,
    payback_index: r.paybackIndex,
  };
}

/** Compare every scalar (number or null) in a golden object; returns how many were compared. */
function compareScalars(r: Result, golden: Json, label: string, skip: string[] = []): number {
  const s = summary(r);
  let n = 0;
  for (const [key, expected] of Object.entries(golden)) {
    if (skip.includes(key) || typeof expected === 'string') continue;
    if (expected !== null && typeof expected === 'object') continue; // arrays and maps are compared separately
    expect(UNIT[key], `${label}: unknown golden key ${key}`).toBeDefined();
    expectGolden(s[key], expected as number | null, UNIT[key], `${label}.${key}`);
    n++;
  }
  return n;
}

function compareSeries(actual: number[], expected: number[], unit: Unit, label: string) {
  expect(actual.length, `${label} length`).toBe(expected.length);
  expected.forEach((e, i) => expectGolden(actual[i], e, unit, `${label}[${i}]`));
}

/**
 * Waterfall (Appendix B4) rebuilt from the year rows: each part of the break-even numerator over the denominator.
 * The waterfall function itself belongs to Step 7; this checks that the yearly components behind it are right.
 */
function waterfall(r: Result) {
  const { discountRate: rate, brokerShare, issuanceFeeUsdPerT } = REFERENCE_SETTINGS;
  const er = r.years.map((y) => y.erTco2e);
  const den = (1 - brokerShare) * pv(er, rate);
  const parts = {
    capex: r.capexUsd / den,
    opex: pv(r.years.map((y) => y.opexUsd), rate) / den,
    mrv: pv(r.years.map((y) => y.mrvUsd), rate) / den,
    fees: (issuanceFeeUsdPerT * pv(er, rate)) / den,
    energy: -pv(r.years.map((y) => y.energyRevUsd), rate) / den,
  };
  return { ...parts, total: parts.capex + parts.opex + parts.mrv + parts.fees + parts.energy };
}

const STREAM_BY_GOLDEN_NAME: Record<string, StreamKind> = {
  'Drained gas to power': 'drained',
  'Ventilation air methane': 'vam',
  'Post-closure AMM to power': 'amm',
  drained: 'drained',
  vam: 'vam',
  amm: 'amm',
};

function streamOf(r: Result, goldenName: string) {
  const kind = STREAM_BY_GOLDEN_NAME[goldenName];
  const s = r.streams.find((x) => x.kind === kind);
  expect(s, `stream ${goldenName}`).toBeDefined();
  return s!;
}

function compareMoonidihCase(mine: MineInput, g: Json, label: string) {
  const r = run(mine);
  expect(compareScalars(r, g, label)).toBe(6);
  compareSeries(
    r.years.map((y) => y.erTco2e),
    g.er_by_year as number[],
    'tco2e',
    `${label}.er_by_year`,
  );
  compareSeries(r.cashUsd, g.cash as number[], 'usd', `${label}.cash`);
  const wf = waterfall(r);
  const gw = g.waterfall as Record<string, number>;
  expect(Object.keys(gw).sort()).toEqual(Object.keys(wf).sort());
  for (const [k, v] of Object.entries(gw)) {
    expectGolden(wf[k as keyof typeof wf], v, 'usdPerT', `${label}.waterfall.${k}`);
  }
  expectGolden(wf.total, r.breakevenUsdPerT, 'usdPerT', `${label}.waterfall sums to break-even`);
}

describe('moonidih_v1', () => {
  const g = load('moonidih_v1');

  test('headline numbers, ER by year, cash and waterfall', () => {
    compareMoonidihCase(MOONIDIH_V1, g, 'moonidih_v1');
  });

  test('per-stream capex, ER and break-even', () => {
    const r = run(MOONIDIH_V1);
    const ps = g.per_stream as Record<string, { capex: number; er_total: number; breakeven: number }>;
    expect(Object.keys(ps)).toHaveLength(3);
    for (const [name, v] of Object.entries(ps)) {
      const s = streamOf(r, name);
      expectGolden(s.capexUsd, v.capex, 'usd', `${name}.capex`);
      expectGolden(s.erTotalTco2e, v.er_total, 'tco2e', `${name}.er_total`);
      expectGolden(s.breakevenUsdPerT, v.breakeven, 'usdPerT', `${name}.breakeven`);
    }
  });

  test('NPV by credit price', () => {
    const byPrice = g.npv_by_price as Record<string, number>;
    expect(Object.keys(byPrice)).toHaveLength(8);
    for (const [p, v] of Object.entries(byPrice)) {
      expectGolden(run(MOONIDIH_V1, { creditPriceUsdPerT: Number(p) }).npvUsd, v, 'usd', `npv at $${p}`);
    }
  });
});

describe('moonidih_wb2034', () => {
  test('headline numbers, ER by year, cash and waterfall', () => {
    compareMoonidihCase(MOONIDIH_WB2034, load('moonidih_wb2034'), 'moonidih_wb2034');
  });
});

describe('sensitivities_v1', () => {
  const g = load('sensitivities_v1') as Record<string, Json>;
  const m = MOONIDIH_V1;
  const cases: Record<string, () => Result> = {
    flare_only: () => run({ ...m, techOverride: { drained: 'flare', amm: 'flare' } }),
    power_value_zero: () => run(m, { powerPriceUsdPerMwh: 0 }),
    gwp_29_8: () => run(m, { gwp: 29.8 }),
    gwp_21: () => run(m, { gwp: 21 }),
    discount_8: () => run(m, { discountRate: 0.08 }),
    discount_12: () => run(m, { discountRate: 0.12 }),
    drained_mandated: () => run({ ...m, destructionMandated: { ...m.destructionMandated, drained: true } }),
    gmi_scale_78: () => run({ ...m, drainedMm3PerYr: 78, amm: { ...m.amm!, q0BasisMm3: 23.45 } }),
    vam_0_1pct_not_abatable: () => run({ ...m, vamConc: 0.001 }),
    crediting_15: () => run(m, { creditingYears: 15 }),
    grant_30: () => run(m, { grantShare: 0.3 }),
    escalation_3pct: () => run(m, { priceEscalation: 0.03 }),
  };
  for (let year = 2027; year <= 2036; year++) cases[`closure_${year}`] = () => run({ ...m, closureYear: year });

  test('every golden case has a builder', () => {
    expect(Object.keys(g).sort()).toEqual(Object.keys(cases).sort());
  });

  for (const name of Object.keys(g)) {
    test(name, () => {
      const n = compareScalars(cases[name](), g[name], name);
      expect(n).toBe(Object.keys(g[name]).length);
    });
  }
});

describe('archetypes_v1', () => {
  const g = load('archetypes_v1') as Record<string, Json>;

  test('every golden archetype has a fixture', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(Object.keys(g).sort());
  });

  for (const [name, expected] of Object.entries(g)) {
    test(name, () => {
      const r = run(ARCHETYPES[name]);
      expect(r.abatable).toBe(expected.abatable);
      if (!expected.abatable) {
        expect(r.breakevenUsdPerT).toBeNull();
        return;
      }
      expect(compareScalars(r, expected, name, ['abatable'])).toBe(6);
      const ps = expected.per_stream as Record<string, number>;
      for (const [stream, be] of Object.entries(ps)) {
        expectGolden(streamOf(r, stream).breakevenUsdPerT, be, 'usdPerT', `${name}.${stream}.breakeven`);
      }
      // Streams the reference leaves out are not `ok` here either
      const okKinds = r.streams
        .filter((s) => s.status === 'ok')
        .map((s) => s.kind)
        .sort();
      expect(okKinds).toEqual(
        Object.keys(ps)
          .map((k) => STREAM_BY_GOLDEN_NAME[k])
          .sort(),
      );
    });
  }
});

describe('physics_v1', () => {
  const g = load('physics_v1') as Record<string, number>;

  test('mass and reductions per Mm3', () => {
    expect(Object.keys(g)).toHaveLength(3);
    const t = massTFromMm3(1, CONSTANTS);
    expectGolden(t, g.t_ch4_per_mm3, 't', 't_ch4_per_mm3');
    expectGolden(t * erTco2ePerTDestroyed(28, CONSTANTS), g.tco2e_per_mm3_destroyed_gwp28, 'tco2e', 'gwp28');
    expectGolden(massTFromMm3(78, CONSTANTS) * 21, g.gmi_check_78mm3_gwp21_no_combustion, 'tco2e', 'gmi');
  });
});

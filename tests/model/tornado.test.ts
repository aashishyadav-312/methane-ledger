import { describe, expect, test } from 'vitest';
import { CONSTANTS, evaluate } from '../../src/model';
import { ARCHETYPES, MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_TECH } from '../../src/model/fixtures';
import { tornado, TORNADO_DEFAULTS, type TornadoRow } from '../../src/model/tornado';
import { expectGolden, settingsWith } from './helpers';

import tornadoV1 from '../golden/tornado_v1.json';

describe.each([
  ['moonidih_v1', MOONIDIH_V1],
  ['moonidih_wb2034', MOONIDIH_WB2034],
] as const)('tornado %s', (name, mine) => {
  const g = tornadoV1[name];
  const t = tornado(mine, settingsWith(), REFERENCE_TECH, CONSTANTS);

  test('base equals the golden break-even', () => {
    expectGolden(t.baseUsdPerT, g.base, 'usdPerT', 'base');
  });

  test('top6 keys are in the golden order', () => {
    expect(t.top6).toEqual(g.top6);
  });

  test('all ten rows, in golden order, with golden low and high cases', () => {
    expect(t.rows.map((r) => r.key)).toEqual(g.rows.map((r) => r.key));
    g.rows.forEach((e, i) => {
      const r: TornadoRow = t.rows[i];
      expectGolden(r.lowCaseUsdPerT, e.low_case, 'usdPerT', `${e.key} low`);
      expectGolden(r.highCaseUsdPerT, e.high_case, 'usdPerT', `${e.key} high`);
      expectGolden(r.swingUsdPerT, e.swing, 'usdPerT', `${e.key} swing`);
    });
  });
});

describe('tornado properties', () => {
  test('rows are sorted by swing, largest first', () => {
    const t = tornado(MOONIDIH_V1, settingsWith(), REFERENCE_TECH, CONSTANTS);
    expect(t.rows).toHaveLength(10);
    for (let i = 1; i < t.rows.length; i++) {
      expect(t.rows[i - 1].swingUsdPerT).toBeGreaterThanOrEqual(t.rows[i].swingUsdPerT);
    }
  });

  test('closure is clamped to the window and the row reports the clamped year', () => {
    const late = { ...MOONIDIH_V1, closureYear: 2036 };
    const row = tornado(late, settingsWith(), REFERENCE_TECH, CONSTANTS).rows.find((r) => r.key === 'closure');
    expect(row?.lowInput).toBe(2034);
    expect(row?.highInput).toBe(2036); // last year of a 10-year window from 2027
    const early = { ...MOONIDIH_V1, closureYear: 2027 };
    const row2 = tornado(early, settingsWith(), REFERENCE_TECH, CONSTANTS).rows.find((r) => r.key === 'closure');
    expect(row2?.lowInput).toBe(2026); // no active years
    expect(row2?.highInput).toBe(2029);
  });

  test('works on a mine with no AMM: the closure-gas row has zero swing', () => {
    const mine = ARCHETYPES['Degree III underground'];
    const s = settingsWith();
    const t = tornado(mine, s, REFERENCE_TECH, CONSTANTS);
    const row = t.rows.find((r) => r.key === 'f_amm');
    expect(row?.swingUsdPerT).toBe(0);
    expect(row?.lowCaseUsdPerT).toBeCloseTo(evaluate(mine, s, REFERENCE_TECH, CONSTANTS).breakevenUsdPerT as number, 9);
  });

  test('does not change its inputs', () => {
    const mine = structuredClone(MOONIDIH_V1);
    const s = settingsWith();
    const tech = structuredClone(REFERENCE_TECH);
    tornado(mine, s, tech, CONSTANTS);
    expect(mine).toEqual(MOONIDIH_V1);
    expect(s).toEqual(settingsWith());
    expect(tech).toEqual(REFERENCE_TECH);
  });

  test('ranges can be replaced', () => {
    const params = { ...TORNADO_DEFAULTS, discountRate: { low: 0.1, high: 0.1 } };
    const row = tornado(MOONIDIH_V1, settingsWith(), REFERENCE_TECH, CONSTANTS, params).rows.find((r) => r.key === 'discount');
    expect(row?.swingUsdPerT).toBe(0);
  });
});

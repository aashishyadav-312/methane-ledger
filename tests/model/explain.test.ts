import { describe, expect, test } from 'vitest';
import { CONSTANTS, evaluate } from '../../src/model';
import { explain } from '../../src/model/explain';
import { waterfall } from '../../src/model/waterfall';
import { MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_TECH } from '../../src/model/fixtures';
import { expectGolden, settingsWith } from './helpers';

import moonidihV1 from '../golden/moonidih_v1.json';

describe('explain', () => {
  test('the formula gives the golden break-even', () => {
    const e = explain(MOONIDIH_V1, settingsWith(), REFERENCE_TECH, CONSTANTS);
    expectGolden(e.breakevenUsdPerT, moonidihV1.breakeven, 'usdPerT', 'explain breakeven');
    expect(e.numerator.map((t) => t.key)).toEqual(['capex', 'opex', 'mrv', 'fees', 'energy']);
    expect(e.denominator.map((t) => t.key)).toEqual(['sellerShare', 'discountedReductions']);
  });

  test.each([
    ['default', settingsWith()],
    ['escalation and grant', settingsWith({ priceEscalation: 0.03, grantShare: 0.3 })],
    ['15 years, GWP 21', settingsWith({ creditingYears: 15, gwp: 21 })],
  ])('terms add up and equal evaluate (%s)', (_name, s) => {
    for (const mine of [MOONIDIH_V1, MOONIDIH_WB2034]) {
      const e = explain(mine, s, REFERENCE_TECH, CONSTANTS);
      const r = evaluate(mine, s, REFERENCE_TECH, CONSTANTS);
      expect(e.numerator.reduce((a, t) => a + t.value, 0)).toBeCloseTo(e.numeratorUsd, 6);
      expect(e.breakevenUsdPerT).toBeCloseTo(r.breakevenUsdPerT as number, 9);
      expect(e.numeratorUsd / e.denominatorTco2e).toBeCloseTo(r.breakevenUsdPerT as number, 9);
    }
  });

  test('terms match the waterfall parts once divided by the denominator', () => {
    const s = settingsWith();
    const e = explain(MOONIDIH_V1, s, REFERENCE_TECH, CONSTANTS);
    const w = waterfall(MOONIDIH_V1, s, REFERENCE_TECH, CONSTANTS);
    const part = (k: string) => (e.numerator.find((t) => t.key === k)?.value ?? NaN) / e.denominatorTco2e;
    expect(part('capex')).toBeCloseTo(w?.capexUsdPerT as number, 9);
    expect(part('energy')).toBeCloseTo(w?.energyUsdPerT as number, 9);
    expect(part('energy')).toBeLessThan(0);
  });

  test('units are named and null when there are no reductions', () => {
    const e = explain(MOONIDIH_V1, settingsWith(), REFERENCE_TECH, CONSTANTS);
    expect(e.numerator.every((t) => t.unit === 'USD')).toBe(true);
    const none = { ...MOONIDIH_V1, drainedConc: 0.1, vamConc: 0.001, amm: undefined };
    expect(explain(none, settingsWith(), REFERENCE_TECH, CONSTANTS).breakevenUsdPerT).toBeNull();
  });
});

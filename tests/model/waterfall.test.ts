import { describe, expect, test } from 'vitest';
import { CONSTANTS, evaluate } from '../../src/model';
import { MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_TECH } from '../../src/model/fixtures';
import { waterfall } from '../../src/model/waterfall';
import { expectGolden, settingsWith } from './helpers';

import moonidihV1 from '../golden/moonidih_v1.json';
import moonidihWb2034 from '../golden/moonidih_wb2034.json';

describe.each([
  ['moonidih_v1', MOONIDIH_V1, moonidihV1.waterfall],
  ['moonidih_wb2034', MOONIDIH_WB2034, moonidihWb2034.waterfall],
])('waterfall %s', (name, mine, g) => {
  const w = waterfall(mine, settingsWith(), REFERENCE_TECH, CONSTANTS);

  test('matches the golden parts', () => {
    expect(w).not.toBeNull();
    expectGolden(w?.capexUsdPerT, g.capex, 'usdPerT', `${name} capex`);
    expectGolden(w?.opexUsdPerT, g.opex, 'usdPerT', `${name} opex`);
    expectGolden(w?.mrvUsdPerT, g.mrv, 'usdPerT', `${name} mrv`);
    expectGolden(w?.feesUsdPerT, g.fees, 'usdPerT', `${name} fees`);
    expectGolden(w?.energyUsdPerT, g.energy, 'usdPerT', `${name} energy`);
    expectGolden(w?.totalUsdPerT, g.total, 'usdPerT', `${name} total`);
  });

  test('the parts sum to the break-even from evaluate', () => {
    const r = evaluate(mine, settingsWith(), REFERENCE_TECH, CONSTANTS);
    const sum = (w?.capexUsdPerT ?? 0) + (w?.opexUsdPerT ?? 0) + (w?.mrvUsdPerT ?? 0) + (w?.feesUsdPerT ?? 0) + (w?.energyUsdPerT ?? 0);
    expect(sum).toBeCloseTo(r.breakevenUsdPerT as number, 9);
    expect(w?.totalUsdPerT).toBeCloseTo(sum, 12);
  });
});

describe('waterfall properties', () => {
  test('energy is negative and still sums to P* with escalation and a grant', () => {
    const s = settingsWith({ priceEscalation: 0.03, grantShare: 0.3 });
    const w = waterfall(MOONIDIH_V1, s, REFERENCE_TECH, CONSTANTS);
    const r = evaluate(MOONIDIH_V1, s, REFERENCE_TECH, CONSTANTS);
    expect(w?.energyUsdPerT).toBeLessThan(0);
    expect(w?.totalUsdPerT).toBeCloseTo(r.breakevenUsdPerT as number, 9);
  });

  test('null when there are no reductions', () => {
    const none = { ...MOONIDIH_V1, drainedConc: 0.1, vamConc: 0.001, amm: undefined };
    expect(waterfall(none, settingsWith(), REFERENCE_TECH, CONSTANTS)).toBeNull();
  });
});

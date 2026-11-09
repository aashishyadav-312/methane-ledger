import { expect } from 'vitest';
import { CONSTANTS, evaluate, type MineInput, type Result, type Settings } from '../../src/model';
import { REFERENCE_SETTINGS, REFERENCE_TECH } from '../../src/model/fixtures';

export type Unit = 'usdPerT' | 'usd' | 'tco2e' | 't' | 'irr' | 'index';

/** Absolute floors from PLAN_V1 Step 2: $0.01 per t, $1,000, 1 tCO2e (and 1 t), 0.0005 for IRR. */
const ABS: Record<Exclude<Unit, 'index'>, number> = { usdPerT: 0.01, usd: 1000, tco2e: 1, t: 1, irr: 0.0005 };

/** Pass if |actual - expected| <= max(0.5% x |expected|, abs). Indexes match exactly; null matches null. */
export function expectGolden(actual: number | null | undefined, expected: number | null, unit: Unit, label: string) {
  if (expected === null || unit === 'index') {
    expect(actual, label).toBe(expected);
    return;
  }
  expect(actual, `${label} should be a number`).toBeTypeOf('number');
  const tol = Math.max(0.005 * Math.abs(expected), ABS[unit]);
  const diff = Math.abs((actual as number) - expected);
  expect(diff, `${label}: actual ${actual}, expected ${expected}, tolerance ${tol}`).toBeLessThanOrEqual(tol);
}

export function settingsWith(patch: Partial<Settings> = {}): Settings {
  return { ...REFERENCE_SETTINGS, ...patch };
}

export function run(mine: MineInput, patch: Partial<Settings> = {}): Result {
  return evaluate(mine, settingsWith(patch), REFERENCE_TECH, CONSTANTS);
}

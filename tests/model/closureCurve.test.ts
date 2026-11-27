import { describe, expect, test } from 'vitest';
import { closureCurve } from '../../src/model/closureCurve';
import { estimateById, pickMineInput } from '../../src/data/estimation';
import { getConstants, getCosts, getDefaultSettings, getTech } from '../../src/data/load';
import { expectGolden } from './helpers';
import golden from '../golden/estimation_v2.json';

const settings = getDefaultSettings();
const curve = (input: Parameters<typeof closureCurve>[0], patch: Partial<typeof settings> = {}) =>
  closureCurve(input, { ...settings, ...patch }, getTech(), getConstants(), getCosts());

type Golden = { curve: { power: Record<string, number>; flare: Record<string, number> }; crossover_year: number };

function check(label: string, c: ReturnType<typeof curve>, g: Golden) {
  const years = Object.keys(g.curve.power).map(Number);
  expect(c.years).toEqual(years);
  expect(c.power).toHaveLength(years.length);
  expect(c.flare).toHaveLength(years.length);
  years.forEach((y, i) => {
    expectGolden(c.power[i], g.curve.power[String(y)]!, 'usdPerT', `${label} power ${y}`);
    expectGolden(c.flare[i], g.curve.flare[String(y)]!, 'usdPerT', `${label} flare ${y}`);
  });
  expect(c.crossoverYear).toBe(g.crossover_year);
}

describe('closureCurve', () => {
  test('Moonidih record matches the golden curve, crossover 2031', () => {
    const input = pickMineInput('bccl-moonidih')!.input!;
    check('Moonidih record', curve(input), golden.closure_curve.moonidih_record as Golden);
    expect(golden.closure_curve.moonidih_record.crossover_year).toBe(2031);
  });

  test('AMP Colliery estimate matches the golden curve, crossover 2032', () => {
    const input = estimateById('bccl-amp-colliery')!.input!;
    check('AMP Colliery', curve(input), golden.closure_curve.amp_colliery_estimate as Golden);
    expect(golden.closure_curve.amp_colliery_estimate.crossover_year).toBe(2032);
  });

  test("the input's own closure year does not change the curve", () => {
    const input = pickMineInput('bccl-moonidih')!.input!;
    const a = curve(input);
    const b = curve({ ...input, closureYear: 2029 });
    expect(b).toEqual(a);
  });

  test('it follows the crediting window', () => {
    const input = estimateById('bccl-amp-colliery')!.input!;
    const c = curve(input, { creditingYears: 15 });
    expect(c.years).toHaveLength(15);
    expect(c.years[14]).toBe(2041);
    expect(c.power).toHaveLength(15);
  });

  test('power gets cheaper than flare as the mine closes later', () => {
    const c = curve(pickMineInput('bccl-moonidih')!.input!);
    const i = c.years.indexOf(c.crossoverYear!);
    expect(c.power[i - 1]!).toBeGreaterThan(c.flare[i - 1]!);
    expect(c.power[i]!).toBeLessThanOrEqual(c.flare[i]!);
  });
});

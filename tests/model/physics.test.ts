import { describe, expect, test } from 'vitest';
import { CONSTANTS, erTco2ePerTDestroyed, massTFromMm3, type MineInput, type Settings } from '../../src/model';
import { ARCHETYPES, MOONIDIH_V1, MOONIDIH_WB2034 } from '../../src/model/fixtures';
import { run } from './helpers';

/** PLAN_V1 Appendix B7. */
describe('physics checks (Appendix B7)', () => {
  test('1 Mm3 CH4 is 670 t, and destroying it at GWP 28 gives 16,917.5 tCO2e', () => {
    expect(massTFromMm3(1, CONSTANTS)).toBeCloseTo(670, 9);
    expect(massTFromMm3(1, CONSTANTS) * erTco2ePerTDestroyed(28, CONSTANTS)).toBeCloseTo(16_917.5, 6);
  });

  test("78 Mm3 at GWP 21 with no combustion deduction is 1,097,460 tCO2e, within 2% of GMI's 1.109 Mt", () => {
    const tco2e = massTFromMm3(78, CONSTANTS) * 21;
    expect(tco2e).toBeCloseTo(1_097_460, 6);
    const gmiTco2e = 1_109_000; // GMI (2013) Moonidih pre-feasibility estimate, quoted in PLAN_V1 Appendix B7
    expect(Math.abs(tco2e - gmiTco2e) / gmiTco2e).toBeLessThan(0.02);
  });

  const atBreakeven: [string, MineInput, Partial<Settings>][] = [
    ['moonidih_v1', MOONIDIH_V1, {}],
    ['moonidih_wb2034', MOONIDIH_WB2034, {}],
    ['escalation 3%', MOONIDIH_V1, { priceEscalation: 0.03 }],
    ['grant 30%', MOONIDIH_V1, { grantShare: 0.3 }],
    ['crediting 15 years', MOONIDIH_V1, { creditingYears: 15 }],
    ['closure 2036 (negative break-even)', { ...MOONIDIH_V1, closureYear: 2036 }, {}],
    ['Degree II underground', ARCHETYPES['Degree II underground'], {}],
    ['Degree III, closing in 4 yrs', ARCHETYPES['Degree III, closing in 4 yrs'], {}],
  ];
  test.each(atBreakeven)('NPV at the break-even price is 0 +/- $1,000: %s', (_, mine, patch) => {
    const be = run(mine, patch).breakevenUsdPerT;
    expect(be).not.toBeNull();
    expect(Math.abs(run(mine, { ...patch, creditPriceUsdPerT: be! }).npvUsd)).toBeLessThanOrEqual(1000);
  });

  const be = (patch: Partial<Settings> = {}, mine: MineInput = MOONIDIH_V1) => run(mine, patch).breakevenUsdPerT!;

  test('break-even falls when the power price, GWP or grant rises', () => {
    expect(be({ powerPriceUsdPerMwh: 120 })).toBeLessThan(be({ powerPriceUsdPerMwh: 80 }));
    expect(be({ powerPriceUsdPerMwh: 80 })).toBeLessThan(be({ powerPriceUsdPerMwh: 40 }));
    expect(be({ gwp: 29.8 })).toBeLessThan(be({ gwp: 28 }));
    expect(be({ gwp: 28 })).toBeLessThan(be({ gwp: 21 }));
    expect(be({ grantShare: 0.3 })).toBeLessThan(be({ grantShare: 0 }));
  });

  test('break-even rises when the discount rate rises or closure moves earlier', () => {
    expect(be({ discountRate: 0.12 })).toBeGreaterThan(be({ discountRate: 0.1 }));
    expect(be({ discountRate: 0.1 })).toBeGreaterThan(be({ discountRate: 0.08 }));
    for (let year = 2028; year <= 2036; year++) {
      expect(be({}, { ...MOONIDIH_V1, closureYear: year - 1 })).toBeGreaterThan(
        be({}, { ...MOONIDIH_V1, closureYear: year }),
      );
    }
  });

  const ammOf = (mine: MineInput, patch: Partial<Settings> = {}) =>
    run(mine, patch).years.map((y) => y.byStream.amm.ch4Mm3);

  test('AMM is strictly decreasing after closure', () => {
    const amm = ammOf(MOONIDIH_V1, { creditingYears: 15 }).slice(4);
    expect(amm).toHaveLength(11);
    expect(amm[0]).toBeCloseTo((0.3 * (20 + 3.45)) / 1.25, 9);
    for (let i = 1; i < amm.length; i++) expect(amm[i]).toBeLessThan(amm[i - 1]);
  });

  test('flooding cuts AMM from the flooding year on', () => {
    const dry = ammOf(MOONIDIH_V1);
    const wet = ammOf({ ...MOONIDIH_V1, amm: { ...MOONIDIH_V1.amm!, floodingYear: 2033, floodingFactor: 0.5 } });
    const years = run(MOONIDIH_V1).years.map((y) => y.year);
    years.forEach((year, i) => {
      if (year < 2033) expect(wet[i]).toBe(dry[i]);
      else expect(wet[i]).toBeCloseTo(dry[i] * 0.5, 9);
    });
    expect(wet[6]).toBeLessThan(dry[6]);
  });

  test('a mandated stream has costs but no reductions', () => {
    const base = run(MOONIDIH_V1);
    const r = run({ ...MOONIDIH_V1, destructionMandated: { drained: true, vam: false, amm: false } });
    const drained = r.streams.find((s) => s.kind === 'drained')!;
    expect(drained.status).toBe('ok');
    expect(drained.erTotalTco2e).toBe(0);
    expect(drained.capexUsd).toBe(base.streams.find((s) => s.kind === 'drained')!.capexUsd);
    expect(r.capexUsd).toBe(base.capexUsd);
    expect(r.years.every((y) => y.byStream.drained.erTco2e === 0)).toBe(true);
    expect(r.years.map((y) => y.opexUsd)).toEqual(base.years.map((y) => y.opexUsd));
    expect(r.years.map((y) => y.energyRevUsd)).toEqual(base.years.map((y) => y.energyRevUsd));
  });

  test('VAM below 0.2% needs enrichment; 5% to 15% is the explosive range', () => {
    const dilute = run({ ...MOONIDIH_V1, vamConc: 0.0019 }).streams.find((s) => s.kind === 'vam')!;
    expect(dilute.status).toBe('needs_enrichment');
    expect(dilute.warnings).toContain('needs_enrichment');
    for (const conc of [0.05, 0.1, 0.15]) {
      const r = run({ ...MOONIDIH_V1, vamConc: conc });
      expect(r.streams.find((s) => s.kind === 'vam')!.warnings).toContain('unsafe_range');
      expect(r.warnings).toContain('unsafe_range');
    }
    for (const conc of [0.049, 0.151]) {
      expect(run({ ...MOONIDIH_V1, vamConc: conc }).warnings).not.toContain('unsafe_range');
    }
  });
});

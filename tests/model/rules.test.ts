import { describe, expect, test } from 'vitest';
import {
  ammDecline,
  buildStreams,
  buildTimeline,
  irr,
  npv,
  paybackIndex,
  pv,
  selectTech,
  type MineInput,
  type StreamKind,
  type Tech,
} from '../../src/model';
import { MOONIDIH_V1, REFERENCE_SETTINGS, REFERENCE_TECH } from '../../src/model/fixtures';
import { run } from './helpers';

const lib = REFERENCE_TECH;
const streamOf = (mine: MineInput, kind: StreamKind) => run(mine).streams.find((s) => s.kind === kind);

describe('technology rule table (Appendix B2)', () => {
  const rows: [StreamKind, number, boolean, Tech | null][] = [
    ['drained', 0.5, true, 'power'],
    ['drained', 0.3, true, 'power'],
    ['drained', 0.5, false, 'flare'],
    ['drained', 0.29, true, 'flare'],
    ['drained', 0.25, true, 'flare'],
    ['drained', 0.24, true, null],
    ['amm', 0.6, true, 'power'],
    ['amm', 0.6, false, 'flare'],
    ['amm', 0.2, true, null],
    ['vam', 0.003, true, 'rto'],
    ['vam', 0.002, true, 'rto'],
    ['vam', 0.5, true, 'rto'],
    ['vam', 0.0019, true, null],
  ];
  test.each(rows)('%s at conc %s, power offtake %s -> %s', (kind, conc, offtake, tech) => {
    const choice = selectTech(kind, conc, offtake, lib);
    expect(choice.tech).toBe(tech);
    expect(choice.status).toBe(tech ? 'ok' : 'needs_enrichment');
  });

  test('an override is honoured only when it meets the minimum', () => {
    expect(selectTech('drained', 0.5, true, lib, 'flare').tech).toBe('flare');
    expect(selectTech('drained', 0.27, true, lib, 'power').tech).toBe('flare');
    expect(selectTech('drained', 0.5, false, lib, 'power').tech).toBe('flare');
    expect(selectTech('vam', 0.001, true, lib, 'rto')).toEqual({ tech: null, status: 'needs_enrichment' });
    expect(selectTech('vam', 0.003, true, lib, 'power').tech).toBe('rto');
  });

  test('a stream that needs enrichment has no capex, costs or reductions', () => {
    const r = run({ ...MOONIDIH_V1, drainedConc: 0.2 });
    const drained = r.streams.find((s) => s.kind === 'drained')!;
    expect(drained).toMatchObject({ status: 'needs_enrichment', tech: null, capexUsd: 0, erTotalTco2e: 0 });
    expect(drained.breakevenUsdPerT).toBeNull();
    expect(drained.warnings).toEqual(['needs_enrichment']);
    expect(r.years[0].byStream.drained).toEqual({ erTco2e: 0, ch4Mm3: 20 });
    expect(r.abatable).toBe(true);
  });

  test('the flare and power capex follow Appendix B3', () => {
    const flare = streamOf({ ...MOONIDIH_V1, techOverride: { drained: 'flare' } }, 'drained')!;
    expect(flare.capexUsd).toBeCloseTo(20 * (40_000 + 250_000) * 1.15, 6);
    const kw = (20 * 670 * 50 * 0.38) / 3.6 / (8760 * 0.9) * 1000;
    const power = streamOf({ ...MOONIDIH_V1, hasDrainageSystem: true }, 'drained')!;
    expect(power.capexUsd).toBeCloseTo(kw * 1300 * 1.15, 6);
  });

  test('a measured ventilation airflow sizes the RTO', () => {
    const r = run({ ...MOONIDIH_V1, vamAirflowM3s: 400 });
    expect(r.streams.find((s) => s.kind === 'vam')!.capexUsd).toBeCloseTo(400 * 60_000 * 1.15, 6);
    const fanUsd = (400 * 60_000) / 1000 * 80;
    const noVam = run({ ...MOONIDIH_V1, vamConc: 0.001 });
    expect(r.years[0].opexUsd - noVam.years[0].opexUsd).toBeCloseTo(400 * 60_000 * 1.15 * 0.06 + fanUsd, 4);
  });

  test('drainage opex continues after closure, as the reference does (B3 note)', () => {
    const r = run({ ...MOONIDIH_V1, amm: undefined, vamConc: 0.001 });
    expect(r.years[9].byStream.drained.ch4Mm3).toBe(0);
    expect(r.years[9].opexUsd).toBeCloseTo(20 * 250_000 * 0.04, 6);
    expect(run({ ...MOONIDIH_V1, amm: undefined, vamConc: 0.001, hasDrainageSystem: true }).years[9].opexUsd).toBe(0);
  });
});

describe('warnings', () => {
  test('drained gas in the explosive range is unsafe and needs enrichment', () => {
    const s = streamOf({ ...MOONIDIH_V1, drainedConc: 0.1 }, 'drained')!;
    expect(s.status).toBe('needs_enrichment');
    expect(s.warnings).toEqual(['unsafe_range', 'needs_enrichment']);
  });

  test('closure outside the crediting window', () => {
    expect(run({ ...MOONIDIH_V1, closureYear: 2040 }).warnings).toContain('closure_outside_window');
    expect(run({ ...MOONIDIH_V1, closureYear: 2036 }).warnings).not.toContain('closure_outside_window');
    expect(run({ ...MOONIDIH_V1, closureYear: 2027 }).warnings).not.toContain('closure_outside_window');
    expect(run({ ...MOONIDIH_V1, closureYear: 2020 }).warnings).toContain('closure_outside_window');
  });

  test('result warnings are deduplicated', () => {
    const r = run({ ...MOONIDIH_V1, drainedConc: 0.1, vamConc: 0.12 });
    expect(r.warnings).toEqual(['unsafe_range', 'needs_enrichment']);
  });
});

describe('mandated destruction', () => {
  test('zero reductions everywhere gives no break-even but keeps costs', () => {
    const r = run({ ...MOONIDIH_V1, destructionMandated: { drained: true, vam: true, amm: true } });
    expect(r.abatable).toBe(true);
    expect(r.erTotalTco2e).toBe(0);
    expect(r.breakevenUsdPerT).toBeNull();
    expect(r.capexUsd).toBe(run(MOONIDIH_V1).capexUsd);
    expect(r.streams.every((s) => s.breakevenUsdPerT === null)).toBe(true);
  });
});

describe('streams and timeline', () => {
  test('no AMM stream without post-closure years or without an amm input', () => {
    expect(run({ ...MOONIDIH_V1, closureYear: 2036 }).streams.map((s) => s.kind)).toEqual(['drained', 'vam']);
    expect(run({ ...MOONIDIH_V1, amm: undefined }).streams.map((s) => s.kind)).toEqual(['drained', 'vam']);
  });

  test('a stream with no gas is `no_gas` with no warnings', () => {
    const s = streamOf({ ...MOONIDIH_V1, drainedMm3PerYr: 0, drainedConc: 0.1 }, 'drained')!;
    expect(s).toMatchObject({ status: 'no_gas', tech: null, capexUsd: 0, warnings: [] });
  });

  test('not abatable: no stream ok, no break-even, no IRR', () => {
    const r = run({ ...MOONIDIH_V1, drainedConc: 0.2, vamConc: 0.001, amm: undefined });
    expect(r.abatable).toBe(false);
    expect(r.breakevenUsdPerT).toBeNull();
    expect(r.irr).toBeNull();
    expect(r.paybackIndex).toBeNull();
    expect(r.paybackYear).toBeNull();
  });

  test('timeline clamps active years to the window', () => {
    const s = REFERENCE_SETTINGS;
    expect(buildTimeline({ closureYear: 2030 }, s)).toMatchObject({ activeYears: 4, postYears: 6 });
    expect(buildTimeline({ closureYear: 2050 }, s)).toMatchObject({ activeYears: 10, postYears: 0 });
    expect(buildTimeline({ closureYear: 2020 }, s)).toMatchObject({ activeYears: 0, postYears: 10 });
  });

  test('per-year arrays for production and measured gas; missing entries are 0', () => {
    const mine: MineInput = {
      ...MOONIDIH_V1,
      productionMtPerYr: [1, 2],
      specificEmissionM3PerT: 10,
      drainedMm3PerYr: undefined,
      drainedShare: 0.4,
      vamMm3PerYr: [3, 4, 5],
    };
    const streams = buildStreams(mine, REFERENCE_SETTINGS, REFERENCE_TECH);
    const drained = streams.find((s) => s.kind === 'drained')!.ch4Mm3ByYear;
    const vam = streams.find((s) => s.kind === 'vam')!.ch4Mm3ByYear;
    expect(drained.slice(0, 5)).toEqual([4, 8, 0, 0, 0]);
    expect(vam.slice(0, 5)).toEqual([3, 4, 5, 0, 0]);
    // AMM basis is drained + VAM in the last active year (2030): 0 + 0
    expect(streams.find((s) => s.kind === 'amm')!.status).toBe('no_gas');
  });

  test('derived gas with no specific emission is 0', () => {
    const mine: MineInput = { ...MOONIDIH_V1, drainedMm3PerYr: undefined, vamMm3PerYr: undefined };
    const streams = buildStreams(mine, REFERENCE_SETTINGS, REFERENCE_TECH);
    expect(streams.every((s) => s.status === 'no_gas')).toBe(true);
  });

  test('a mine closed before the window uses the given q0 and years since closure', () => {
    const amm = { ...MOONIDIH_V1.amm!, q0Mm3: 5, yearsSinceClosure: 6 };
    const r = run({ ...MOONIDIH_V1, closureYear: 2020, amm });
    expect(r.activeYears).toBe(0);
    expect(r.years[0].byStream.amm.ch4Mm3).toBeCloseTo(5 / (1 + 0.25 * 7), 9);
    expect(r.years[0].byStream.drained.ch4Mm3).toBe(0);
    // years since closure derived from the closure year when not given: closed end 2020, so 6 years before 2027
    const derived = run({ ...MOONIDIH_V1, closureYear: 2020, amm: { ...amm, yearsSinceClosure: undefined } });
    expect(derived.years[0].byStream.amm.ch4Mm3).toBeCloseTo(5 / (1 + 0.25 * 7), 9);
    // without q0 and with no active year, the basis is 0
    const none = run({ ...MOONIDIH_V1, closureYear: 2020, amm: { ...amm, q0Mm3: undefined } });
    expect(none.streams.find((s) => s.kind === 'amm')!.status).toBe('no_gas');
  });

  test('hyperbolic b = 0 is exponential decline', () => {
    expect(ammDecline(10, 2, 0.25, 0)).toBeCloseTo(10 * Math.exp(-0.5), 12);
    expect(ammDecline(10, 2, 0.25, 1)).toBeCloseTo(10 / 1.5, 12);
  });
});

describe('year rows', () => {
  const r = run(MOONIDIH_V1, { priceEscalation: 0.03 });

  test('cash, cumulative cash, price and stream split are consistent', () => {
    expect(r.years).toHaveLength(10);
    expect(r.cashUsd).toHaveLength(11);
    expect(r.years.map((y) => y.year)).toEqual(Array.from({ length: 10 }, (_, i) => 2027 + i));
    let cum = r.cashUsd[0];
    r.years.forEach((y, i) => {
      cum += r.cashUsd[i + 1];
      expect(y.cashUsd).toBe(r.cashUsd[i + 1]);
      expect(y.cumCashUsd).toBeCloseTo(cum, 4);
      expect(y.priceUsdPerT).toBeCloseTo(15 * 1.03 ** i, 9);
      expect(y.creditRevUsd).toBeCloseTo(y.erTco2e * (y.priceUsdPerT * 0.95 - 0.2), 4);
      expect(y.mrvUsd).toBe(i === 0 ? 130_000 : 50_000);
      const split = y.byStream.drained.erTco2e + y.byStream.vam.erTco2e + y.byStream.amm.erTco2e;
      expect(split).toBeCloseTo(y.erTco2e, 6);
      expect(y.cashUsd).toBeCloseTo(y.creditRevUsd + y.energyRevUsd - y.opexUsd - y.mrvUsd, 4);
    });
    expect(r.years[0].ch4CapturedT).toBeCloseTo((20 + 3.45 * 0.85) * 670, 6);
    expect(r.paybackYear).toBe(2026 + r.paybackIndex!);
  });
});

describe('finance (Appendix B4, B5)', () => {
  test('PV discounts from year 1, NPV from year 0', () => {
    expect(pv([110, 121], 0.1)).toBeCloseTo(200, 9);
    expect(npv([-100, 110], 0.1)).toBeCloseTo(0, 9);
  });

  test('IRR finds the highest sign change and returns null when there is none', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 9);
    expect(irr([-100, -10, -10])).toBeNull();
    expect(irr([100, 10])).toBeNull();
    // NPV exactly 0 at the top of the scan (r = 10): -11 + 121 / 11 = 0
    expect(irr([-11, 121])).toBeCloseTo(10, 6);
  });

  test('payback index is the first year with cumulative cash at or above 0', () => {
    expect(paybackIndex([-100, 50, 50, 50])).toBe(2);
    expect(paybackIndex([-100, 10, 10])).toBeNull();
    expect(paybackIndex([0, 0])).toBe(1);
  });
});

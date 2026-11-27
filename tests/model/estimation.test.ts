import { describe, expect, test } from 'vitest';
import { evaluate, type MineInput, type Result } from '../../src/model';
import { estimateMineInput } from '../../src/model/estimate';
import { getEstimationParams, getEstimationRecord, estimateById, getEstimateMine, pickMineInput } from '../../src/data/estimation';
import { getConstants, getCosts, getDefaultSettings, getMapData, getMine, getTech, getTimeline } from '../../src/data/load';
import { expectGolden } from './helpers';
import golden from '../golden/estimation_v2.json';

const settings = getDefaultSettings();
const tech = getTech();
const constants = getConstants();
const costs = getCosts();
const run = (input: MineInput, patch: Partial<typeof settings> = {}): Result =>
  evaluate(input, { ...settings, ...patch }, tech, constants, costs);

interface GoldenCase {
  id: string;
  status: string;
  modelStatus: 'ok' | 'not_abatable' | 'no_output';
  reason?: string;
  warnings: string[];
  degree?: number | null;
  totalMm3?: number;
  closureYear?: number;
  breakeven?: number;
  capex?: number;
  npv_at_15?: number;
  irr_at_15?: number | null;
  payback_index?: number | null;
  er_total?: number;
}
const cases = golden.cases as unknown as Record<string, GoldenCase>;

describe('estimation parameters', () => {
  test('match the Appendix B parameters in the golden file', () => {
    const p = getEstimationParams();
    const g = golden.params;
    expect(p.degreeByField).toEqual(g.DEGREE_BY_FIELD);
    expect(p.defaultDegree).toBe(g.DEFAULT_DEGREE);
    for (const d of ['1', '2', '3'] as const) {
      expect(p.byDegree[d].specificEmissionM3PerT).toBe(g.BY_DEGREE[d].se);
      expect(p.byDegree[d].drainedShare).toBe(g.BY_DEGREE[d].dshare);
      expect(p.byDegree[d].drainedConc).toBe(g.BY_DEGREE[d].dconc);
      expect(p.byDegree[d].vamConc).toBe(g.BY_DEGREE[d].vconc);
    }
    expect(p.opencastSpecificEmissionM3PerT).toBe(g.OPENCAST.se);
    expect(p.mixedUndergroundShare).toBe(g.MIXED_UG_SHARE);
    expect(p.afterClosure).toEqual({ fAmm: g.F_AMM, conc: g.AMM_CONC });
    expect(p.captureEff.vam).toBe(g.CAP_VAM);
    expect(p.captureEff.amm).toBe(g.CAP_AMM);
  });

  test('every value is estimated and carries a unit and a source', () => {
    const quality: string[] = [];
    const walk = (x: unknown): void => {
      if (typeof x !== 'object' || x === null) return;
      const o = x as Record<string, unknown>;
      if ('value' in o && 'quality' in o) {
        quality.push(String(o.quality));
        expect(String(o.unit).length).toBeGreaterThan(0);
        expect(String(o.source).length).toBeGreaterThan(0);
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(getEstimationRecord());
    expect(quality.length).toBeGreaterThan(10);
    expect(new Set(quality)).toEqual(new Set(['estimated']));
  });

  test('the oxidiser minimum agrees with the technology library', () => {
    expect(getEstimationParams().oxidiserMinVamConc).toBe(tech.rto.minConc);
  });
});

describe('estimateMineInput against the golden cases', () => {
  for (const [id, g] of Object.entries(cases)) {
    test(`${id}: ${g.modelStatus}`, () => {
      const e = estimateById(id);
      expect(e, 'mine is in the map data').toBeDefined();
      if (!e) return;
      expect(e.status).toBe(g.modelStatus);
      expect(e.warnings).toEqual(g.warnings);
      if (g.reason !== undefined) expect(e.reason).toBe(g.reason);
      if (g.modelStatus === 'no_output') {
        expect(e.input).toBeNull();
        return;
      }
      expect(e.degree).toBe(g.degree);
      expectGolden(e.totalMm3, g.totalMm3 ?? null, 'tco2e', `${id} totalMm3`);
      expect(e.closureYear).toBe(g.closureYear);
      if (g.modelStatus === 'not_abatable') {
        expect(e.input).toBeNull();
        return;
      }
      expect(e.input).not.toBeNull();
      const r = run(e.input!);
      expectGolden(r.breakevenUsdPerT, g.breakeven!, 'usdPerT', `${id} break-even`);
      expectGolden(r.capexUsd, g.capex!, 'usd', `${id} capex`);
      expectGolden(r.npvUsd, g.npv_at_15!, 'usd', `${id} NPV at $15`);
      expectGolden(r.irr, g.irr_at_15 ?? null, g.irr_at_15 == null ? 'index' : 'irr', `${id} IRR at $15`);
      expectGolden(r.paybackIndex, g.payback_index ?? null, 'index', `${id} payback index`);
      expectGolden(r.erTotalTco2e, g.er_total!, 'tco2e', `${id} total reductions`);
    });
  }

  test('the cases cover every status and a closure_uncertain warning where the golden has one', () => {
    const statuses = new Set(Object.values(cases).map((c) => c.modelStatus));
    expect(statuses).toEqual(new Set(['ok', 'not_abatable', 'no_output']));
  });
});

describe('all 311 mines', () => {
  const mines = getMapData().mines;
  const results = mines.map((m) => ({ m, e: estimateById(m.id)! }));
  const ok = results.filter((r) => r.e.status === 'ok').map((r) => ({ ...r, r: run(r.e.input!) }));

  test('count by status matches the golden summary exactly', () => {
    expect(mines).toHaveLength(golden.summary.mines);
    const count = (s: string) => results.filter((r) => r.e.status === s).length;
    expect(count('ok')).toBe(golden.summary.by_status.ok);
    expect(count('not_abatable')).toBe(golden.summary.by_status.not_abatable);
    expect(count('no_output')).toBe(golden.summary.by_status.no_output);
    expect(ok).toHaveLength(58);
  });

  test('4 mines pay at $15 and 1 pays at $7', () => {
    expect(ok.filter((x) => x.r.breakevenUsdPerT! <= 15)).toHaveLength(golden.summary.pays_at_15);
    expect(ok.filter((x) => x.r.breakevenUsdPerT! <= 7)).toHaveLength(golden.summary.pays_at_7);
  });

  test('the cheapest mines and the reductions match', () => {
    const cheapest = [...ok].sort((a, b) => a.r.breakevenUsdPerT! - b.r.breakevenUsdPerT!).slice(0, 8);
    cheapest.forEach((x, i) => {
      expect(x.m.name).toBe(golden.summary.cheapest[i]![0]);
      expectGolden(x.r.breakevenUsdPerT, golden.summary.cheapest[i]![1] as number, 'usdPerT', `${x.m.name} break-even`);
    });
    const er = ok.reduce((s, x) => s + x.r.erTotalTco2e, 0) / 1e6;
    expect(Math.abs(er - golden.summary.er_total_ok_mt)).toBeLessThan(0.01 * golden.summary.er_total_ok_mt);
    const erPaying = ok.filter((x) => x.r.breakevenUsdPerT! <= 15).reduce((s, x) => s + x.r.erTotalTco2e, 0) / 1e6;
    expect(Math.abs(erPaying - golden.summary.er_total_pays_at_15_mt)).toBeLessThan(0.01 * golden.summary.er_total_pays_at_15_mt);
  });

  test('every not-abatable and no-output mine has a reason and no input', () => {
    for (const { e } of results.filter((r) => r.e.status !== 'ok')) {
      expect(e.input).toBeNull();
      expect(e.reason).toBeTruthy();
    }
  });

  test('a mine with a closure that is past or before the window is flagged, and closes in the first year', () => {
    const flagged = results.filter((r) => r.e.warnings.includes('closure_uncertain'));
    expect(flagged.length).toBeGreaterThan(0);
    for (const { e } of flagged) expect(e.closureYear).toBeGreaterThanOrEqual(settings.startYear);
  });
});

describe('measured beats estimated', () => {
  test('Moonidih returns its record, with source record', () => {
    const p = pickMineInput('bccl-moonidih')!;
    expect(p.source).toBe('record');
    expect(p.input!.productionMtPerYr).toBe(getMine('bccl-moonidih')!.productionMtPerYr.value);
    expect(p.input!.drainedMm3PerYr).toBe(20);
    expect(p.estimate).toBeUndefined();
    expectGolden(run(p.input!).breakevenUsdPerT, 3.373114, 'usdPerT', 'Moonidih record break-even');
  });

  test('the Moonidih estimate is still available and is much dearer', () => {
    const e = estimateById('bccl-moonidih')!;
    expect(e.status).toBe('ok');
    expectGolden(run(e.input!).breakevenUsdPerT, 11.774879, 'usdPerT', 'Moonidih estimate break-even');
    expect(e.drainedMm3).toBeCloseTo(2.925, 6);
  });

  test('every other mine returns an estimate', () => {
    const p = pickMineInput('bccl-amp-colliery')!;
    expect(p.source).toBe('estimate');
    expect(p.estimate?.status).toBe('ok');
    expect(p.input).toEqual(p.estimate?.input);
  });

  test('an unknown id returns undefined', () => {
    expect(pickMineInput('no-such-mine')).toBeUndefined();
    expect(estimateById('no-such-mine')).toBeUndefined();
  });

  test('a record closure override applies', () => {
    expect(pickMineInput('bccl-moonidih', { closureYear: 2030 })!.input!.closureYear).toBe(2030);
  });
});

describe('overrides', () => {
  const mine = getEstimateMine('bccl-amp-colliery')!;
  const timeline = getTimeline()['bccl-amp-colliery']!;
  const params = getEstimationParams();
  const est = (o = {}) => estimateMineInput(mine, timeline, params, settings, o);

  test('with no overrides the estimate is the golden one', () => {
    expect(est().totalMm3).toBeCloseTo(23.7, 9);
  });

  test('degree changes the gas', () => {
    const e = est({ degree: 2 });
    expect(e.degree).toBe(2);
    expect(e.totalMm3).toBeCloseTo(1.58 * 5, 9);
    expect(e.input!.drainedConc).toBe(0.35);
  });

  test('output override changes the gas and the closure year can be set', () => {
    const e = est({ outputMtPerYr: 1, closureYear: 2030 });
    expect(e.totalMm3).toBeCloseTo(0.5 * 15, 9);
    expect(e.closureYear).toBe(2030);
    expect(e.activeYears).toBe(4);
    expect(e.input!.closureYear).toBe(2030);
  });

  test('a total methane override is split by the drained share', () => {
    const e = est({ totalMm3: 10 });
    expect(e.totalMm3).toBe(10);
    expect(e.drainedMm3).toBeCloseTo(5, 9);
    expect(e.vamMm3).toBeCloseTo(5, 9);
    expect(e.input!.drainedMm3PerYr).toBeCloseTo(5, 9);
    expect(e.specificEmission).toBeCloseTo(10 / 1.58, 9);
  });

  test('the effective rate times the output is the total, also for a mixed mine', () => {
    const input = est().input!;
    expect((input.productionMtPerYr as number) * input.specificEmissionM3PerT!).toBeCloseTo(23.7, 9);
  });

  test('a no-output mine models once output is entered', () => {
    const id = 'ecl-madhusudanpur-7-pit-incline';
    expect(estimateById(id)!.status).toBe('no_output');
    const e = estimateById(id, { outputMtPerYr: 0.2 })!;
    expect(e.status).toBe('ok');
    expect(e.input!.productionMtPerYr).toBe(0.2);
  });

  test('an opencast mine becomes abatable only when given a gassy degree', () => {
    const id = 'ecl-khottadih-ocp';
    expect(estimateById(id)!.status).toBe('not_abatable');
    const e = estimateById(id, { degree: 3 })!;
    expect(e.status).toBe('ok');
    expect(e.degree).toBe(3);
  });

  test('a closure year before the first model year is clamped and flagged', () => {
    const e = est({ closureYear: 2020 });
    expect(e.closureYear).toBe(settings.startYear);
    expect(e.activeYears).toBe(1);
    expect(e.warnings).toEqual(['closure_uncertain']);
  });

  test('a run-out past the window keeps the mine active for every year', () => {
    const e = estimateMineInput(mine, { ...timeline, runoutYear: null }, params, settings);
    expect(e.activeYears).toBe(settings.creditingYears);
    expect(e.input!.amm).toBeDefined();
  });
});

describe('speed', () => {
  test('evaluate runs 311 times in under 400 ms', () => {
    const input = estimateById('bccl-amp-colliery')!.input!;
    for (let i = 0; i < 50; i++) run(input); // warm up
    const t0 = performance.now();
    let checksum = 0;
    for (let i = 0; i < 311; i++) checksum += run(input, { creditPriceUsdPerT: 5 + (i % 30) }).npvUsd;
    const elapsedMs = performance.now() - t0;
    expect(Number.isFinite(checksum)).toBe(true);
    expect(elapsedMs, `311 runs took ${elapsedMs.toFixed(1)} ms`).toBeLessThan(400);
  });

  test('estimating and evaluating every mine takes under 400 ms', () => {
    const ids = getMapData().mines.map((m) => m.id);
    for (const id of ids.slice(0, 20)) estimateById(id); // warm up
    const t0 = performance.now();
    let checksum = 0;
    for (const id of ids) {
      const e = estimateById(id)!;
      if (e.input) checksum += run(e.input).npvUsd;
    }
    const elapsedMs = performance.now() - t0;
    expect(Number.isFinite(checksum)).toBe(true);
    expect(elapsedMs, `${ids.length} mines took ${elapsedMs.toFixed(1)} ms`).toBeLessThan(400);
  });
});

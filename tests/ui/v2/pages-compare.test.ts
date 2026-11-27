import { describe, expect, it } from 'vitest';
import golden from '../../golden/estimation_v2.json';
import { estimateById } from '../../../src/data/estimation';
import { evaluate } from '../../../src/model';
import {
  archetypeRows,
  compareBase,
  headlineFor,
  headlineSentence,
  modelMines,
  paysAt,
  subsidiaryCounts,
  supplyBarsV2,
} from '../../../src/v2/pages/compare/entries';
import { estimateKey } from '../../../src/v2/pages/estimateOverrides';
import type { Overrides } from '../../../src/state/session';

const NONE: Overrides = {};
const base = compareBase(NONE);
const view = (priceUsdPerT: number) => ({ ...base.defaults, priceUsdPerT });
const set = modelMines(base, view(15), NONE);

describe('modelMines', () => {
  it('models 58 mines: 57 estimated and Moonidih from its record', () => {
    console.info(`rows ${set.rows.length}, not abatable ${set.notAbatableCount}, no output ${set.noOutputCount}`);
    expect(set.mineCount).toBe(311);
    expect(set.rows).toHaveLength(golden.summary.by_status.ok);
    expect(set.rows.filter((r) => r.source === 'record').map((r) => r.id)).toEqual(['bccl-moonidih']);
    expect(set.noOutputCount).toBe(golden.summary.by_status.no_output);
  });

  it('is sorted cheapest first: Moonidih from its record, then AMP Colliery', () => {
    const be = set.rows.map((r) => r.breakevenUsdPerT);
    expect(be).toEqual([...be].sort((a, b) => a - b));
    expect(set.rows[0].id).toBe('bccl-moonidih');
    expect(set.rows[1].name).toBe('AMP Colliery');
    expect(set.rows[1].breakevenUsdPerT).toBeCloseTo(Number(golden.summary.cheapest[0][1]), 2);
  });

  it('uses the record for Moonidih, which is cheaper than its estimate', () => {
    const moonidih = set.rows.find((r) => r.id === 'bccl-moonidih')!;
    expect(moonidih.source).toBe('record');
    const estimate = estimateById('bccl-moonidih')!;
    const est = evaluate(estimate.input!, base.settings, base.tech, base.constants, base.costs);
    expect(est.breakevenUsdPerT).toBeCloseTo(11.77, 2);
    expect(moonidih.breakevenUsdPerT).toBeLessThan(est.breakevenUsdPerT!);
  });

  it('matches the golden counts when Moonidih is taken from its estimate', () => {
    const rows = set.rows.map((r) => {
      if (r.id !== 'bccl-moonidih') return r.breakevenUsdPerT;
      const e = estimateById('bccl-moonidih')!;
      return evaluate(e.input!, base.settings, base.tech, base.constants, base.costs).breakevenUsdPerT!;
    });
    expect(rows.filter((b) => b <= 15)).toHaveLength(golden.summary.pays_at_15);
    expect(rows.filter((b) => b <= 7)).toHaveLength(golden.summary.pays_at_7);
  });

  it('pays at 15 for 4 mines; at 7 the record makes it 2', () => {
    expect(set.rows.filter((r) => paysAt(r, 15))).toHaveLength(4);
    expect(set.rows.filter((r) => paysAt(r, 7)).map((r) => r.name)).toEqual(['Moonidih', 'AMP Colliery']);
  });

  it('an uploaded degree and methane value replace the estimate for that mine', () => {
    const overrides: Overrides = { [estimateKey('bccl-amp-colliery', 'degree')]: 1 };
    const changed = modelMines(base, view(15), overrides);
    expect(changed.rows.find((r) => r.id === 'bccl-amp-colliery')?.breakevenUsdPerT).not.toBeCloseTo(
      set.rows[0].breakevenUsdPerT,
      2,
    );
  });
});

describe('headline and bars', () => {
  it('builds the computed sentence', () => {
    const h = headlineFor(set.rows, 15, 10);
    expect(h.paying).toBe(4);
    expect(headlineSentence(h, '$15', 'mines')).toMatch(/^At \$15 a tonne, 4 of 58 mines break even, cutting \d+\.\d{2} MtCO2e over 10 years\.$/);
    expect(headlineSentence(headlineFor(set.rows, 0.5, 10), '$0.50', 'mines')).toBe(
      'At $0.50 a tonne, none of the 58 mines break even.',
    );
  });

  it('labels the 10 cheapest bars and stacks them left to right', () => {
    const bars = supplyBarsV2(set.rows, 15);
    expect(bars.filter((b) => b.labelled)).toHaveLength(10);
    expect(bars[1].startTco2e).toBeCloseTo(bars[0].erTco2e, 6);
  });

  it('counts mines by subsidiary and leaves archetypes out', () => {
    const counts = subsidiaryCounts([...set.rows, ...archetypeRows(view(15), NONE)]);
    expect(counts.reduce((s, c) => s + c.count, 0)).toBe(58);
    expect(counts.map((c) => c.subsidiary)).not.toContain('Archetype');
  });
});

describe('archetypes', () => {
  it('adds the abatable archetypes', () => {
    const rows = archetypeRows(view(15), NONE);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.source === 'archetype')).toBe(true);
  });

  it('gives archetype bars no link: they have no place on the map', () => {
    const rows = archetypeRows(view(15), NONE);
    const bars = supplyBarsV2([...set.rows, ...rows], 15);
    const archetypeIds = new Set(rows.map((r) => r.id));
    expect(bars.filter((b) => archetypeIds.has(b.id)).every((b) => !b.opens)).toBe(true);
    expect(bars.filter((b) => !archetypeIds.has(b.id)).every((b) => b.opens)).toBe(true);
  });
});

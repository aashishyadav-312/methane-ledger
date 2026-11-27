// Step 6: the home's pure parts (sheet physics, docking progress) and the panel's model base.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import golden from '../../golden/estimation_v2.json';
import { useMineModel } from '../../../src/pages/MinePage/useMineModel';
import { dockProgressAt } from '../../../src/v2/home/layout';
import {
  decodeChoices,
  encodeChoices,
  NO_CHOICES,
  panelBase,
  rebaseView,
  registryFor,
  timelineBases,
} from '../../../src/v2/panel/model';
import { nextSnap, project, rubberBand, snapFor, snapHeights, SHEET_PEEK_PX } from '../../../src/v2/panel/sheet';

const MOONIDIH = 'bccl-moonidih';
const AMP = 'bccl-amp-colliery';
const cases = golden.cases as unknown as Record<string, { type: string; modelStatus: string; breakeven?: number | null }>;
const OPENCAST = Object.entries(cases).find(([, c]) => c.type === 'OC' && c.modelStatus === 'not_abatable')![0];
const NO_OUTPUT = Object.entries(cases).find(([, c]) => c.modelStatus === 'no_output')![0];

describe('bottom sheet', () => {
  it('has three snap points inside the stage', () => {
    const h = snapHeights(844);
    expect(h.peek).toBe(SHEET_PEEK_PX);
    expect(h.half).toBe(422);
    expect(h.full).toBeGreaterThan(h.half);
    expect(h.full).toBeLessThan(844);
  });

  it('projects a release by its velocity and picks the nearest snap point to where it would rest', () => {
    const h = snapHeights(844);
    expect(project(0)).toBe(0);
    expect(project(1)).toBeCloseTo(499, 0);
    expect(snapFor(h.half + 10, 0, h)).toBe('half');
    expect(snapFor(h.half + 10, 1, h)).toBe('full');
    expect(snapFor(h.half - 10, -1, h)).toBe('peek');
  });

  it('rubber-bands past an edge: less than the pull, never more than the dimension', () => {
    expect(rubberBand(0, 100)).toBe(0);
    expect(rubberBand(50, 100)).toBeLessThan(50);
    expect(rubberBand(1e6, 100)).toBeLessThan(100);
    expect(rubberBand(-50, 100)).toBe(-rubberBand(50, 100));
  });

  it('cycles peek, half, full from the grabber', () => {
    expect([nextSnap('peek'), nextSnap('half'), nextSnap('full')]).toEqual(['half', 'full', 'peek']);
  });
});

describe('docking progress (Appendix E)', () => {
  it('is 0 until the results reach the bottom of the viewport and 1 when they reach the top', () => {
    expect(dockProgressAt(0, 900, 900)).toBe(0);
    expect(dockProgressAt(450, 900, 900)).toBe(0.5);
    expect(dockProgressAt(900, 900, 900)).toBe(1);
    expect(dockProgressAt(2000, 900, 900)).toBe(1);
    expect(dockProgressAt(10, 900, 0)).toBe(0);
  });
});

describe('panel base', () => {
  it('uses the measured record for Moonidih, with its golden break-even at the defaults', () => {
    const pb = panelBase(MOONIDIH, NO_CHOICES, {})!;
    expect(pb.picked.source).toBe('record');
    expect(pb.record?.id).toBe(MOONIDIH);
    const base = pb.base!;
    const { result } = renderHook(() => useMineModel(base, base.defaults));
    const curve = golden.closure_curve.moonidih_record.curve.power as Record<string, number>;
    expect(result.current.result.breakevenUsdPerT).toBeCloseTo(curve[String(base.defaults.closureYear)], 2);
  });

  it('builds the estimate for AMP Colliery, with its golden break-even at the defaults', () => {
    const pb = panelBase(AMP, NO_CHOICES, {})!;
    expect(pb.picked.source).toBe('estimate');
    const base = pb.base!;
    expect(base.bases[0].id).toBe('now');
    const { result } = renderHook(() => useMineModel(base, base.defaults));
    expect(result.current.result.breakevenUsdPerT).toBeCloseTo(cases[AMP].breakeven!, 2);
  });

  it('has no base for a mine it cannot model, until the panel sets the input that changes that', () => {
    const oc = panelBase(OPENCAST, NO_CHOICES, {})!;
    expect(oc.base).toBeNull();
    expect(oc.picked.reason).toBeTruthy();
    expect(panelBase(OPENCAST, { ...NO_CHOICES, degree: 3 }, {})!.base).not.toBeNull();

    const idle = panelBase(NO_OUTPUT, NO_CHOICES, {})!;
    expect(idle.picked.status).toBe('no_output');
    expect(panelBase(NO_OUTPUT, { ...NO_CHOICES, outputMtPerYr: 1, degree: 3 }, {})!.base).not.toBeNull();
  });

  it('scales a record to the total methane the panel sets', () => {
    const plain = panelBase(MOONIDIH, NO_CHOICES, {})!.base!;
    const scaled = panelBase(MOONIDIH, { ...NO_CHOICES, totalMm3: 11.92 }, {})!.base!;
    const total = (x: typeof plain.input) => Number(x.drainedMm3PerYr) + Number(x.vamMm3PerYr ?? 0);
    if (plain.input.vamMm3PerYr !== undefined) expect(total(scaled.input)).toBeCloseTo(11.92, 6);
    expect(Number(scaled.input.drainedMm3PerYr)).toBeLessThan(Number(plain.input.drainedMm3PerYr));
  });

  it('moves a control still on its old default to the new default, and keeps one the person set', () => {
    const a = panelBase(AMP, { ...NO_CHOICES, degree: 2 }, {})!.base!.defaults;
    const b = panelBase(AMP, { ...NO_CHOICES, degree: 3 }, {})!.base!.defaults;
    expect(a.vamConc).not.toBe(b.vamConc);
    const next = rebaseView({ ...a, priceUsdPerT: 22 }, a, b);
    expect(next.vamConc).toBe(b.vamConc);
    expect(next.priceUsdPerT).toBe(22);
  });

  it('offers the closure workbook bases a mine has, current output first', () => {
    const bases = timelineBases(MOONIDIH, 2034);
    expect(bases[0]).toEqual({ id: 'now', label: 'At current output', year: 2034 });
    expect(bases.map((b) => b.id)).toContain('target');
  });

  it('lists only the values the panel owns in an estimate’s mine group of the sheet', () => {
    const entries = registryFor(undefined);
    expect(entries.filter((e) => e.path.startsWith('mine.')).every((e) => e.view !== undefined)).toBe(true);
    expect(entries.length).toBeLessThan(registryFor(panelBase(MOONIDIH, NO_CHOICES, {})!.record).length);
  });
});

describe('link keys', () => {
  it('round-trips the panel choices and names the mine', () => {
    const choices = { outputMtPerYr: 1.25, degree: 2 as const, totalMm3: 40 };
    const q = encodeChoices(new URLSearchParams(), AMP, choices);
    expect(q.get('m')).toBe(AMP);
    expect(decodeChoices(q)).toEqual(choices);
  });

  it('drops values outside their range', () => {
    expect(decodeChoices(new URLSearchParams('out=-3&deg=7&tot=abc'))).toEqual(NO_CHOICES);
  });
});

import { describe, expect, test } from 'vitest';
import minesMap from '../../src/generated/mines_map.json';
import timeline from '../../src/generated/closure_timeline.json';

const mines = minesMap.mines;
interface TimelineEntry {
  runoutYear: number | null;
  runoutLabel: string;
  yearAtTarget: number | null;
  targetFy2627Mt: number | null;
  outputMt: { fy2324: number | null; fy2425: number | null; fy2526: number | null };
  note: string | null;
}
const { _meta: timelineMeta, ...timelineById } = timeline as unknown as { _meta: typeof timeline._meta } & Record<
  string,
  TimelineEntry
>;
const timelineMines = Object.entries(timelineById);

describe('src/generated/mines_map.json', () => {
  test('has 311 operating mines with unique ids', () => {
    expect(mines).toHaveLength(311);
    expect(new Set(mines.map((m) => m.id)).size).toBe(311);
  });

  test('band counts', () => {
    const counts: Record<string, number> = {};
    for (const m of mines) counts[m.band] = (counts[m.band] ?? 0) + 1;
    expect(counts).toEqual({ by2031: 55, by2036: 25, by2050: 44, after2050: 142, nodate: 45 });
    expect(minesMap.bands).toEqual({ by2031: 55, by2036: 25, by2050: 44, after2050: 142, nodate: 45, closed: 315 });
  });

  test('315 closed mines', () => {
    expect(minesMap.closed).toHaveLength(315);
  });

  test('mine types', () => {
    const types: Record<string, number> = {};
    for (const m of mines) types[m.type] = (types[m.type] ?? 0) + 1;
    expect(types).toEqual({ OC: 168, UG: 130, Mixed: 13 });
  });

  test('Moonidih', () => {
    const m = mines.find((x) => x.id === 'bccl-moonidih');
    expect(m).toBeDefined();
    expect(m?.runoutYear).toBe(2034);
    expect(m?.band).toBe('by2036');
    expect(m?.modelled).toBe(true);
    expect(m?.x).toBeCloseTo(561.0, 0);
    expect(m?.y).toBeCloseTo(444.3, 0);
    expect(mines.filter((x) => x.modelled)).toHaveLength(1);
  });

  test('every position is inside the view box', () => {
    const [, , w, h] = minesMap.viewBox;
    expect([w, h]).toEqual([906, 1016]);
    for (const p of [...mines, ...minesMap.closed]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(h);
    }
  });

  test('geography, cities, lens and metadata', () => {
    expect(minesMap.outline.startsWith('M')).toBe(true);
    expect(minesMap.coalStates).toHaveLength(10);
    expect(minesMap.cities.map((c) => c.name)).toEqual(['New Delhi', 'Mumbai', 'Kolkata', 'Ranchi', 'Nagpur']);
    expect(minesMap.lens.box).toEqual([612, 596, 232]);
    expect(minesMap.note).toContain('Positions approximate');
    expect(minesMap.sources.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(minesMap.generatedAt))).toBe(false);
  });
});

describe('src/generated/closure_timeline.json', () => {
  test('has one entry per mine, keyed by the same ids', () => {
    expect(timelineMines).toHaveLength(311);
    expect(timelineMines.map(([k]) => k).sort()).toEqual(mines.map((m) => m.id).sort());
  });

  test('carries generatedAt, sources and note', () => {
    const meta = timelineMeta;
    expect(Number.isNaN(Date.parse(meta.generatedAt))).toBe(false);
    expect(meta.sources.length).toBeGreaterThan(0);
    expect(meta.note).toContain('FY2025-26');
  });

  test('Moonidih', () => {
    const m = timelineById['bccl-moonidih'];
    expect(m.runoutYear).toBe(2034);
    expect(m.yearAtTarget).toBe(2030);
    expect(m.targetFy2627Mt).toBe(0.85);
    expect(m.outputMt.fy2526).toBe(0.39);
  });

  test('Tikak Colliery carries its data-quality note', () => {
    const tikak = mines.find((m) => m.name === 'Tikak Colliery');
    expect(tikak).toBeDefined();
    const entry = timelineMines.find(([k]) => k === tikak?.id)?.[1];
    expect(entry?.note).toContain('data-entry error');
  });

  test('run-out year agrees with the map file', () => {
    for (const m of mines) {
      const t = timelineMines.find(([k]) => k === m.id)?.[1];
      expect(t?.runoutYear).toBe(m.runoutYear);
      expect(t?.runoutLabel).toBe(m.runoutLabel);
    }
  });
});

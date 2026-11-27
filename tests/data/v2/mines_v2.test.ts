import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import minesV1 from '../../../src/generated/mines_map.json';
import minesV2 from '../../../src/generated/v2/mines_v2.json';

const jsonPath = fileURLToPath(new URL('../../../src/generated/v2/mines_v2.json', import.meta.url));
const mines = minesV2.mines;
const MAX_JSON_BYTES = 220_000;
const COS_LAT0 = Math.cos((22 * Math.PI) / 180);

describe('src/generated/v2/mines_v2.json', () => {
  test('has 311 mines and 315 closed mines', () => {
    expect(mines).toHaveLength(311);
    expect(minesV2.closedMines).toHaveLength(315);
  });

  test('ids equal the v1 ids, in the same order', () => {
    expect(mines.map((m) => m.id)).toEqual(minesV1.mines.map((m) => m.id));
    expect(new Set(mines.map((m) => m.id)).size).toBe(311);
  });

  test('every position is inside the view box', () => {
    expect(minesV2.viewBox).toEqual([0, 0, 906, 1016]);
    for (const p of [...mines, ...minesV2.closedMines]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(906);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1016);
    }
  });

  test('band counts are unchanged from v1', () => {
    const counts: Record<string, number> = {};
    for (const m of mines) counts[m.band] = (counts[m.band] ?? 0) + 1;
    expect(counts).toEqual({ by2031: 55, by2036: 25, by2050: 44, after2050: 142, nodate: 45 });
    expect(minesV2.bands).toEqual(minesV1.bands);
  });

  test('closed mines keep their v1 positions', () => {
    expect(minesV2.closedMines).toEqual(minesV1.closed);
  });

  test('Moonidih sits at its GEM point', () => {
    const m = mines.find((x) => x.id === 'bccl-moonidih');
    expect(m?.positionQuality).toBe('gem');
    expect(Math.abs((m?.lat ?? 0) - 23.7409)).toBeLessThanOrEqual(0.002);
    expect(Math.abs((m?.lon ?? 0) - 86.3525)).toBeLessThanOrEqual(0.002);
    expect(m?.x).toBeCloseTo(561.4, 0);
    expect(m?.y).toBeCloseTo(444.2, 0);
  });

  test('a GEM position is the v1 projection of its latitude and longitude', () => {
    const gem = mines.filter((m) => m.positionQuality === 'gem');
    expect(gem.length).toBeGreaterThan(311 / 2);
    for (const m of gem) {
      expect(m.lat).not.toBeNull();
      expect(m.lon).not.toBeNull();
      expect(m.gemId).toMatch(/^M\d+$/);
      expect(Math.abs((m.lon as number) - 68) * COS_LAT0 * 33 - m.x).toBeLessThan(0.2);
      expect(Math.abs((37.2 - (m.lat as number)) * 33 - m.y)).toBeLessThan(0.2);
    }
  });

  test('a coalfield position has no coordinates and no GEM data', () => {
    const rest = mines.filter((m) => m.positionQuality === 'coalfield');
    for (const m of rest) {
      expect(m.lat).toBeNull();
      expect(m.lon).toBeNull();
      expect(m.gemId).toBeNull();
      expect(m.gemMethaneMm3).toBeNull();
      const v1 = minesV1.mines.find((x) => x.id === m.id);
      expect([m.x, m.y]).toEqual([v1?.x, v1?.y]);
    }
  });

  test('GEM methane is million m3 a year, or null', () => {
    for (const m of mines) {
      if (m.gemMethaneMm3 !== null) {
        expect(m.gemMethaneMm3).toBeGreaterThanOrEqual(0);
        expect(m.gemMethaneMm3).toBeLessThan(1000);
      }
    }
    expect(mines.find((m) => m.id === 'bccl-moonidih')?.gemMethaneMm3).toBeCloseTo(11.92, 2);
  });

  test('degree estimate: opencast has none, others have 1 to 3', () => {
    for (const m of mines) {
      if (m.type === 'OC') expect(m.degreeEstimate).toBeNull();
      else expect([1, 2, 3]).toContain(m.degreeEstimate);
    }
    expect(mines.find((m) => m.id === 'bccl-moonidih')?.degreeEstimate).toBe(3);
  });

  test('search keys are lower case, plain words, and never empty', () => {
    for (const m of mines) {
      expect(m.searchKey).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
    }
    expect(mines.find((m) => m.id === 'bccl-moonidih')?.searchKey).toBe('moonidih');
  });

  test('every mine carries the MineV2 fields and a known coalfield name', () => {
    const fields = [
      'id', 'name', 'company', 'state', 'type', 'field', 'band', 'runoutYear', 'runoutLabel', 'x', 'y', 'lat', 'lon',
      'positionQuality', 'gemMethaneMm3', 'searchKey',
    ];
    for (const m of mines) {
      for (const f of fields) expect(m).toHaveProperty(f);
      expect(['UG', 'OC', 'Mixed']).toContain(m.type);
      expect(['gem', 'coalfield']).toContain(m.positionQuality);
      expect(Object.keys(minesV2.coalfieldNames)).toContain(m.field);
    }
  });

  test('the outline is its own single path, apart from the coal states', () => {
    expect(minesV2.outline.startsWith('M')).toBe(true);
    expect(minesV2.coalStates.length).toBeGreaterThan(0);
    expect(minesV2.outline).toBe(minesV1.outline);
  });

  test(`the file is under ${MAX_JSON_BYTES} bytes`, () => {
    expect(statSync(jsonPath).size).toBeLessThan(MAX_JSON_BYTES);
  });
});

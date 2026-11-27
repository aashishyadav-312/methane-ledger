// Test-harness emitters only (not shipped; the home page passes real estimates from Step 2).
// Uses the v1 map positions and the v2 golden gassiness table, at one nominal output for every mine,
// so the harness shows the right shape of haze (thicker over Jharia and Raniganj) before Step 2 lands.
import golden from '../../../../tests/golden/estimation_v2.json';
import mapData from '../../../generated/mines_map.json';
import { emittersFromSources, type EmitterSource, type SmogEmitter } from '../strength';

/** One nominal output for every mine, Mt a year. Harness only. */
export const DEMO_OUTPUT_MT_PER_YR = 1;

interface V1Mine {
  id: string;
  type: 'UG' | 'OC' | 'Mixed';
  field: string;
  x: number;
  y: number;
}
interface V1Closed {
  name: string;
  field: string;
  x: number;
  y: number;
}

export const demoViewBox = mapData.viewBox as [number, number, number, number];
export const demoMap = mapData;

export function demoEmitters(): SmogEmitter[] {
  const p = golden.params;
  const degreeByField = p.DEGREE_BY_FIELD as Record<string, number>;
  const byDegree = p.BY_DEGREE as Record<string, { se: number }>;
  const sources: EmitterSource[] = (mapData.mines as V1Mine[]).map((m) => {
    const degree = degreeByField[m.field] ?? p.DEFAULT_DEGREE;
    const ugShare = m.type === 'UG' ? 1 : m.type === 'Mixed' ? p.MIXED_UG_SHARE : 0;
    const methane = DEMO_OUTPUT_MT_PER_YR * ugShare * byDegree[String(degree)].se;
    return { id: m.id, x: m.x, y: m.y, methaneMm3PerYr: methane, floor: ugShare === 0 || degree === 1 };
  });
  (mapData.closed as V1Closed[]).forEach((c, i) =>
    sources.push({ id: `closed-${i}`, x: c.x, y: c.y, methaneMm3PerYr: null, closed: true }),
  );
  return emittersFromSources(sources);
}

/** Screen-space test points: the centre of Jharia, and a point in Rajasthan (no coal mines), in map units. */
export function demoProbePoints() {
  const { k, lat0, lonMin, latMax } = mapData.projection;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const project = (lon: number, lat: number) => ({ x: (lon - lonMin) * cos * k, y: (latMax - lat) * k });
  const jharia = (mapData.mines as V1Mine[]).filter((m) => m.field === 'jharia');
  return {
    jharia: {
      x: jharia.reduce((a, m) => a + m.x, 0) / jharia.length,
      y: jharia.reduce((a, m) => a + m.y, 0) / jharia.length,
    },
    // Jodhpur, Rajasthan.
    rajasthan: project(73.02, 26.24),
  };
}

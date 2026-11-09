import type { MapData, MapMine } from '../../data/schemas';
import { DRAW_ORDER } from './bands';

/** Dot radii in viewBox units. Main map: DESIGN.md › Map. Lens: design/Main.dc.html. */
export const DOT_R = {
  operating: 3.1,
  closed: 2.3,
  nodate: 2.6,
  start: 4.6,
} as const;

export const LENS_DOT_R = {
  operating: 4.2,
  closed: 3.4,
  nodate: 3.5,
  start: 6,
  startRing: 11,
} as const;

export type ClosedMine = MapData['closed'][number];

export type HoverTarget = { kind: 'mine'; mine: MapMine } | { kind: 'closed'; mine: ClosedMine };

/** One place a mine is drawn: on the main map, or again inside the lens. */
export interface DrawnPoint {
  key: string;
  x: number;
  y: number;
  target: HoverTarget;
}

export interface Lens {
  /** Window on the main map: x, y, width, height. */
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  /** Box the window is redrawn in: x, y, width, height. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  scale: number;
}

export function lensOf(data: Pick<MapData, 'lens'>): Lens {
  const [wx, wy, ww, wh] = data.lens.window;
  const [bx, by, bw] = data.lens.box;
  const scale = bw / ww;
  return { wx, wy, ww, wh, bx, by, bw, bh: wh * scale, scale };
}

export function inWindow(lens: Lens, x: number, y: number): boolean {
  return x >= lens.wx && x <= lens.wx + lens.ww && y >= lens.wy && y <= lens.wy + lens.wh;
}

export function toLens(lens: Lens, x: number, y: number): [number, number] {
  return [lens.bx + (x - lens.wx) * lens.scale, lens.by + (y - lens.wy) * lens.scale];
}

/** Operating mines in draw order, back to front, with the start mine left out. */
export function minesInDrawOrder(mines: readonly MapMine[], startId: string): MapMine[] {
  const rank = new Map(DRAW_ORDER.map((band, i) => [band, i]));
  return mines.filter((m) => m.id !== startId).sort((a, b) => (rank.get(a.band) ?? 0) - (rank.get(b.band) ?? 0));
}

/** Every hoverable point, on the map and in the lens. */
export function hoverPoints(data: MapData): DrawnPoint[] {
  const lens = lensOf(data);
  const points: DrawnPoint[] = [];
  const add = (key: string, x: number, y: number, target: HoverTarget) => {
    points.push({ key, x, y, target });
    if (inWindow(lens, x, y)) {
      const [lx, ly] = toLens(lens, x, y);
      points.push({ key: `${key}@lens`, x: lx, y: ly, target });
    }
  };
  data.closed.forEach((mine, i) => add(`closed-${i}`, mine.x, mine.y, { kind: 'closed', mine }));
  data.mines.forEach((mine) => add(mine.id, mine.x, mine.y, { kind: 'mine', mine }));
  return points;
}

/** The point nearest (x, y) within `radius`, preferring later points (drawn on top) on a tie. */
export function nearestPoint(points: readonly DrawnPoint[], x: number, y: number, radius: number): DrawnPoint | null {
  let best: DrawnPoint | null = null;
  let bestD2 = radius * radius;
  for (const p of points) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 <= bestD2) {
      best = p;
      bestD2 = d2;
    }
  }
  return best;
}

/** Where to point at a mine from the table: its lens copy when it has one, as the lens is easier to read. */
export function pointForMine(data: MapData, mine: MapMine): { x: number; y: number } {
  const lens = lensOf(data);
  if (inWindow(lens, mine.x, mine.y)) {
    const [x, y] = toLens(lens, mine.x, mine.y);
    return { x, y };
  }
  return { x: mine.x, y: mine.y };
}

/** Percent position of a viewBox point inside the map frame, for HTML laid over the SVG. */
export function percentOf(data: Pick<MapData, 'viewBox'>, x: number, y: number): { left: string; top: string } {
  const [vx, vy, vw, vh] = data.viewBox;
  return { left: `${((x - vx) / vw) * 100}%`, top: `${((y - vy) / vh) * 100}%` };
}

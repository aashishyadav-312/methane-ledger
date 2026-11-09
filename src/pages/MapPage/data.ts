import minesJson from '../../../data/mines.json';
import minesMapJson from '../../generated/mines_map.json';
import { MapDataSchema, MineRecordsSchema, type MapData, type MineRecord } from '../../data/schemas';
import { parseData } from '../../data/validate';

/*
 * The map page validates only the two files it reads, with the shared schemas, rather than calling `loadAll()` in
 * `src/data/load.ts`. `loadAll()` validates every data file at import, and today it throws on the `_meta` key in
 * `closure_timeline.json`; going through it would take the whole app down with it. Switch to `getMapData()` and
 * `getMine()` once that is fixed (see the Step 5 PR, "Needs from other steps").
 */
let cache: { map: MapData; mines: MineRecord[] } | null = null;

function load() {
  cache ??= {
    map: parseData('src/generated/mines_map.json', MapDataSchema, minesMapJson),
    mines: parseData('data/mines.json', MineRecordsSchema, minesJson),
  };
  return cache;
}

export function mapData(): MapData {
  return load().map;
}

export function mineRecord(id: string): MineRecord | undefined {
  return load().mines.find((m) => m.id === id);
}

import type { Constants, CostParams, MineInput, Settings, TechLibrary } from '../model/types';
import constantsJson from '../../data/constants.json';
import costsJson from '../../data/costs.json';
import minesJson from '../../data/mines.json';
import pricesJson from '../../data/prices.json';
import settingsJson from '../../data/settings.default.json';
import technologiesJson from '../../data/technologies.json';
import closureTimelineJson from '../generated/closure_timeline.json';
import minesMapJson from '../generated/mines_map.json';
import {
  ClosureTimelineSchema,
  ConstantsRecordSchema,
  CostsRecordSchema,
  MapDataSchema,
  MineRecordsSchema,
  PriceScenariosSchema,
  SettingsFileSchema,
  TechRecordSchema,
  type ClosureTimeline,
  type ConstantsRecord,
  type CostsRecord,
  type MapData,
  type MineRecord,
  type PriceScenario,
  type CostModelRecord,
  type SettingsRecord,
  type TechRecord,
} from './schemas';
import { unwrap } from './unwrap';
import { DataValidationError, parseData } from './validate';

export interface DataBundle {
  mines: MineRecord[];
  tech: TechRecord;
  prices: PriceScenario[];
  constants: ConstantsRecord;
  settings: SettingsRecord;
  costModel: CostModelRecord;
  costs: CostsRecord;
  timeline: ClosureTimeline;
  map: MapData;
}

/** Validates every data file. Throws a `DataValidationError` naming the first bad file. */
export function loadAll(): DataBundle {
  const { costModel, ...settings } = parseData('data/settings.default.json', SettingsFileSchema, settingsJson);
  return {
    mines: parseData('data/mines.json', MineRecordsSchema, minesJson),
    tech: parseData('data/technologies.json', TechRecordSchema, technologiesJson),
    prices: parseData('data/prices.json', PriceScenariosSchema, pricesJson),
    constants: parseData('data/constants.json', ConstantsRecordSchema, constantsJson),
    settings,
    costModel,
    costs: parseData('data/costs.json', CostsRecordSchema, costsJson),
    timeline: parseData('src/generated/closure_timeline.json', ClosureTimelineSchema, closureTimelineJson),
    map: parseData('src/generated/mines_map.json', MapDataSchema, minesMapJson),
  };
}

// Validated once, when the app starts (and when the first test imports this module).
const DATA = loadAll();

const MINES_BY_ID = new Map(DATA.mines.map((m) => [m.id, m]));

export function getMine(id: string): MineRecord | undefined {
  return MINES_BY_ID.get(id);
}

export function listMines(): MineRecord[] {
  return DATA.mines;
}

/** The technology library as plain numbers, for `evaluate`. */
export function getTech(): TechLibrary {
  return unwrap(DATA.tech);
}

/** The technology library with unit, source and quality, for the Assumptions page. */
export function getTechRecord(): TechRecord {
  return DATA.tech;
}

export function getPrices(): PriceScenario[] {
  return DATA.prices;
}

/**
 * The default settings as plain numbers. `costModel` is the file's cost basis ("buildup"), so a page that passes
 * `getCosts()` to the model gets the India cost build-up. Set `costModel: 'v1'` to get v1's all-in unit costs.
 */
export function getSettings(): Settings {
  return getDefaultSettings();
}

/** The default settings exactly as `data/settings.default.json` has them, including the cost basis ("buildup"). */
export function getDefaultSettings(): Settings {
  return { ...unwrap(DATA.settings), costModel: unwrap(DATA.costModel) };
}

export function getCostModelRecord(): CostModelRecord {
  return DATA.costModel;
}

export function getSettingsRecord(): SettingsRecord {
  return DATA.settings;
}

/** The cost build-up parameters as plain numbers, for `evaluate` (pass them when `settings.costModel` is "buildup"). */
export function getCosts(): CostParams {
  return unwrap(DATA.costs);
}

/** The cost build-up parameters with unit, source and quality, for the Assumptions page. */
export function getCostsRecord(): CostsRecord {
  return DATA.costs;
}

export function getConstants(): Constants {
  return unwrap(DATA.constants);
}

export function getConstantsRecord(): ConstantsRecord {
  return DATA.constants;
}

export function getTimeline(): ClosureTimeline {
  return DATA.timeline;
}

export function getMapData(): MapData {
  return DATA.map;
}

/**
 * Turns a wrapped mine record into the plain `MineInput` that `evaluate` takes.
 * A closure year of `{ from: 'timeline' }` is filled from the closure timeline (run-out year at FY2025-26 output).
 * `overrides` are applied last, for example `{ closureYear: 2030 }` for the FY2026-27 target basis.
 */
export function unwrapMine(
  record: MineRecord,
  timeline: ClosureTimeline,
  overrides: Partial<MineInput> = {},
): MineInput {
  const closureYear =
    'from' in record.closureYear ? timelineClosureYear(record.id, timeline) : record.closureYear.value;
  const plain = unwrap({
    productionMtPerYr: record.productionMtPerYr,
    specificEmissionM3PerT: record.specificEmissionM3PerT,
    drainedMm3PerYr: record.drainedMm3PerYr,
    drainedShare: record.drainedShare,
    drainedConc: record.drainedConc,
    vamMm3PerYr: record.vamMm3PerYr,
    vamConc: record.vamConc,
    vamAirflowM3s: record.vamAirflowM3s,
    hasDrainageSystem: record.hasDrainageSystem,
    powerOfftake: record.powerOfftake,
    captureEff: record.captureEff,
    amm: record.amm,
    destructionMandated: record.destructionMandated,
  });
  const input: MineInput = { id: record.id, name: record.name, closureYear, ...plain };
  if (record.techOverride !== undefined) {
    input.techOverride = Object.fromEntries(Object.entries(record.techOverride).filter(([, v]) => v !== undefined));
  }
  return { ...input, ...overrides };
}

function timelineClosureYear(id: string, timeline: ClosureTimeline): number {
  const entry = timeline[id];
  if (entry === undefined) {
    throw new DataValidationError('src/generated/closure_timeline.json', [
      { path: id, message: `no entry for "${id}", but its mine record takes its closure year from the timeline` },
    ]);
  }
  if (entry.runoutYear === null) {
    throw new DataValidationError('src/generated/closure_timeline.json', [
      {
        path: `${id}.runoutYear`,
        message: `expected a year, found null (${entry.runoutLabel}); give the mine record its own closureYear`,
      },
    ]);
  }
  return entry.runoutYear;
}

/** The plain model input for a mine in the bundled data, or `undefined` for an unknown id. */
export function getMineInput(id: string, overrides: Partial<MineInput> = {}): MineInput | undefined {
  const record = getMine(id);
  return record === undefined ? undefined : unwrapMine(record, DATA.timeline, overrides);
}

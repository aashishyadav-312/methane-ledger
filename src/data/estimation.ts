// Estimated inputs for every mine (PLAN_V2 Step 2): the parameter file, its schema, and the choice between a
// measured record and an estimate. The model itself is `src/model/estimate.ts`.

import { z } from 'zod';
import estimationJson from '../../data/estimation.json';
import { estimateMineInput } from '../model/estimate';
import type {
  EstimateMine,
  EstimateOverrides,
  EstimateResult,
  EstimateStatus,
  EstimateWarning,
  EstimationParams,
  GassinessDegree,
  MineInput,
  Settings,
} from '../model/types';
import { getDefaultSettings, getMapData, getMine, getMineInput, getTimeline } from './load';
import { field } from './schemas';
import { unwrap, type Unwrap } from './unwrap';
import { parseData } from './validate';

const fraction = z.number().min(0).max(1);
const degree = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const DegreeParamsSchema = z.strictObject({
  specificEmissionM3PerT: field(z.number().min(0)),
  drainedShare: field(fraction),
  drainedConc: field(fraction),
  vamConc: field(fraction),
});

export const EstimationRecordSchema = z.strictObject({
  degreeByField: field(z.record(z.string().min(1), degree)),
  defaultDegree: field(degree),
  byDegree: z.strictObject({ '1': DegreeParamsSchema, '2': DegreeParamsSchema, '3': DegreeParamsSchema }),
  opencastSpecificEmissionM3PerT: field(z.number().min(0)),
  mixedUndergroundShare: field(fraction),
  afterClosure: z.strictObject({ fAmm: field(fraction), conc: field(fraction) }),
  captureEff: z.strictObject({ drained: field(fraction), vam: field(fraction), amm: field(fraction) }),
  oxidiserMinVamConc: field(fraction),
});
/** `data/estimation.json` with unit, source and quality, for the Assumptions page. */
export type EstimationRecord = z.infer<typeof EstimationRecordSchema>;

const RECORD: EstimationRecord = parseData('data/estimation.json', EstimationRecordSchema, estimationJson);
const PARAMS: EstimationParams = unwrap(RECORD) satisfies Unwrap<EstimationRecord>;

/** The estimation parameters as plain numbers, for `estimateMineInput`. */
export function getEstimationParams(): EstimationParams {
  return PARAMS;
}

export function getEstimationRecord(): EstimationRecord {
  return RECORD;
}

/* ---------- picking an input for one mine ---------- */

export interface PickedMineInput {
  /** `record`: measured data in `data/mines.json` (it beats an estimate). `estimate`: built from output and closure year. */
  source: 'record' | 'estimate';
  /** The model input; null when the mine cannot be modelled (`status` is not `ok`). */
  input: MineInput | null;
  status: EstimateStatus;
  reason?: string;
  warnings: EstimateWarning[];
  /** Gassiness grade: the record's DGMS degree, or the estimate's. */
  degree: GassinessDegree | null;
  /** The estimate behind `input`; undefined for a record. */
  estimate?: EstimateResult;
}

let mineIndex: Map<string, EstimateMine> | undefined;

/** The mine as the estimate needs it, from the map data; undefined for an unknown id. */
export function getEstimateMine(id: string): EstimateMine | undefined {
  mineIndex ??= new Map(
    getMapData().mines.map((m) => [
      m.id,
      { id: m.id, name: m.name, type: m.type === 'OC' || m.type === 'Mixed' ? m.type : 'UG', field: m.field },
    ]),
  );
  return mineIndex.get(id);
}

/**
 * Estimated input for one mine, ignoring any record. Undefined for an unknown id. `settings` defaults to the
 * default settings (start year and crediting years are all it reads).
 */
export function estimateById(
  id: string,
  overrides: EstimateOverrides = {},
  settings: Pick<Settings, 'startYear' | 'creditingYears'> = getDefaultSettings(),
): EstimateResult | undefined {
  const mine = getEstimateMine(id);
  const timeline = getTimeline()[id];
  if (mine === undefined || timeline === undefined) return undefined;
  return estimateMineInput(mine, timeline, PARAMS, settings, overrides);
}

/**
 * Measured beats estimated: a mine with a record in `data/mines.json` (Moonidih) returns the record's input with
 * `source: 'record'`. Every other mine returns its estimate with `source: 'estimate'`.
 *
 * For a record only `overrides.closureYear` applies here; the panel edits the record's other fields on the
 * returned `MineInput` itself. For an estimate, every override applies. Undefined for an unknown id.
 */
export function pickMineInput(
  id: string,
  overrides: EstimateOverrides = {},
  settings: Pick<Settings, 'startYear' | 'creditingYears'> = getDefaultSettings(),
): PickedMineInput | undefined {
  const record = getMine(id);
  if (record !== undefined && getEstimateMine(id) !== undefined) {
    const input = getMineInput(id, overrides.closureYear === undefined ? {} : { closureYear: overrides.closureYear });
    if (input === undefined) return undefined;
    return { source: 'record', input, status: 'ok', warnings: [], degree: record.dgmsDegree };
  }
  const estimate = estimateById(id, overrides, settings);
  if (estimate === undefined) return undefined;
  const { input, status, reason, warnings, degree: grade } = estimate;
  return { source: 'estimate', input, status, ...(reason === undefined ? {} : { reason }), warnings, degree: grade, estimate };
}

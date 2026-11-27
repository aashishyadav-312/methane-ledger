// Uploaded values for an estimated mine (Data page). They are session overrides under `estimate.<mine id>.<field>`,
// kept apart from the `mine.<id>.*` keys that change a measured record, and read back as `EstimateOverrides`.
import type { EstimateOverrides, GassinessDegree } from '../../model/types';
import type { Overrides } from '../../state/session';

export const ESTIMATE_PREFIX = 'estimate';

/** The estimate fields an upload can set. */
export type EstimateField = 'closureYear' | 'outputMtPerYr' | 'degree' | 'totalMm3';

export const estimateKey = (mineId: string, field: EstimateField): string => `${ESTIMATE_PREFIX}.${mineId}.${field}`;

const isDegree = (x: unknown): x is GassinessDegree => x === 1 || x === 2 || x === 3;

/** The overrides an upload set for one estimated mine; an empty object when there are none. */
export function estimateOverridesFor(mineId: string, overrides: Overrides): EstimateOverrides {
  const out: EstimateOverrides = {};
  const closureYear = overrides[estimateKey(mineId, 'closureYear')];
  const outputMtPerYr = overrides[estimateKey(mineId, 'outputMtPerYr')];
  const degree = overrides[estimateKey(mineId, 'degree')];
  const totalMm3 = overrides[estimateKey(mineId, 'totalMm3')];
  if (typeof closureYear === 'number') out.closureYear = closureYear;
  if (typeof outputMtPerYr === 'number') out.outputMtPerYr = outputMtPerYr;
  if (isDegree(degree)) out.degree = degree;
  if (typeof totalMm3 === 'number') out.totalMm3 = totalMm3;
  return out;
}

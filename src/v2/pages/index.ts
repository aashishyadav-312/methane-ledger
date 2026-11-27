// The v2 About pages, Compare and Data (PLAN_V2 Step 8). Each is a route view inside the v2 shell.
export { AssumptionsV2 } from './assumptions/AssumptionsV2';
export { CompareV2, InputsTag } from './compare/CompareV2';
export { DataV2 } from './data/DataV2';
export { MethodV2 } from './method/MethodV2';
export { SourcesV2 } from './sources/SourcesV2';
/**
 * Uploaded values for an estimated mine, as the estimate takes them. The mine view reads these so a value uploaded
 * on the Data page applies there as well as on Compare: `pickMineInput(id, estimateOverridesFor(id, getOverrides()))`.
 */
export { ESTIMATE_PREFIX, estimateOverridesFor } from './estimateOverrides';

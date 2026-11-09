/**
 * Compile-time check that the validated data matches the contract in `src/model/types.ts`.
 * Nothing imports this file; `npm run typecheck` fails if the schemas and the contract drift apart.
 */
import type { Constants, CostParams, Field, MineInput, Quality, Settings, TechLibrary } from '../model/types';
import type { ConstantsRecord, CostsRecord, MineRecord, SettingsRecord, TechRecord } from './schemas';
import { QualitySchema } from './schemas';
import type { Unwrap } from './unwrap';
import type { z } from 'zod';

type QualityFromSchema = z.infer<typeof QualitySchema>;
type Both<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type MustBeTrue<T extends true> = T;

/** The schema and the contract list the same four quality values. */
export type QualityMatches = MustBeTrue<Both<QualityFromSchema, Quality>>;

export interface ContractInputs {
  constants: Unwrap<ConstantsRecord>;
  tech: Unwrap<TechRecord>;
  settings: Unwrap<SettingsRecord>;
  costs: Unwrap<CostsRecord>;
  mine: MineInput;
  wrappedYear: Extract<MineRecord['closureYear'], { value: number }>;
  wrappedProduction: MineRecord['productionMtPerYr'];
  wrappedFlag: MineRecord['hasDrainageSystem'];
}

export function contractChecks(x: ContractInputs) {
  return {
    constants: x.constants satisfies Constants,
    tech: x.tech satisfies TechLibrary,
    settings: x.settings satisfies Settings,
    costs: x.costs satisfies CostParams,
    mine: x.mine satisfies MineInput,
    wrappedYear: x.wrappedYear satisfies Field,
    wrappedProduction: x.wrappedProduction satisfies Field<number | number[]>,
    wrappedFlag: x.wrappedFlag satisfies Field<boolean>,
  };
}

// What the page shows for each financing structure, read from `financing()` (Appendix B8). Every number here is
// a value from the model; this file only picks which one belongs where.
import { paybackIndex } from '../../model';
import type { FinancingResult, StructureBase } from '../../model/financing';
import type { StructureKey } from './pageState';

export interface StructureView {
  key: StructureKey;
  /** Coal India's cash: index 0 is the build year, then one entry per crediting year. */
  cashUsd: number[];
  /** Running total of `cashUsd`. */
  cumCashUsd: number[];
  npvUsd: number;
  irr: number | null;
  /** What Coal India pays at the start (minus the first entry of its cash flow); 0 or less means nothing. */
  upfrontUsd: number;
  /** Index into `cashUsd` where the running total first reaches 0; `null` when it never does or nothing was paid. */
  paybackIndex: number | null;
  /** Lowest credit price at which the structure goes ahead; `null` when there is nothing to credit. */
  breakevenUsdPerT: number | null;
}

function running(xs: number[]): number[] {
  let sum = 0;
  return xs.map((x) => (sum += x));
}

export function structureView(fin: FinancingResult, key: StructureKey): StructureView {
  const s: StructureBase = fin[key];
  const upfrontUsd = -(s.cilCashUsd[0] ?? 0);
  return {
    key,
    cashUsd: s.cilCashUsd,
    cumCashUsd: running(s.cilCashUsd),
    npvUsd: s.cilNpvUsd,
    irr: s.cilIrr,
    upfrontUsd,
    paybackIndex: upfrontUsd > 0 ? paybackIndex(s.cilCashUsd) : null,
    breakevenUsdPerT: s.breakevenUsdPerT,
  };
}

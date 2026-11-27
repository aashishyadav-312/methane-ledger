import { evaluate } from './evaluate';
import type { ClosureCurve, Constants, CostParams, MineInput, Settings, Tech, TechLibrary } from './types';

/**
 * PLAN_V2 Appendix C: break-even price for each closure year y from the first model year to the last year of the
 * crediting window, with drained and after-closure gas to power and again to a flare. Everything else stays as in
 * `input` and `settings`. The crossover year is the first y where power is at or below flare.
 *
 * It calls `evaluate` for every year and technology (2 x N runs). The mine's own closure year in `input` is ignored.
 */
export function closureCurve(
  input: MineInput,
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
  costs?: CostParams,
): ClosureCurve {
  const years = Array.from({ length: settings.creditingYears }, (_, i) => settings.startYear + i);
  const breakeven = (closureYear: number, to: Tech): number | null =>
    evaluate(
      { ...input, closureYear, techOverride: { ...input.techOverride, drained: to, amm: to } },
      settings,
      tech,
      constants,
      costs,
    ).breakevenUsdPerT;
  const power = years.map((y) => breakeven(y, 'power'));
  const flare = years.map((y) => breakeven(y, 'flare'));
  const at = years.findIndex((_, i) => power[i] !== null && flare[i] !== null && power[i]! <= flare[i]!);
  return { years, power, flare, crossoverYear: at === -1 ? null : years[at] };
}

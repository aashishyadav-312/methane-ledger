// Mine page state that `src/state/url.ts` does not hold: the financing structure and the two unit toggles.
// They ride in the same hash query as the controls (for example `...&s=B&cur=inr&unit=ch4`), so a copied link
// reproduces them too. Missing or unknown values take the defaults.
import { encodeMineView, type MineView } from '../../state/url';

export const STRUCTURE_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
export type StructureKey = (typeof STRUCTURE_KEYS)[number];
export type Currency = 'usd' | 'inr';
export type TonneUnit = 'co2e' | 'ch4';

export interface PageView {
  structure: StructureKey;
  currency: Currency;
  tonnes: TonneUnit;
}

export const PAGE_DEFAULTS: PageView = { structure: 'A', currency: 'usd', tonnes: 'co2e' };

/** Short query keys, next to the ones in `src/state/url.ts`. */
export const PAGE_KEYS = { structure: 's', currency: 'cur', tonnes: 'unit' } as const;

function oneOf<T extends string>(options: readonly T[], text: string | null): T | null {
  return options.find((o) => o === text) ?? null;
}

export function decodePageView(query: URLSearchParams): PageView {
  return {
    structure: oneOf(STRUCTURE_KEYS, query.get(PAGE_KEYS.structure)) ?? PAGE_DEFAULTS.structure,
    currency: oneOf(['usd', 'inr'] as const, query.get(PAGE_KEYS.currency)) ?? PAGE_DEFAULTS.currency,
    tonnes: oneOf(['co2e', 'ch4'] as const, query.get(PAGE_KEYS.tonnes)) ?? PAGE_DEFAULTS.tonnes,
  };
}

/** The whole page as a query: every control, then the structure and the units. */
export function encodePage(view: MineView, page: PageView): URLSearchParams {
  const q = encodeMineView(view);
  q.set(PAGE_KEYS.structure, page.structure);
  q.set(PAGE_KEYS.currency, page.currency);
  q.set(PAGE_KEYS.tonnes, page.tonnes);
  return q;
}

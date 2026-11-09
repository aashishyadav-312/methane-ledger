import type { Constants } from './types';
import { THOUSAND_M3_PER_MM3 } from './constants';

/** Mm3 of CH4 to tonnes of CH4: 1 Mm3 = 1,000 thousand m3 x 0.67 t = 670 t. */
export function massTFromMm3(ch4Mm3: number, constants: Constants): number {
  return ch4Mm3 * THOUSAND_M3_PER_MM3 * constants.rhoTPerThousandM3;
}

/** Net tCO2e avoided per tonne of CH4 destroyed: GWP minus the CO2 the combustion releases. */
export function erTco2ePerTDestroyed(gwp: number, constants: Constants): number {
  return gwp - constants.co2PerCh4;
}

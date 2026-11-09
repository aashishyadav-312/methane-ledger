// Display units for the mine page: US dollars or rupees, and tonnes of CO2e or of methane destroyed.
// The model always works in US$ and tCO2e; this only changes how results are written.
import { erTco2ePerTDestroyed, type Constants } from '../../model';
import { inr, tonnes as tonnesText, usdM, usdPerT } from '../../lib/format';
import type { Currency, TonneUnit } from './pageState';

/** A price as people say it: `$15`, `$18.25`. Whole dollars drop the cents. */
export function usdPrice(x: number): string {
  const text = usdPerT(x);
  return Math.round(x * 100) % 100 === 0 ? text.replace(/\.00$/, '') : text;
}

export interface Units {
  currency: Currency;
  tonneUnit: TonneUnit;
  /** Rupees per US dollar (settings, placeholder). */
  usdToInr: number;
  /** A price per tonne to two places: `$8.33`, `₹708`. */
  perT: (usdPerT: number) => string;
  /** A price per tonne as people say it: `$15`, `₹1,275`. */
  price: (usdPerT: number) => string;
  /** An amount of money: `$8.6M`, `₹73.52 crore`. */
  amount: (usd: number) => string;
  /** Short name of the money unit for chart headers: `US$ million`, `₹`. */
  amountUnit: string;
  /** Credits in the chosen tonnes: `385k t`. Takes tCO2e. */
  tonnes: (tco2e: number) => string;
  /** Converts tCO2e of credits to the chosen tonnes. */
  toTonnes: (tco2e: number) => number;
  /** `CO2e` or `CH4`, written after a tonnes figure. */
  tonneSuffix: string;
}

export function makeUnits(
  currency: Currency,
  tonneUnit: TonneUnit,
  usdToInr: number,
  gwp: number,
  constants: Constants,
): Units {
  const inInr = currency === 'inr';
  // Every credit is a tonne of CO2e from destroying CH4: tCO2e = tCH4 destroyed x (GWP - CO2 from burning it).
  const tco2ePerTch4 = erTco2ePerTDestroyed(gwp, constants);
  const toTonnes = (t: number) => (tonneUnit === 'ch4' && tco2ePerTch4 !== 0 ? t / tco2ePerTch4 : t);
  return {
    currency,
    tonneUnit,
    usdToInr,
    perT: inInr ? (x) => inr(x, usdToInr) : usdPerT,
    price: inInr ? (x) => inr(x, usdToInr) : usdPrice,
    amount: inInr ? (x) => inr(x, usdToInr) : usdM,
    amountUnit: inInr ? '₹' : 'US$ million',
    tonnes: (t) => tonnesText(toTonnes(t)),
    toTonnes,
    tonneSuffix: tonneUnit === 'ch4' ? 'CH4' : 'CO2e',
  };
}


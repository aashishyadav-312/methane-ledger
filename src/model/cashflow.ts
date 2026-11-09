import type { Constants, Settings, StreamInput, TechLibrary } from './types';
import { KWH_PER_MWH } from './constants';
import { erTco2ePerTDestroyed, massTFromMm3 } from './physics';
import { airflowM3sFromMm3, powerMwhFromT, sizeStream } from './technology';

export interface StreamYear {
  ch4CapturedT: number;
  erTco2e: number;
  energyRevUsd: number;
  opexUsd: number;
}

export interface StreamCashflow {
  capexUsd: number;
  rows: StreamYear[];
}

const ZERO_YEAR: StreamYear = { ch4CapturedT: 0, erTco2e: 0, energyRevUsd: 0, opexUsd: 0 };

/**
 * Per-stream capex and annual rows (Appendix B3), mirroring `stream_cashflows` in reference/cmm_model.py.
 * A stream without status `ok` has no capex, no costs and no reductions.
 * A mandated stream keeps its costs and energy revenue but earns no reductions.
 * Drainage opex is charged every year of the window, after closure too, as the reference does.
 */
export function streamCashflow(
  stream: StreamInput,
  settings: Settings,
  lib: TechLibrary,
  constants: Constants,
): StreamCashflow {
  if (stream.status !== 'ok' || stream.tech === null) {
    return { capexUsd: 0, rows: stream.ch4Mm3ByYear.map(() => ({ ...ZERO_YEAR })) };
  }
  const size = sizeStream(stream, settings, lib, constants);
  const maxMm3 = Math.max(...stream.ch4Mm3ByYear);
  const destructionEff = lib[stream.tech].destructionEff;
  const erPerT = erTco2ePerTDestroyed(settings.gwp, constants);
  const drainageOpexUsd = stream.needsDrainageCapex
    ? maxMm3 * lib.drainage.capexUsdPerMm3Yr * lib.drainage.opexFracOfCapex
    : 0;

  const rows = stream.ch4Mm3ByYear.map((vMm3): StreamYear => {
    const capturedMm3 = vMm3 * stream.captureEff;
    const ch4CapturedT = massTFromMm3(capturedMm3, constants);
    const erTco2e = stream.destructionMandated ? 0 : ch4CapturedT * destructionEff * erPerT;
    let energyRevUsd = 0;
    let opexUsd = 0;
    if (stream.tech === 'power') {
      const mwh = powerMwhFromT(ch4CapturedT, lib, constants);
      energyRevUsd = mwh * settings.powerPriceUsdPerMwh;
      opexUsd = mwh * lib.power.opexUsdPerMwh;
    } else if (stream.tech === 'flare') {
      opexUsd = size.capexUsd * lib.flare.opexFracOfCapex;
    } else {
      // RTO: fixed share of capex plus fan power for the airflow actually moved this year
      const airflowM3s =
        stream.airflowM3s !== undefined
          ? (stream.airflowM3s * vMm3) / maxMm3
          : airflowM3sFromMm3(capturedMm3, stream.concFraction);
      const fanMwh = (airflowM3s * lib.rto.fanKwhPerM3sYr) / KWH_PER_MWH;
      opexUsd = size.capexUsd * lib.rto.opexFracOfCapex + fanMwh * settings.powerPriceUsdPerMwh;
    }
    return { ch4CapturedT, erTco2e, energyRevUsd, opexUsd: opexUsd + drainageOpexUsd };
  });
  return { capexUsd: size.capexUsd, rows };
}

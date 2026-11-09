import type { MineInput, Settings, StreamInput, StreamKind, TechLibrary } from './types';
import { STREAM_LABELS } from './constants';
import { buildGas } from './liberation';
import { buildTimeline, type Timeline } from './timeline';
import { selectTech, streamWarnings } from './technology';

function makeStream(
  kind: StreamKind,
  concFraction: number,
  ch4Mm3ByYear: number[],
  mine: MineInput,
  lib: TechLibrary,
): StreamInput {
  const hasGas = ch4Mm3ByYear.some((v) => v > 0);
  const choice = hasGas
    ? selectTech(kind, concFraction, mine.powerOfftake, lib, mine.techOverride?.[kind])
    : { tech: null, status: 'no_gas' as const };
  const stream: StreamInput = {
    kind,
    label: STREAM_LABELS[kind],
    concFraction,
    ch4Mm3ByYear,
    tech: choice.tech,
    status: choice.status,
    captureEff: mine.captureEff[kind],
    needsDrainageCapex: kind === 'drained' && !mine.hasDrainageSystem,
    destructionMandated: mine.destructionMandated[kind],
    warnings: hasGas ? streamWarnings(concFraction, choice.status) : [],
  };
  if (kind === 'vam' && mine.vamAirflowM3s !== undefined) stream.airflowM3s = mine.vamAirflowM3s;
  return stream;
}

/**
 * The streams of one mine over the crediting window: drained and VAM always, AMM when the window has years after
 * closure and the mine has an `amm` input. Streams with no gas get status `no_gas`.
 */
export function buildStreams(
  mine: MineInput,
  settings: Settings,
  tech: TechLibrary,
  timeline: Timeline = buildTimeline(mine, settings),
): StreamInput[] {
  const gas = buildGas(mine, timeline);
  const streams = [
    makeStream('drained', mine.drainedConc, gas.drainedMm3, mine, tech),
    makeStream('vam', mine.vamConc, gas.vamMm3, mine, tech),
  ];
  if (gas.ammMm3 && mine.amm) streams.push(makeStream('amm', mine.amm.conc, gas.ammMm3, mine, tech));
  return streams;
}

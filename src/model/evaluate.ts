import type {
  Constants,
  MineInput,
  Result,
  Settings,
  StreamInput,
  StreamResult,
  TechLibrary,
  Warning,
  YearRow,
} from './types';
import { STREAM_KINDS } from './constants';
import { streamCashflow, type StreamCashflow } from './cashflow';
import {
  breakevenUsdPerT,
  irr,
  npv,
  paybackIndex,
  priceByYear,
  streamBreakevenUsdPerT,
  type ProjectComponents,
} from './finance';
import { buildStreams } from './streams';
import { buildTimeline, type Timeline } from './timeline';

export interface ProjectFlows {
  components: ProjectComponents;
  cashflows: StreamCashflow[];
}

/** Sum the stream rows into project components; capex = (stream capex + monitoring) x (1 - grant). */
export function projectFlows(
  streams: StreamInput[],
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
): ProjectFlows {
  const n = settings.creditingYears;
  const cashflows = streams.map((s) => streamCashflow(s, settings, tech, constants));
  const erTco2e = new Array<number>(n).fill(0);
  const energyRevUsd = new Array<number>(n).fill(0);
  const opexUsd = new Array<number>(n).fill(0);
  let capexUsd = tech.monitoring.capexUsd;
  for (const cf of cashflows) {
    capexUsd += cf.capexUsd;
    for (let i = 0; i < n; i++) {
      const row = cf.rows[i];
      erTco2e[i] += row.erTco2e;
      energyRevUsd[i] += row.energyRevUsd;
      opexUsd[i] += row.opexUsd;
    }
  }
  capexUsd *= 1 - settings.grantShare;
  const mrvUsd = Array.from(
    { length: n },
    (_, i) => settings.verificationCostUsdPerYr + (i === 0 ? settings.validationCostUsd : 0),
  );
  return { components: { capexUsd, erTco2e, energyRevUsd, opexUsd, mrvUsd }, cashflows };
}

function dedupe(warnings: Warning[]): Warning[] {
  return [...new Set(warnings)];
}

/** Evaluate prepared streams. `evaluate` is the usual entry point; this one lets callers adjust streams first. */
export function evaluateStreams(
  streams: StreamInput[],
  settings: Settings,
  tech: TechLibrary,
  constants: Constants,
  timeline: Timeline,
): Result {
  const n = settings.creditingYears;
  const { components: c, cashflows } = projectFlows(streams, settings, tech, constants);
  const price = priceByYear(settings.creditPriceUsdPerT, settings.priceEscalation, n);
  const netCreditUsdPerT = price.map((p) => p * (1 - settings.brokerShare) - settings.issuanceFeeUsdPerT);

  const cashUsd = [-c.capexUsd];
  const years: YearRow[] = [];
  let cumCashUsd = -c.capexUsd;
  for (let i = 0; i < n; i++) {
    const creditRevUsd = c.erTco2e[i] * netCreditUsdPerT[i];
    const cash = creditRevUsd + c.energyRevUsd[i] - c.opexUsd[i] - c.mrvUsd[i];
    cumCashUsd += cash;
    cashUsd.push(cash);
    const byStream = Object.fromEntries(STREAM_KINDS.map((k) => [k, { erTco2e: 0, ch4Mm3: 0 }])) as YearRow['byStream'];
    let ch4CapturedT = 0;
    streams.forEach((s, j) => {
      byStream[s.kind] = { erTco2e: cashflows[j].rows[i].erTco2e, ch4Mm3: s.ch4Mm3ByYear[i] };
      ch4CapturedT += cashflows[j].rows[i].ch4CapturedT;
    });
    years.push({
      year: timeline.calendarYears[i],
      erTco2e: c.erTco2e[i],
      ch4CapturedT,
      priceUsdPerT: price[i],
      creditRevUsd,
      energyRevUsd: c.energyRevUsd[i],
      opexUsd: c.opexUsd[i],
      mrvUsd: c.mrvUsd[i],
      cashUsd: cash,
      cumCashUsd,
      byStream,
    });
  }

  const streamResults: StreamResult[] = streams.map((s, j) => ({
    kind: s.kind,
    label: s.label,
    tech: s.tech,
    status: s.status,
    capexUsd: cashflows[j].capexUsd,
    erTotalTco2e: cashflows[j].rows.reduce((sum, y) => sum + y.erTco2e, 0),
    breakevenUsdPerT: streamBreakevenUsdPerT(cashflows[j], settings.discountRate),
    warnings: s.warnings,
  }));

  const payback = paybackIndex(cashUsd);
  const warnings = dedupe([
    ...(timeline.closureOutsideWindow ? (['closure_outside_window'] as Warning[]) : []),
    ...streams.flatMap((s) => s.warnings),
  ]);

  return {
    abatable: streams.some((s) => s.status === 'ok'),
    activeYears: timeline.activeYears,
    postYears: timeline.postYears,
    capexUsd: c.capexUsd,
    cashUsd,
    years,
    erTotalTco2e: c.erTco2e.reduce((a, b) => a + b, 0),
    erYear1Tco2e: c.erTco2e[0] ?? 0,
    breakevenUsdPerT: breakevenUsdPerT(c, settings),
    npvUsd: npv(cashUsd, settings.discountRate),
    irr: irr(cashUsd),
    paybackIndex: payback,
    paybackYear: payback === null ? null : settings.startYear - 1 + payback,
    streams: streamResults,
    warnings,
  };
}

/** Evaluate one mine: timeline, gas, technology, cash flows and finance (Appendix B1 to B5). */
export function evaluate(mine: MineInput, settings: Settings, tech: TechLibrary, constants: Constants): Result {
  const timeline = buildTimeline(mine, settings);
  const streams = buildStreams(mine, settings, tech, timeline);
  return evaluateStreams(streams, settings, tech, constants, timeline);
}

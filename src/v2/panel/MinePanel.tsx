import type { ReactNode } from 'react';
import { pct } from '../../lib/format';
import type { GassinessDegree } from '../../model/types';
import { usdPrice } from '../../pages/MinePage/units';
import { CUSTOM_BASIS, type DrainedUse, type MineView } from '../../state/url';
import { Segmented } from '../../ui';
import type { MineV2 } from '../contracts';
import { dataTag, factsLine, fixHint, ROMAN, runoutChip, typeChip } from './copy';
import {
  closureYearRange,
  DRAINED_RANGE_MM3_PER_YR,
  OUTPUT_RANGE_MT_PER_YR,
  priceChips,
  viewContext,
  type EstimateChoices,
  type PanelBase,
} from './model';
import { NumberField } from './NumberField';
import { PRICE_INPUT_USD_PER_T } from '../../pages/MinePage/controls';
import './panel.css';

export interface MinePanelProps {
  mine: MineV2;
  pb: PanelBase;
  /** The controls. Null when the mine cannot be modelled. */
  view: MineView | null;
  choices: EstimateChoices;
  onView: (patch: Partial<MineView>) => void;
  onChoices: (patch: Partial<EstimateChoices>) => void;
  onClose: () => void;
  onOpenAll: () => void;
  /** Number of values in the "All assumptions" sheet. */
  allCount: number;
  sheetOpen: boolean;
  /** The result peek and the Run button. */
  footer: ReactNode;
  /** `side`: the desktop panel. `sheet`: the phone bottom sheet, with the result and Run button first. */
  variant: 'side' | 'sheet';
  headingId: string;
  /** The phone sheet's drag handle, above the heading. */
  handle?: ReactNode;
}

const GRADES: readonly GassinessDegree[] = [1, 2, 3];

const firstOf = (x: number | number[]) => (Array.isArray(x) ? (x[0] ?? 0) : x);

/** Mm³ with three significant figures at most: 11.9, 2.93, 140. */
const mm3 = (x: number) => String(Number(x.toPrecision(3)));

function CloseIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

function GradeControl({ value, onChange }: { value: GassinessDegree | null; onChange: (g: GassinessDegree) => void }) {
  return (
    <Segmented
      label="Gassiness grade"
      options={GRADES.map((g) => ({ value: String(g), label: ROMAN[g] }))}
      value={value === null ? '' : String(value)}
      onChange={(v) => onChange(Number(v) as GassinessDegree)}
    />
  );
}

/** The inputs panel for one mine (V2-Mine-Open), pre-filled with its record or its estimate. */
export function MinePanel({
  mine,
  pb,
  view,
  choices,
  onView,
  onChoices,
  onClose,
  onOpenAll,
  allCount,
  sheetOpen,
  footer,
  variant,
  headingId,
  handle,
}: MinePanelProps) {
  const { picked, base } = pb;
  const degree = picked.degree;
  const isRecord = picked.source === 'record';

  const head = (
    <div className="v2-panel-head">
      <div className="v2-panel-titles">
        <h1 id={headingId} className="v2-panel-title" tabIndex={-1}>
          {mine.name}
        </h1>
        <p className="v2-panel-facts">{factsLine(mine)}</p>
      </div>
      <button type="button" className="v2-panel-close v2-press" aria-label={`Close ${mine.name}`} onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );

  const chips = (
    <div className="v2-panel-chips">
      <span className="v2-chip">
        <span className={`v2-dot v2-dot--${mine.band}`} aria-hidden="true" />
        {runoutChip(mine)}
      </span>
      <span className="v2-chip">{typeChip(mine.type, degree)}</span>
      <span className="v2-chip v2-chip--tag">{dataTag(picked.source)}</span>
    </div>
  );

  const foot = <div className="v2-panel-foot">{footer}</div>;

  let body: ReactNode;
  if (base === null || view === null) {
    const status = picked.status === 'no_output' ? 'no_output' : 'not_abatable';
    const output = picked.estimate?.productionMtPerYr ?? 0;
    body = (
      <div className="v2-panel-body">
        <section className="v2-panel-reason" aria-label="Why this mine is not modelled">
          <p className="v2-panel-verdict" data-testid="v2-not-modelled">
            {status === 'no_output' ? 'No recent output' : 'Not abatable'}
          </p>
          <p className="v2-panel-why">{picked.reason}</p>
          <p className="v2-panel-hint">{fixHint(status)}</p>
          {status === 'no_output' ? (
            <NumberField
              label="Coal output"
              unit="Mt a year"
              value={choices.outputMtPerYr ?? output}
              min={OUTPUT_RANGE_MT_PER_YR.min}
              max={OUTPUT_RANGE_MT_PER_YR.max}
              step={OUTPUT_RANGE_MT_PER_YR.step}
              decimals={2}
              onCommit={(x) => onChoices({ outputMtPerYr: x })}
            />
          ) : (
            <GradeControl value={degree} onChange={(g) => onChoices({ degree: g })} />
          )}
        </section>
      </div>
    );
  } else {
    const ctx = viewContext(base);
    const years = closureYearRange(base, view);
    const multiBasis = base.bases.length > 1;
    const chipsForPrice = priceChips(base.prices);
    const drained = view.drainedMm3PerYr ?? (typeof base.input.drainedMm3PerYr === 'number' ? base.input.drainedMm3PerYr : 0);
    const output = choices.outputMtPerYr ?? firstOf(base.input.productionMtPerYr);
    const gem = mine.gemMethaneMm3;
    const usingGem = gem !== null && choices.totalMm3 === gem;
    const uncertain = picked.warnings.includes('closure_uncertain');

    body = (
      <div className="v2-panel-body">
        <section className="v2-panel-group" aria-labelledby={`${headingId}-mine`}>
          <h2 id={`${headingId}-mine`} className="v2-panel-h2">
            The mine
          </h2>
          <div className="v2-panel-grid">
            <NumberField
              label="Last year of mining"
              value={view.closureYear}
              min={years.min}
              max={Math.max(years.max, view.closureYear)}
              step={1}
              decimals={0}
              onCommit={(y) => {
                const basis = base.bases.find((b) => b.year === y);
                onView({ closureBasis: basis?.id ?? CUSTOM_BASIS, closureYear: y });
              }}
            />
            <NumberField
              label="Coal output"
              unit="Mt a year"
              value={output}
              min={OUTPUT_RANGE_MT_PER_YR.min}
              max={OUTPUT_RANGE_MT_PER_YR.max}
              step={OUTPUT_RANGE_MT_PER_YR.step}
              decimals={2}
              onCommit={(x) => onChoices({ outputMtPerYr: x })}
            />
          </div>
          {multiBasis ? (
            <Segmented
              label="Last year of mining, from the closure workbook"
              options={base.bases.map((b) => ({ value: b.id, label: `${b.label} (${b.year})` }))}
              value={view.closureBasis}
              onChange={(id) => {
                const b = base.bases.find((x) => x.id === id);
                if (b) onView({ closureBasis: b.id, closureYear: b.year });
              }}
            />
          ) : null}
          {uncertain ? (
            <p className="v2-panel-note">
              The workbook lists this mine past its reported reserve, so mining is taken to end in{' '}
              {base.settings.startYear}.
            </p>
          ) : null}
          {isRecord ? (
            <p className="v2-panel-fact">
              Gassiness grade <span className="num">{degree === null ? 'none' : ROMAN[degree]}</span>, from the mine&apos;s
              record
            </p>
          ) : (
            <GradeControl value={degree} onChange={(g) => onChoices({ degree: g })} />
          )}
          <div className="v2-panel-grid">
            <NumberField
              label="Drained gas"
              unit="Mm³ a year"
              value={drained}
              min={ctx.drainedRangeMm3PerYr.min}
              max={Math.max(ctx.drainedRangeMm3PerYr.max, DRAINED_RANGE_MM3_PER_YR.max)}
              step={0.1}
              decimals={1}
              onCommit={(x) => onView({ drainedMm3PerYr: x })}
            />
          </div>
          <Segmented
            label="Methane in ventilation air"
            options={ctx.vamConcOptions.map((x) => ({ value: String(x), label: pct(x, 1) }))}
            value={String(view.vamConc)}
            onChange={(v) => onView({ vamConc: Number(v) })}
          />
          {gem !== null ? (
            <div className="v2-panel-gem">
              <p>
                Global Coal Mine Tracker estimate: <span className="num">{mm3(gem)}</span> Mm³ a year
              </p>
              <button
                type="button"
                className="v2-panel-link v2-press"
                aria-pressed={usingGem}
                onClick={() => onChoices({ totalMm3: usingGem ? null : gem })}
              >
                {usingGem ? 'In use' : 'Use this'}
              </button>
            </div>
          ) : null}
        </section>

        <section className="v2-panel-group" aria-labelledby={`${headingId}-project`}>
          <h2 id={`${headingId}-project`} className="v2-panel-h2">
            The project
          </h2>
          <Segmented<DrainedUse>
            label="Use the drained gas to"
            options={[
              { value: 'power', label: 'Make power' },
              { value: 'flare', label: 'Flare it' },
            ]}
            value={view.drainedUse}
            onChange={(drainedUse) => onView({ drainedUse })}
          />
          <Segmented
            label="Grant toward the build cost"
            options={ctx.grantOptions.map((x) => ({ value: String(x), label: x === 0 ? 'None' : pct(x, 0) }))}
            value={String(view.grantShare)}
            onChange={(v) => onView({ grantShare: Number(v) })}
          />
        </section>

        <section className="v2-panel-group" aria-labelledby={`${headingId}-price`}>
          <div className="v2-panel-pricehead">
            <h2 id={`${headingId}-price`} className="v2-panel-h2">
              Credit price
            </h2>
            <span className="num v2-panel-price">{usdPrice(view.priceUsdPerT)} a tonne</span>
          </div>
          <div className="v2-panel-pricechips" role="group" aria-label="Benchmark prices">
            {chipsForPrice.map((c) => (
              <button
                key={c.id}
                type="button"
                className="v2-pchip v2-press"
                aria-pressed={c.priceUsdPerT === view.priceUsdPerT}
                title={c.description || undefined}
                onClick={() => onView({ priceUsdPerT: c.priceUsdPerT })}
              >
                {c.label} {usdPrice(c.priceUsdPerT)}
              </button>
            ))}
          </div>
          <NumberField
            label="Your price"
            unit="$ a tonne"
            value={view.priceUsdPerT}
            min={PRICE_INPUT_USD_PER_T.min}
            max={PRICE_INPUT_USD_PER_T.max}
            step={PRICE_INPUT_USD_PER_T.step}
            decimals={2}
            onCommit={(p) => onView({ priceUsdPerT: p })}
          />
        </section>

        <button
          type="button"
          className="v2-panel-all v2-press"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={onOpenAll}
          data-testid="v2-all-assumptions"
        >
          <span>Every assumption, all {allCount}</span>
          <span className="v2-panel-all-note">market, gas, technology, costs, finance</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`v2-panel v2-panel--${variant}`}>
      {handle}
      {head}
      {variant === 'sheet' ? (
        <>
          {foot}
          {chips}
          {body}
        </>
      ) : (
        <>
          {chips}
          {body}
          {foot}
        </>
      )}
    </div>
  );
}

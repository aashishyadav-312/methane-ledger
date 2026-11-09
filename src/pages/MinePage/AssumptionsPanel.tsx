import { ClosureControl, type ClosureOption } from '../../components/inputs/ClosureControl';
import { PriceControl, type PriceChip } from '../../components/inputs/PriceControl';
import { pct } from '../../lib/format';
import { Segmented, Slider } from '../../ui';
import { CUSTOM_BASIS, closureRange, type DrainedUse, type MineView } from '../../state/url';
import {
  CREDITING_OPTIONS,
  DISCOUNT_OPTIONS,
  DRAINED_SLIDER_MM3_PER_YR,
  GRANT_OPTIONS,
  PRICE_INPUT_USD_PER_T,
  PRICE_SLIDER_USD_PER_T,
  VAM_CONC_OPTIONS,
} from './controls';
import { basisLabel, usdPrice } from './copy';
import type { ClosureBasis } from './useMineModel';

export interface AssumptionsPanelProps {
  mineName: string;
  view: MineView;
  defaults: MineView;
  /** The drained gas the model uses in year 1, for the slider when the view does not set it. */
  drainedShownMm3PerYr: number;
  bases: ClosureBasis[];
  startYear: number;
  gwpOptions: readonly number[];
  chips: PriceChip[];
  overrideCount: number;
  onChange: (patch: Partial<MineView>) => void;
  onReset: () => void;
  onClearOverrides: () => void;
}

/** The option list, plus the default when the data uses a value the list does not offer. */
function withDefault(options: readonly number[], d: number): number[] {
  const all = options.some((o) => o === d) ? [...options] : [...options, d];
  return all.sort((a, b) => a - b);
}

function numberSegments(options: number[], label: (x: number) => string) {
  return options.map((o) => ({ value: String(o), label: label(o) }));
}

const DRAINED_DECIMALS = 0;

export function AssumptionsPanel({
  mineName,
  view,
  defaults,
  drainedShownMm3PerYr,
  bases,
  startYear,
  gwpOptions,
  chips,
  overrideCount,
  onChange,
  onReset,
  onClearOverrides,
}: AssumptionsPanelProps) {
  const closureOptions: ClosureOption[] =
    bases.length === 0
      ? []
      : [
          ...bases.map((b) => ({ id: b.id, label: basisLabel(b.label, b.year), year: b.year })),
          { id: CUSTOM_BASIS, label: 'Custom', year: null },
        ];
  const drained = view.drainedMm3PerYr ?? drainedShownMm3PerYr;
  const drainedText = `${drained.toFixed(DRAINED_DECIMALS)} Mm³ / yr`;

  return (
    <aside className="mine-panel" aria-label="Assumptions">
      <h2 className="sr-only">Assumptions</h2>
      <div className="mine-panel-section">
        <PriceControl
          priceUsdPerT={view.priceUsdPerT}
          valueText={`${usdPrice(view.priceUsdPerT)} / t`}
          onChange={(p) => onChange({ priceUsdPerT: p })}
          slider={PRICE_SLIDER_USD_PER_T}
          input={PRICE_INPUT_USD_PER_T}
          chips={chips}
          note="No public price exists yet for coal mine methane credits. The chips are benchmarks and our estimates. CCTS is India's Carbon Credit Trading Scheme."
        />
      </div>

      <div className="mine-panel-section">
        <h3 className="t-caps mine-panel-heading">The mine</h3>
        <Slider
          label="Drained gas"
          valueText={drainedText}
          min={DRAINED_SLIDER_MM3_PER_YR.min}
          max={DRAINED_SLIDER_MM3_PER_YR.max}
          step={DRAINED_SLIDER_MM3_PER_YR.step}
          value={drained}
          onChange={(d) => onChange({ drainedMm3PerYr: d })}
        />
        <ClosureControl
          options={closureOptions}
          basis={view.closureBasis}
          year={view.closureYear}
          range={closureRange(startYear, view.creditingYears)}
          customId={CUSTOM_BASIS}
          onChange={(closureBasis, closureYear) => onChange({ closureBasis, closureYear })}
        />
        <Segmented
          label="Methane in ventilation air"
          options={numberSegments(withDefault(VAM_CONC_OPTIONS, defaults.vamConc), (x) => pct(x, 1))}
          value={String(view.vamConc)}
          onChange={(v) => onChange({ vamConc: Number(v) })}
        />
      </div>

      <div className="mine-panel-section">
        <h3 className="t-caps mine-panel-heading">The project</h3>
        <Segmented<DrainedUse>
          label="Use the drained gas to"
          options={[
            { value: 'power', label: 'Make power' },
            { value: 'flare', label: 'Flare it' },
          ]}
          value={view.drainedUse}
          onChange={(drainedUse) => onChange({ drainedUse })}
        />
        <Segmented
          label="Grant toward the build cost"
          options={numberSegments(withDefault(GRANT_OPTIONS, defaults.grantShare), (x) =>
            x === 0 ? 'None' : pct(x, 0),
          )}
          value={String(view.grantShare)}
          onChange={(v) => onChange({ grantShare: Number(v) })}
        />
      </div>

      <div className="mine-panel-section">
        <h3 className="t-caps mine-panel-heading">Accounting</h3>
        <Segmented
          label="Discount rate"
          options={numberSegments(withDefault(DISCOUNT_OPTIONS, defaults.discountRate), (x) => pct(x, 0))}
          value={String(view.discountRate)}
          onChange={(v) => onChange({ discountRate: Number(v) })}
        />
        <Segmented
          label="Warming factor for methane (GWP)"
          options={numberSegments(withDefault(gwpOptions, defaults.gwp), String)}
          value={String(view.gwp)}
          onChange={(v) => onChange({ gwp: Number(v) })}
        />
        <Segmented
          label="Crediting period"
          options={CREDITING_OPTIONS.map((n) => ({ value: String(n), label: `${n} years` }))}
          value={String(view.creditingYears)}
          onChange={(v) =>
            onChange({ creditingYears: CREDITING_OPTIONS.find((n) => String(n) === v) ?? defaults.creditingYears })
          }
        />
        <button type="button" className="btn btn-secondary mine-reset" onClick={onReset}>
          Reset to {mineName} defaults
        </button>
        {overrideCount > 0 ? (
          <p className="control-note">
            {overrideCount === 1 ? 'One assumption is' : `${overrideCount} assumptions are`} changed for this session.{' '}
            <button type="button" className="btn btn-link mine-clear" onClick={onClearOverrides}>
              Clear {overrideCount === 1 ? 'it' : 'them'}
            </button>
          </p>
        ) : null}
      </div>
    </aside>
  );
}

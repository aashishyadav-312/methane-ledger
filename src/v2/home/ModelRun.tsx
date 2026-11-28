import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usdPerT } from '../../lib/format';
import { usdPrice } from '../../pages/MinePage/units';
import { useMineModel, type MineBase } from '../../pages/MinePage/useMineModel';
import type { MineView } from '../../state/url';
import { VerdictPill } from '../../ui';
import type { MineV2 } from '../contracts';
import { RUN_PROGRESS_UNDERLINE_PX } from '../motion/tokens';
import { ResultsV2, type ResultsData } from '../results';
import { RECOMPUTE_DEBOUNCE_MS } from './layout';

export interface ModelRunProps {
  mine: MineV2;
  base: MineBase;
  view: MineView;
  source: 'record' | 'estimate';
  ran: boolean;
  onRun: () => void;
  /** Where the results section mounts, below the map. */
  resultsSlot: HTMLElement | null;
  onEditInputs: () => void;
}

/**
 * The panel's footer: the result peek and "Run the model". After the first run every input change recomputes live,
 * RECOMPUTE_DEBOUNCE_MS after the last change. The results section (Step 7) mounts below the map through a portal.
 */
export function ModelRun({ mine, base, view, source, ran, onRun, resultsSlot, onEditInputs }: ModelRunProps) {
  const [modelView, setModelView] = useState(view);
  const [running, setRunning] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    if (!ran || modelView === view) return;
    const t = setTimeout(() => setModelView(view), RECOMPUTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [ran, view, modelView]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const model = useMineModel(base, modelView);
  const { result } = model;
  // The dashboard's own charts (structures, waterfall, tornado, closure curve) run on the same data and settings as
  // the panel's result, so the sheet's changes and the cost basis reach them too.
  const resultsData = useMemo<ResultsData>(
    () => ({
      tech: base.tech,
      constants: base.constants,
      costs: base.costs,
      finance: base.finance,
      prices: base.prices,
    }),
    [base.tech, base.constants, base.costs, base.finance, base.prices],
  );

  // DESIGN_V2 "Run the model": the underline shows for the real compute time. The compute happens in the render
  // after this frame, and the underline goes with the frame after that.
  const run = () => {
    setRunning(true);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setModelView(view);
      onRun();
      frame.current = requestAnimationFrame(() => setRunning(false));
    });
  };

  const be = result.breakevenUsdPerT;
  const price = modelView.priceUsdPerT;
  const covered = be !== null && be <= price;
  const verdictText = !result.abatable
    ? 'Not abatable'
    : covered
      ? `Covered at ${usdPrice(price)}`
      : be === null
        ? `Not covered at ${usdPrice(price)}`
        : `Short by ${usdPerT(be - price)} a tonne`;
  const spoken = `${mine.name}. ${be === null ? 'No break-even credit price' : `Break-even credit price ${usdPerT(be)} a tonne`}. ${verdictText}.`;

  return (
    <>
      {/* Always in the page, so a screen reader hears the result when it arrives (a live region added with its text is skipped). */}
      <p className="sr-only" role="status" data-testid="v2-result-status">
        {ran ? spoken : ''}
      </p>
      {ran ? (
        <div className="v2-peek" data-testid="v2-peek">
          <div className="v2-peek-text">
            <span className="v2-peek-label">Break-even credit price</span>
            <span className="v2-peek-num" data-testid="v2-breakeven">
              {be === null ? 'None' : usdPerT(be)}
              {be === null ? null : <span className="v2-peek-unit"> a tonne</span>}
            </span>
          </div>
          <VerdictPill verdict={result.abatable && covered ? 'ok' : 'short'}>{verdictText}</VerdictPill>
        </div>
      ) : null}
      <button
        type="button"
        className="v2-run v2-press"
        data-running={running ? 'true' : undefined}
        aria-busy={running || undefined}
        style={{ '--v2-run-line': `${RUN_PROGRESS_UNDERLINE_PX}px` } as CSSProperties}
        onClick={run}
      >
        {ran ? 'Run the model again' : 'Run the model'}
      </button>
      {ran && resultsSlot
        ? createPortal(
            <ResultsV2
              mine={mine}
              input={model.input}
              result={result}
              source={source}
              priceUsdPerT={price}
              onEditInputs={onEditInputs}
              settings={model.settings}
              data={resultsData}
            />,
            resultsSlot,
          )
        : null}
    </>
  );
}

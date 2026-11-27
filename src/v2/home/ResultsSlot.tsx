import type { ComponentType } from 'react';
import { usdM, usdPerT } from '../../lib/format';
import type { ResultsProps } from '../contracts';

/**
 * Step 7 builds `<ResultsV2>` in src/v2/results. Until it is exported from there, the home shows this short summary
 * so the run, the scroll and the docking work end to end. Read by name (through `import.meta.glob`) so this file builds either way.
 */
const resultsModule = Object.values(import.meta.glob<Record<string, unknown>>('../results/index.ts', { eager: true }))[0];
const StepSevenResults = resultsModule?.ResultsV2 as ComponentType<ResultsProps> | undefined;

function ResultsSummary({ mine, result, priceUsdPerT, onEditInputs }: ResultsProps) {
  const be = result.breakevenUsdPerT;
  return (
    <div className="v2-results-summary page-width">
      <h2 className="t-h2">Results for {mine.name}</h2>
      <p className="t-lede">
        {be === null
          ? 'No credit price covers the cost of capturing this mine’s methane.'
          : `The project breaks even at ${usdPerT(be)} a tonne. At ${usdPerT(priceUsdPerT)} a tonne its net present value is ${usdM(result.npvUsd)}.`}
      </p>
      <button type="button" className="btn btn-secondary" onClick={onEditInputs}>
        Edit inputs
      </button>
    </div>
  );
}

/** The results section's content: Step 7's dashboard when it exists, else the summary. */
export function ResultsSlot(props: ResultsProps) {
  const Results = StepSevenResults ?? ResultsSummary;
  return <Results {...props} />;
}

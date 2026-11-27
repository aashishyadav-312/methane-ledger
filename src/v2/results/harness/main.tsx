/*
 * Harness for the Step 7 results dashboard: mounts the `#/__results?m=<id>` test route. e2e/v2/results.spec.ts builds
 * this page on its own; the app build never includes it. Open it as `.../index.html#/__results?m=bccl-moonidih`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../styles/tokens.css';
import '../../../styles/global.css';
import '../../../styles/components.css';
import { RESULTS_TEST_PATH, ResultsTestRoute } from '../ResultsTestRoute';

if (!window.location.hash.startsWith(`#${RESULTS_TEST_PATH}`)) {
  window.location.hash = `${RESULTS_TEST_PATH}${window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : ''}`;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResultsTestRoute />
  </StrictMode>,
);

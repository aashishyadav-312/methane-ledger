// Step 7: the results dashboard. Every number on it traces to `evaluate`, `financing`, `waterfall`, `tornado` and
// `closureCurve`; these tests check the bindings at the defaults. jsdom has no IntersectionObserver, so the charts
// render fully drawn (the same path as reduced motion).
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pickMineInput } from '../../../src/data/estimation';
import { getConstants, getCosts, getTech } from '../../../src/data/load';
import { pct, tonnes, usdM, usdPerT } from '../../../src/lib/format';
import { evaluate } from '../../../src/model/evaluate';
import type { MineInput } from '../../../src/model/types';
import { getMineV2 } from '../../../src/v2/map/data';
import { waterfallRows } from '../../../src/v2/results/charts/WaterfallChart';
import { closureLede, crossoverLabel, flareZoneLabel, waterfallNote, whoPaysNote } from '../../../src/v2/results/copy';
import {
  parseResultsTestHash,
  resultsModel,
  ResultsTestRoute,
  ResultsV2,
  settingsAtPrice,
} from '../../../src/v2/results';
import golden from '../../golden/estimation_v2.json';

const MOONIDIH = 'bccl-moonidih';
const settings = settingsAtPrice(15);
const input = pickMineInput(MOONIDIH)!.input!;
const result = evaluate(input, settings, getTech(), getConstants(), getCosts());
const model = resultsModel(input, settings);

function renderMoonidih(patch: Partial<MineInput> = {}) {
  const i = { ...input, ...patch };
  const r = evaluate(i, settings, getTech(), getConstants(), getCosts());
  return render(
    <ResultsV2
      mine={getMineV2(MOONIDIH)!}
      input={i}
      result={r}
      source="record"
      priceUsdPerT={15}
      settings={settings}
      onEditInputs={() => {}}
    />,
  );
}

beforeEach(() => {
  window.location.hash = '#/';
});
afterEach(() => cleanup());

describe('bindings at the defaults (Moonidih record)', () => {
  it('headline, verdict and sentence come from evaluate', () => {
    renderMoonidih();
    expect(screen.getByTestId('results-breakeven').textContent).toBe(usdPerT(result.breakevenUsdPerT!));
    expect(screen.getByTestId('results-breakeven').textContent).toBe('$3.37');
    expect(screen.getByTestId('results-verdict').textContent).toBe('Covered at $15');
    expect(screen.getByTestId('results-sentence').textContent).toContain(usdM(result.npvUsd));
    expect(screen.getByTestId('results-sentence').textContent).toContain(String(result.paybackYear));
  });

  it('the five tiles are NPV, return, payback, build cost and credits', () => {
    renderMoonidih();
    const tiles = within(screen.getByTestId('results-tiles'));
    expect(tiles.getByTestId('tile-npv').textContent).toContain(usdM(result.npvUsd));
    expect(tiles.getByTestId('tile-irr').textContent).toContain(pct(result.irr, 1));
    expect(tiles.getByTestId('tile-payback').textContent).toContain(String(result.paybackYear));
    expect(tiles.getByTestId('tile-capex').textContent).toContain(usdM(result.capexUsd));
    expect(tiles.getByTestId('tile-credits').textContent).toBe(
      `Credits over ${result.years.length} years${tonnes(result.erTotalTco2e)}`,
    );
  });

  it('who could pay shows A to E from financing, and E is the 30% grant', () => {
    renderMoonidih();
    const value = (k: string) => screen.getByTestId(`structure-${k}-value`).textContent;
    expect(['A', 'B', 'C', 'D', 'E'].map(value)).toEqual(['$3.37', '$8.21', '$3.65', '$0.00', '−$0.91']);
    for (const k of ['A', 'B', 'C', 'D', 'E'] as const) {
      expect(value(k)).toBe(usdPerT(model.finance[k].breakevenUsdPerT!));
    }
    expect(screen.getByTestId('structure-E').textContent).toContain('A 30% grant');
    expect(screen.getByTestId('structure-D').textContent).toContain('A price floor of $10');
  });

  it('the closure chart labels the crossover from closureCurve (2031) and rings the mine', () => {
    renderMoonidih();
    expect(model.curve.crossoverYear).toBe(golden.closure_curve.moonidih_record.crossover_year);
    expect(screen.getByTestId('closure-crossover').textContent).toBe(crossoverLabel(2031));
    expect(screen.getByTestId('closure-flare-zone').textContent).toBe('Closing by 2030: a flare is cheaper');
    expect(screen.getByTestId('closure-mine-point').textContent).toBe('Moonidih, 2034: $3.37');
    expect(screen.getByTestId('closure-offscale').textContent).toBe('Off the scale: $43.31 in 2027.');
    expect(screen.getByText(/Voluntary average \$7/)).toBeTruthy();
    expect(screen.getByText(/CCTS floor \(our estimate\) \$11/)).toBeTruthy();
  });

  it('the closure chart keeps clear of a missing crossover', () => {
    const curve = { ...model.curve, crossoverYear: null };
    expect(flareZoneLabel(curve)).toBe('To 2036: a flare is cheaper');
    expect(closureLede('X', curve)).toContain('A flare is cheaper than engines for every closure year to 2036.');
    expect(flareZoneLabel({ ...model.curve, crossoverYear: 2027 })).toBeNull();
  });

  it('the waterfall parts sum to the break-even, build cost first and power sold last', () => {
    const rows = waterfallRows(model.waterfall!);
    expect(rows[0].key).toBe('capex');
    expect(rows[rows.length - 1].key).toBe('energy');
    const sum = rows.reduce((s, r) => s + r.valueUsdPerT, 0);
    expect(sum).toBeCloseTo(result.breakevenUsdPerT!, 6);
    renderMoonidih();
    expect(screen.getByTestId('waterfall-total').textContent).toContain('$3.37');
    expect(waterfallNote(model.waterfall!.capexUsdPerT, model.waterfall!.energyUsdPerT)).toBe(
      'Power sold, $15.53 a tonne, pays for the whole build cost of $13.21 and some of the running costs.',
    );
    expect(waterfallNote(10, -2.5)).toBe('Power sold, $2.50 a tonne, cancels 25% of the build cost of $10.00.');
  });

  it('the tornado shows the six widest inputs, in order', () => {
    renderMoonidih();
    const keys = screen.getAllByTestId('tornado-row').map((el) => el.getAttribute('data-key'));
    expect(keys).toEqual(model.tornado.top6);
  });

  it('every chart has an aria-label and a hidden data table', () => {
    renderMoonidih();
    for (const id of ['chart-closure', 'chart-credits', 'chart-waterfall', 'chart-structures', 'chart-tornado']) {
      const card = screen.getByTestId(id);
      expect(card.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBeTruthy();
      expect(card.querySelector('.sr-only table caption')?.textContent).toBeTruthy();
    }
    expect(screen.getByTestId('chart-credits').querySelectorAll('.sr-only tbody tr')).toHaveLength(result.years.length);
  });

  it('copy follows the rules: no em dashes or arrows, and the who-pays line is built from numbers', () => {
    renderMoonidih();
    const text = screen.getByTestId('results-v2').textContent ?? '';
    expect(text).not.toMatch(/[—→]/);
    expect(whoPaysNote(model.finance)).toBe(
      'A developer needs $8.21 to earn its 15% return; a $10 floor covers the project on its own.',
    );
    expect(screen.getByText('Illustrative inputs')).toBeTruthy();
  });
});

describe('a mine with nothing to destroy', () => {
  it('shows the reason and no charts', () => {
    renderMoonidih({ drainedMm3PerYr: 0, vamConc: 0.0005, amm: undefined });
    expect(screen.getByTestId('results-verdict').textContent).toBe('Not abatable with these technologies');
    expect(screen.queryByTestId('chart-closure')).toBeNull();
    expect(screen.getByTestId('results-sentence').textContent).toMatch(/too dilute|no gas/);
  });
});

describe('the test route', () => {
  it('parses #/__results?m=...', () => {
    expect(parseResultsTestHash('#/__results?m=bccl-moonidih')).toEqual({
      mineId: MOONIDIH,
      priceUsdPerT: null,
      showMini: true,
    });
    expect(parseResultsTestHash('#/__results?m=x&p=7&mini=0')).toEqual({ mineId: 'x', priceUsdPerT: 7, showMini: false });
    expect(parseResultsTestHash('#/mine/bccl-moonidih')).toBeNull();
  });

  it('renders the AMP Colliery estimate with its own break-even and the estimated-inputs tag', () => {
    act(() => {
      window.location.hash = '#/__results?m=bccl-amp-colliery';
    });
    render(<ResultsTestRoute />);
    expect(screen.getByTestId('results-breakeven').textContent).toBe('$4.49');
    expect(screen.getByText('Estimated inputs')).toBeTruthy();
    expect(screen.getByTestId('closure-crossover').textContent).toBe(crossoverLabel(2032));
    expect(screen.getByTestId('closure-mine-point').textContent).toBe('AMP Colliery, mining past 2036: $4.49');
  });
});

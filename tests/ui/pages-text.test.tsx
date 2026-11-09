import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import costsGolden from '../golden/costs_v1_1.json';
import { AssumptionsPage } from '../../src/pages/AssumptionsPage';
import { MethodPage } from '../../src/pages/MethodPage';
import { workedCase } from '../../src/pages/MethodPage/worked';
import { SourcesPage } from '../../src/pages/SourcesPage';
import { usdPerT } from '../../src/lib/format';
import { getOverrides, reset } from '../../src/state/session';

const EM_DASH = '—';

beforeEach(() => act(() => reset()));
afterEach(() => cleanup());

const PAGES = [
  { name: 'Method', Page: MethodPage, h1: 'How the model works' },
  { name: 'Assumptions', Page: AssumptionsPage, h1: 'What the model assumes' },
  { name: 'Sources', Page: SourcesPage, h1: 'Where the data comes from' },
] as const;

describe.each(PAGES)('$name page', ({ Page, h1 }) => {
  it('renders its H1', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(h1);
  });

  it('has no em dash and no "LCOA"', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';
    expect(text).not.toContain(EM_DASH);
    expect(text).not.toMatch(/LCOA/i);
  });

  it('names every landmark section with a heading', () => {
    render(<Page />);
    for (const section of screen.getAllByRole('region')) {
      expect(section.getAttribute('aria-labelledby')).toBeTruthy();
    }
  });
});

// The Method page defaults to the cost build-up, so the matching case is the build-up one.
const golden = costsGolden.moonidih_2034_default;

describe('Method page', () => {
  it('stays under 1000 words above the fold-out', () => {
    const { container } = render(<MethodPage />);
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('details, .sr-only').forEach((n) => n.remove());
    const words = (clone.textContent ?? '').split(/\s+/).filter(Boolean).length;
    // The count is reported in the PR.
    console.info(`Method page words above the fold-out: ${words}`);
    expect(words).toBeLessThan(1000); // was 900 before the "What the costs include" section (Step 13c)
  });

  it('keeps technical detail in one closed <details>', () => {
    const { container } = render(<MethodPage />);
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
  });

  it('shows the Moonidih break-even from the model, matching the golden case', () => {
    const w = workedCase();
    // The default closure year is the workbook year, so the example is the 2034 golden case.
    expect(w.mine.closureYear).toBe(2034);
    expect(w.result.breakevenUsdPerT).toBeCloseTo(golden.breakeven, 3);
    const { container } = render(<MethodPage />);
    expect(container.textContent).toContain(`${usdPerT(golden.breakeven)} a tonne when it closes in 2034`);
  });

  it('worked credits equal the product of the factors shown', () => {
    const { drained } = workedCase();
    const product =
      drained.ch4Mm3 * drained.captureEff * drained.tonnesPerMm3 * drained.destructionEff * drained.netTco2ePerTCh4;
    expect(Math.abs(product - drained.erTco2e)).toBeLessThanOrEqual(drained.erTco2e * 0.005);
  });

  it('explains the break-even terms so they sum to the shown price', () => {
    const { explanation } = workedCase();
    const sum = explanation.numerator.reduce((s, t) => s + t.value, 0);
    expect(sum).toBeCloseTo(explanation.numeratorUsd, 6);
  });
});

describe('Assumptions page', () => {
  it('lists value, unit, source and quality tag for settings, technology, constants and prices', () => {
    render(<AssumptionsPage />);
    for (const name of ['Settings', 'Gas engines (power)', 'Constants', 'Credit price scenarios']) {
      const table = screen.getByRole('table', { name });
      expect(within(table).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(5);
    }
    const settings = screen.getByRole('table', { name: 'Settings' });
    expect(within(settings).getAllByText(/^(Measured|Estimated|Literature|Dummy)$/).length).toBeGreaterThan(0);
  });

  it('shows no inputs, no banner and no reset until asked', () => {
    render(<AssumptionsPage />);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset all' })).toBeNull();
  });

  it('writes a session override, shows the banner, and Reset all clears it', async () => {
    const user = userEvent.setup();
    render(<AssumptionsPage />);
    await user.click(screen.getByRole('button', { name: 'Change for this session' }));
    const input = screen.getByRole('spinbutton', { name: /^Power price, USD per MWh$/ });
    await user.clear(input);
    await user.type(input, '95');
    expect(getOverrides()['settings.powerPriceUsdPerMwh']).toBe(95);
    expect(screen.getByRole('status').textContent).toContain('1 assumption is changed');
    await user.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(getOverrides()).toEqual({});
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not save a value the data schema rejects, and says why', async () => {
    const user = userEvent.setup();
    render(<AssumptionsPage />);
    await user.click(screen.getByRole('button', { name: 'Change for this session' }));
    const input = screen.getByRole('spinbutton', { name: /^Build cost per kW, USD per kW installed$/ });
    await user.clear(input);
    await user.type(input, '-5');
    expect(getOverrides()).toEqual({});
    expect(screen.getByRole('alert').textContent).toMatch(/^Not saved:/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('removes the override when the value goes back to the data file value', async () => {
    const user = userEvent.setup();
    render(<AssumptionsPage />);
    await user.click(screen.getByRole('button', { name: 'Change for this session' }));
    const input = screen.getByRole('spinbutton', { name: /^Contingency on build cost,/ });
    const original = (input as HTMLInputElement).value;
    await user.clear(input);
    await user.type(input, '0.2');
    expect(Object.keys(getOverrides())).toEqual(['settings.contingency']);
    await user.clear(input);
    await user.type(input, original);
    expect(getOverrides()).toEqual({});
  });

  it('keeps the crediting period and first year read-only', async () => {
    const user = userEvent.setup();
    render(<AssumptionsPage />);
    await user.click(screen.getByRole('button', { name: 'Change for this session' }));
    expect(screen.queryByRole('spinbutton', { name: /^Crediting period/ })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: /^First crediting year/ })).toBeNull();
  });
});

describe('Sources page', () => {
  it('has the data-request mailto and a cite line', () => {
    render(<SourcesPage />);
    const mail = screen.getByRole('link', { name: 'aashish.yadav@duke.edu' });
    expect(mail.getAttribute('href')).toBe('mailto:aashish.yadav@duke.edu');
    expect(screen.getByRole('heading', { name: 'How to cite' })).toBeTruthy();
  });

  it('credits DataMeet and lists the research sources', () => {
    render(<SourcesPage />);
    expect(screen.getByRole('link', { name: 'DataMeet' }).getAttribute('href')).toBe('https://github.com/datameet/maps');
    const list = screen.getByRole('heading', { name: 'Research sources' }).closest('section');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);
  });
});

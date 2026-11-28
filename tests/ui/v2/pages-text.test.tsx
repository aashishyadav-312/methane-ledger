import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadLazyPages, settle } from '../lazyPages';
import { App } from '../../../src/app/App';
import { getOverrides, reset } from '../../../src/state/session';
import { positionCounts } from '../../../src/v2/pages/mineFacts';

async function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await settle();
}

beforeAll(preloadLazyPages);

beforeEach(() => {
  window.scrollTo = vi.fn();
  window.location.hash = '#/';
  act(() => reset());
});
afterEach(() => cleanup());

const EM_DASH = '—';
const ARROW = '→';
const PAGES = [
  { hash: '#/compare', h1: 'Which mines pay?' },
  { hash: '#/method', h1: 'How the model works' },
  { hash: '#/assumptions', h1: 'What the model assumes' },
  { hash: '#/sources', h1: 'Where the data comes from' },
  { hash: '#/data', h1: 'Use your own mine data' },
] as const;

describe.each(PAGES)('v2 page $hash', ({ hash, h1 }) => {
  it('renders one H1 inside the v2 shell, with no em dash and no arrow', async () => {
    const { container } = render(<App />);
    await goTo(hash);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(h1);
    expect(container.querySelector('header.v2-header')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).not.toContain(EM_DASH);
    expect(text).not.toMatch(/LCOA/i);
    expect(text).not.toContain(ARROW);
  });
});

describe('Method page', () => {
  it('has the two v2 sections and drops the old "positions are approximate" claim', async () => {
    const { container } = render(<App />);
    await goTo('#/method');
    const inputs = screen.getByTestId('method-inputs');
    expect(within(inputs).getByRole('heading', { name: 'How every mine gets inputs' })).toBeTruthy();
    expect(inputs.querySelectorAll('li')).toHaveLength(5);
    const positions = screen.getByTestId('method-positions');
    expect(within(positions).getByRole('heading', { name: 'Mine positions' })).toBeTruthy();
    const { gem, total } = positionCounts();
    expect(positions.textContent).toContain(`${gem} sit at the coordinates`);
    expect(positions.textContent).toContain(`Of the ${total} operating mines`);
    expect(container.textContent).not.toContain('No source gives mine coordinates');
  });
});

describe('Assumptions page', () => {
  it('lists the estimation parameters with a source and a quality tag on every row', async () => {
    render(<App />);
    await goTo('#/assumptions');
    const section = screen.getByTestId('estimation-table');
    const rows = section.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(15);
    rows.forEach((row) => {
      expect(row.querySelector('.assume-source')?.textContent?.length).toBeGreaterThan(0);
      expect(row.querySelector('.tag')?.textContent).toBe('Estimated');
    });
  });
});

describe('Sources page', () => {
  it('credits Global Energy Monitor with its licence line, and states the estimation', async () => {
    render(<App />);
    await goTo('#/sources');
    expect(screen.getByTestId('gem-licence').textContent).toMatch(/Global Coal Mine Tracker.*CC BY 4\.0/);
    expect(screen.getByRole('heading', { name: 'Global Energy Monitor' })).toBeTruthy();
    expect(screen.getByText(/Every other mine\./)).toBeTruthy();
  });
});

describe('Compare page', () => {
  it('headline is computed: at $15, 4 of 58 mines', async () => {
    render(<App />);
    await goTo('#/compare');
    expect(screen.getByTestId('headline').textContent).toMatch(
      /^At \$15 a tonne, 4 of 58 mines break even, cutting \d+\.\d{2} MtCO2e over 10 years\.$/,
    );
  });

  it('names the ten cheapest bars and leaves the rest unlabelled', async () => {
    render(<App />);
    await goTo('#/compare');
    const bars = screen.getAllByTestId(/^supply-bar-/);
    expect(bars).toHaveLength(58);
    expect(bars.filter((b) => b.getAttribute('data-labelled') === 'true')).toHaveLength(10);
    expect(bars.filter((b) => b.getAttribute('data-pays') === 'true')).toHaveLength(4);
  });

  it('every bar links to its mine page', async () => {
    render(<App />);
    await goTo('#/compare');
    expect(screen.getByTestId('supply-bar-bccl-amp-colliery').getAttribute('href')).toBe('#/mine/bccl-amp-colliery');
  });

  it('shows Estimated inputs on estimated mines and Illustrative inputs on Moonidih', async () => {
    render(<App />);
    await goTo('#/compare');
    expect(within(screen.getByTestId('rank-bccl-moonidih')).getByText('Illustrative inputs')).toBeTruthy();
    expect(within(screen.getByTestId('rank-bccl-amp-colliery')).getByText('Estimated inputs')).toBeTruthy();
  });

  it('the subsidiary filter narrows the list and the headline', async () => {
    render(<App />);
    await goTo('#/compare');
    await userEvent.click(screen.getByRole('button', { name: /^BCCL \(\d+\)$/ }));
    expect(screen.getByTestId('headline').textContent).toMatch(/of \d+ BCCL mines break even/);
    expect(screen.queryByTestId('rank-ecl-jhanjra-project-colliery')).toBeNull();
    expect(getOverrides()).toEqual({});
  });

  it('the archetype toggle adds the archetypes', async () => {
    render(<App />);
    await goTo('#/compare');
    const before = screen.getAllByTestId(/^supply-bar-/).length;
    await userEvent.click(screen.getByRole('button', { name: 'Show the five archetypes' }));
    expect(screen.getAllByTestId(/^supply-bar-/).length).toBeGreaterThan(before);
    expect(screen.getByTestId('headline').textContent).toContain('mines and archetypes');
  });

  it('side by side takes two or three mines', async () => {
    render(<App />);
    await goTo('#/compare');
    expect(screen.getByTestId('side-by-side').querySelectorAll('thead th')).toHaveLength(2);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare NAKC' }));
    expect(screen.getByTestId('side-by-side').querySelectorAll('thead th')).toHaveLength(3);
    const fourth = screen.getByRole('checkbox', { name: 'Compare Jhanjra Project Colliery' }) as HTMLInputElement;
    expect(fourth.disabled).toBe(true);
  });
});

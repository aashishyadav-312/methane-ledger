import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadLazyPages, settle } from './lazyPages';
import { App } from '../../src/app/App';

async function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await settle();
}

beforeAll(preloadLazyPages);

beforeEach(() => {
  window.location.hash = '#/';
  window.scrollTo = vi.fn();
});

afterEach(() => cleanup());

describe('App routing', () => {
  it('renders the page for each route', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Which closing mines can pay for their own methane?',
    );
    await goTo('#/mine/bccl-moonidih?p=15');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Moonidih');
    await goTo('#/method');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How the model works');
    await goTo('#/ui');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Component gallery');
  });

  it('keeps the query string in the address', async () => {
    render(<App />);
    await goTo('#/mine/bccl-moonidih?p=15&close=2034');
    expect(window.location.hash).toBe('#/mine/bccl-moonidih?p=15&close=2034');
  });

  it('shows a plain "Page not found" with a link to the map', async () => {
    render(<App />);
    await goTo('#/nowhere');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    const link = screen.getByRole('link', { name: /back to the map/i });
    expect(link.getAttribute('href')).toBe('#/');
  });

  it('sets the page title per route', async () => {
    render(<App />);
    expect(document.title).toBe('Methane Ledger');
    await goTo('#/method');
    expect(document.title).toBe('Method · Methane Ledger');
    await goTo('#/nowhere');
    expect(document.title).toBe('Page not found · Methane Ledger');
  });

  it('scrolls to the top and focuses the H1 on route change, but not on the first load or a query-only change', async () => {
    render(<App />);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);

    await goTo('#/method');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    await goTo('#/method?x=1');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe('Header', () => {
  // The v2 nav is Map, Data and the About menu; tests/ui/v2/nav.test.tsx covers the menu itself.
  it('marks the current page in the nav', async () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const current = () => Array.from(nav.querySelectorAll('[aria-current="page"]')).map((a) => a.textContent);
    expect(current()).toEqual(['Map']);
    await goTo('#/mine/bccl-moonidih');
    expect(current()).toEqual(['Map']);
    await goTo('#/data');
    expect(current()).toEqual(['Data']);
    for (const hash of ['#/method', '#/sources', '#/compare', '#/assumptions']) {
      await goTo(hash);
      expect(current()).toEqual(['About']);
    }
    await goTo('#/ui');
    expect(current()).toEqual([]);
  });

  it('links to Map and Data, and opens the About menu', async () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = Array.from(nav.querySelectorAll(':scope > a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Map', '#/'],
      ['Data', '#/data'],
    ]);
    expect(nav.querySelector('button')?.textContent).toBe('About');
  });

  it('shows the research preview tag and the footer lines', async () => {
    render(<App />);
    expect(screen.getByText('Research preview')).toBeTruthy();
    await goTo('#/method');
    expect(screen.getByText(/Nicholas Institute, Duke University/)).toBeTruthy();
    expect(screen.getByText('Indicative, pre-feasibility results. Not investment advice.')).toBeTruthy();
  });
});

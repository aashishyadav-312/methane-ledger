import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  window.location.hash = '#/';
  window.scrollTo = vi.fn();
});

afterEach(() => cleanup());

describe('App routing', () => {
  it('renders the page for each route', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('MapPage');
    goTo('#/mine/bccl-moonidih?p=15');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Moonidih');
    goTo('#/method');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('MethodPage');
    goTo('#/ui');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Component gallery');
  });

  it('keeps the query string in the address', () => {
    render(<App />);
    goTo('#/mine/bccl-moonidih?p=15&close=2034');
    expect(window.location.hash).toBe('#/mine/bccl-moonidih?p=15&close=2034');
  });

  it('shows a plain "Page not found" with a link to the map', () => {
    render(<App />);
    goTo('#/nowhere');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    const link = screen.getByRole('link', { name: /back to the map/i });
    expect(link.getAttribute('href')).toBe('#/');
  });

  it('sets the page title per route', () => {
    render(<App />);
    expect(document.title).toBe('Methane Ledger');
    goTo('#/method');
    expect(document.title).toBe('Method · Methane Ledger');
    goTo('#/nowhere');
    expect(document.title).toBe('Page not found · Methane Ledger');
  });

  it('scrolls to the top and focuses the H1 on route change, but not on the first load or a query-only change', () => {
    render(<App />);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);

    goTo('#/method');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    goTo('#/method?x=1');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe('Header', () => {
  it('marks the current page in the nav', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const current = () => Array.from(nav.querySelectorAll('[aria-current="page"]')).map((a) => a.textContent);
    expect(current()).toEqual(['Map']);
    goTo('#/mine/bccl-moonidih');
    expect(current()).toEqual(['Map']);
    goTo('#/method');
    expect(current()).toEqual(['Method']);
    goTo('#/sources');
    expect(current()).toEqual(['Sources']);
    goTo('#/compare');
    expect(current()).toEqual([]);
  });

  it('shows the research preview tag and the footer lines', () => {
    render(<App />);
    expect(screen.getByText('Research preview')).toBeTruthy();
    expect(screen.getByText(/Nicholas Institute, Duke University/)).toBeTruthy();
    expect(screen.getByText('Indicative, pre-feasibility results. Not investment advice.')).toBeTruthy();
  });
});

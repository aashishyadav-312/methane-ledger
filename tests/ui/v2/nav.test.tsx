import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/app/App';
import minesMap from '../../../src/generated/mines_map.json';
import { MineSearch } from '../../../src/v2/search';
import type { SearchableMine } from '../../../src/v2/search';

const mines = minesMap.mines as SearchableMine[];

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

const nav = () => screen.getByRole('navigation', { name: 'Main' });
const aboutButton = () => within(nav()).getByRole('button', { name: 'About' });
const current = () =>
  Array.from(nav().querySelectorAll('[aria-current="page"]')).map((el) => el.textContent?.replace(/\s+/g, ' ').trim());

describe('routes', () => {
  it('resolves every route to a page with one H1', () => {
    render(<App />);
    const h1 = () => screen.getByRole('heading', { level: 1 }).textContent;
    expect(h1()).toBe('Which closing mines can pay for their own methane?');
    goTo('#/mine/bccl-moonidih');
    expect(h1()).toBe('Moonidih');
    goTo('#/method');
    expect(h1()).toBe('How the model works');
    for (const hash of ['#/compare', '#/assumptions', '#/sources', '#/data']) {
      goTo(hash);
      expect(screen.getAllByRole('heading', { level: 1 }), hash).toHaveLength(1);
    }
    goTo('#/nowhere');
    expect(h1()).toBe('Page not found');
    goTo('#/mine');
    expect(h1()).toBe('Page not found');
  });

  it('shows the footer on pages and not on the home', () => {
    render(<App />);
    expect(screen.queryByRole('contentinfo')).toBeNull();
    goTo('#/method');
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('keeps the v1 pages rendering inside the v2 shell', () => {
    const { container } = render(<App />);
    goTo('#/assumptions');
    expect(container.querySelector('header.v2-header')).toBeTruthy();
    expect(screen.getByRole('main').querySelector('h1')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});

describe('header', () => {
  it('shows the wordmark, the Research preview pill, Map, Data and About', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Methane Ledger' }).getAttribute('href')).toBe('#/');
    expect(screen.getByText('Research preview')).toBeTruthy();
    const links = Array.from(nav().querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Map', '#/'],
      ['Data', '#/data'],
    ]);
    expect(aboutButton().getAttribute('aria-haspopup')).toBe('menu');
    expect(aboutButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the active section with aria-current', () => {
    render(<App />);
    expect(current()).toEqual(['Map']);
    goTo('#/mine/bccl-moonidih');
    expect(current()).toEqual(['Map']);
    goTo('#/data');
    expect(current()).toEqual(['Data']);
    goTo('#/method');
    expect(current()).toEqual(['About']);
    goTo('#/ui');
    expect(current()).toEqual([]);
  });
});

describe('About menu', () => {
  it('opens on click with its four pages and the link to the v1 site', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(aboutButton());
    const menu = screen.getByRole('menu', { name: 'About' });
    expect(aboutButton().getAttribute('aria-expanded')).toBe('true');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((el) => el.querySelector('.v2-menu-label')?.textContent)).toEqual([
      'Compare',
      'Method',
      'Assumptions',
      'Sources',
      'Version 1 site',
    ]);
    expect(items.map((el) => el.getAttribute('href'))).toEqual([
      '#/compare',
      '#/method',
      '#/assumptions',
      '#/sources',
      '/methane-ledger/',
    ]);
    // Each page has its one-line description.
    for (const item of items.slice(0, 4)) expect(item.querySelector('.v2-menu-desc')?.textContent).toBeTruthy();
    // Focus lands on the first item.
    expect(document.activeElement).toBe(items[0]);
  });

  it('opens on Enter and with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    aboutButton().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement?.textContent).toContain('Compare');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Compare');
    await user.keyboard('{Escape}');

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Version 1 site');
  });

  it('moves with the arrow keys, Home, End and typed letters', async () => {
    const user = userEvent.setup();
    render(<App />);
    aboutButton().focus();
    await user.keyboard('{Enter}');
    const focused = () => document.activeElement?.querySelector('.v2-menu-label')?.textContent;
    expect(focused()).toBe('Compare');
    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe('Method');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(focused()).toBe('Sources');
    await user.keyboard('{ArrowUp}');
    expect(focused()).toBe('Assumptions');
    await user.keyboard('{End}');
    expect(focused()).toBe('Version 1 site');
    await user.keyboard('{ArrowDown}'); // wraps
    expect(focused()).toBe('Compare');
    await user.keyboard('{ArrowUp}'); // wraps back
    expect(focused()).toBe('Version 1 site');
    await user.keyboard('{Home}');
    expect(focused()).toBe('Compare');
    await user.keyboard('s');
    expect(focused()).toBe('Sources');
  });

  it('closes on Esc and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(aboutButton());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(aboutButton());
    expect(aboutButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a click outside, on Tab, and on a second click of the button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(aboutButton());
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(aboutButton());
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(aboutButton());
    await user.click(aboutButton());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when a page is chosen, and marks the current page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(aboutButton());
    await user.click(screen.getByRole('menuitem', { name: /^Method/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    goTo('#/method');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How the model works');
    expect(current()).toEqual(['About']);
    await user.click(aboutButton());
    const marked = screen.getAllByRole('menuitem').filter((el) => el.getAttribute('aria-current') === 'page');
    expect(marked.map((el) => el.querySelector('.v2-menu-label')?.textContent)).toEqual(['Method']);
  });

  it('closes when the route changes under it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(aboutButton());
    goTo('#/data');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('phone nav', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('folds the nav into one Menu button with every page in it', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({
        matches: query.includes('max-width: 720px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    expect(within(nav()).queryByRole('link')).toBeNull();
    await user.click(within(nav()).getByRole('button', { name: 'Menu' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((el) => el.querySelector('.v2-menu-label')?.textContent)).toEqual([
      'Map',
      'Data',
      'Compare',
      'Method',
      'Assumptions',
      'Sources',
      'Version 1 site',
    ]);
    expect(items.filter((el) => el.getAttribute('aria-current') === 'page').map((el) => el.textContent)).toEqual(['Map']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('MineSearch', () => {
  function Harness({ onSelect }: { onSelect: (id: string) => void }) {
    const [last, setLast] = useState('');
    return (
      <>
        <MineSearch
          mines={mines}
          onSelect={(id) => {
            setLast(id);
            onSelect(id);
          }}
        />
        <output data-testid="last">{last}</output>
      </>
    );
  }
  const box = () => screen.getByRole('combobox', { name: 'Search mines' });

  it('is a combobox that lists the top matches, best first, with the count', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);
    expect(box().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.type(box(), 'mo');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeLessThanOrEqual(8);
    expect(options[0].textContent).toContain('Moonidih');
    expect(options[0].textContent).toContain('BCCL, Jharkhand, underground');
    expect(options[0].textContent).toContain('runs out 2034');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(box().getAttribute('aria-expanded')).toBe('true');
    expect(box().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(box().getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(screen.getByText(new RegExp(`^\\d+ of ${mines.length}$`))).toBeTruthy();
    // The typed text is the semibold part of the name.
    expect(options[0].querySelector('.v2-search-hit')?.textContent).toBe('Mo');
  });

  it('moves with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.type(box(), 'mo');
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(box().getAttribute('aria-activedescendant')).toBe(options[1].id);
    await user.keyboard('{ArrowUp}{ArrowUp}'); // wraps to the last row
    expect(screen.getAllByRole('option').at(-1)?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}'); // back to the first
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('bccl-moonidih');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((box() as HTMLInputElement).value).toBe('Moonidih');
  });

  it('selects a row on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.type(box(), 'moonidih');
    await user.click(screen.getAllByRole('option')[0]);
    expect(onSelect).toHaveBeenCalledWith('bccl-moonidih');
  });

  it('shows a message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);
    await user.type(box(), 'xyz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText("No mine matches 'xyz'. Try a company or state.")).toBeTruthy();
    expect(screen.getByText(`0 of ${mines.length}`)).toBeTruthy();
  });

  it('clears and closes on Esc', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);
    await user.type(box(), 'mo');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect((box() as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(box());
  });

  it('focuses on "/" unless the person is typing in another field', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness onSelect={() => {}} />
        <input aria-label="Other" />
      </>,
    );
    await user.click(document.body);
    await user.keyboard('/');
    expect(document.activeElement).toBe(box());
    expect((box() as HTMLInputElement).value).toBe(''); // the slash is not typed

    screen.getByLabelText('Other').focus();
    await user.keyboard('/');
    expect((screen.getByLabelText('Other') as HTMLInputElement).value).toBe('/');
  });

  it('works inside the app: choosing a mine opens its page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('combobox', { name: 'Search mines' }), 'moonidih');
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#/mine/bccl-moonidih');
  });
});

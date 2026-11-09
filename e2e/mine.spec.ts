import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const golden = JSON.parse(readFileSync(new URL('../tests/golden/moonidih_wb2034.json', import.meta.url), 'utf8')) as {
  breakeven: number;
};
const usd = (x: number) => `$${x.toFixed(2)}`;
const MINE = '#/mine/bccl-moonidih';

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // The app shell has no favicon yet, so the browser's automatic /favicon.ico request 404s. Not this page.
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const breakeven = (page: Page) => page.getByTestId('breakeven');
const npvTile = (page: Page) =>
  page.getByTestId('metrics').locator('.metric-tile', { hasText: 'Net present value' }).locator('.metric-value');

test('default view shows the golden break-even', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(MINE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Moonidih');
  await expect(breakeven(page)).toHaveText(usd(golden.breakeven));
  await expect(page.getByText('Illustrative inputs')).toBeVisible();
  expect(errors).toEqual([]);
});

test('"At 2026-27 target" shows $8.33', async ({ page }) => {
  await page.goto(MINE);
  await page.getByRole('button', { name: /At 2026-27 target/ }).click();
  await expect(breakeven(page)).toHaveText('$8.33');
  await expect(page.getByRole('button', { name: /At 2026-27 target/ })).toHaveAttribute('aria-pressed', 'true');
});

test('$5 a tonne with closure in 2030 gives a negative NPV', async ({ page }) => {
  await page.goto(MINE);
  await page.getByRole('button', { name: /At 2026-27 target/ }).click();
  await page.getByLabel(/Credit price in US dollars/).fill('5');
  await expect(npvTile(page)).toHaveText(/^−\$/);
  await expect(page.getByTestId('sentence')).toContainText('At $5 a tonne, the project falls');
});

test('a copied URL reproduces the view', async ({ page }) => {
  await page.goto(MINE);
  await page.getByRole('button', { name: '30%' }).click();
  await page.getByRole('button', { name: 'Flare it' }).click();
  await page.getByRole('button', { name: '0.6%' }).click();
  await page.getByLabel(/Credit price in US dollars/).fill('22.5');
  await expect(page).toHaveURL(/p=22\.5/);
  await expect(page).toHaveURL(/g=30/);
  const url = page.url();
  const shown = {
    be: await breakeven(page).textContent(),
    npv: await npvTile(page).textContent(),
    sentence: await page.getByTestId('sentence').textContent(),
  };

  const fresh = await page.context().newPage();
  await fresh.goto(url);
  await expect(breakeven(fresh)).toHaveText(shown.be ?? '');
  await expect(npvTile(fresh)).toHaveText(shown.npv ?? '');
  await expect(fresh.getByTestId('sentence')).toHaveText(shown.sentence ?? '');
  await expect(fresh.getByRole('button', { name: 'Flare it' })).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard: Tab reaches the controls and arrow keys move the sliders', async ({ page }) => {
  await page.goto(MINE);
  const price = page.getByRole('slider', { name: 'Credit price' });
  await price.focus();
  await page.keyboard.press('ArrowRight');
  await expect(price).toHaveValue('16');
  await expect(page).toHaveURL(/p=16/);

  await page.keyboard.press('Tab'); // first price chip
  await expect(page.locator(':focus')).toHaveClass(/chip/);

  const drained = page.getByRole('slider', { name: 'Drained gas' });
  await drained.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(drained).toHaveValue('19');

  const close = page.getByRole('slider', { name: 'Last year of mining' });
  await close.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(close).toHaveValue('2033');
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
});

test('no console errors and no horizontal overflow at 390px', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MINE);
  await expect(breakeven(page)).toBeVisible();
  const overflow = (await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')) as number;
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

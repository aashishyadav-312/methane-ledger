import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = <T>(name: string) =>
  JSON.parse(readFileSync(new URL(`../tests/golden/${name}`, import.meta.url), 'utf8')) as T;

type Fin = Record<string, Record<string, Record<string, number | boolean>>>;
const financing = read<Fin>('financing_v1.json');
const tornado = read<Record<'moonidih_v1' | 'moonidih_wb2034', { top6: string[] }>>('tornado_v1.json');

const usd = (x: number) => `$${x.toFixed(2)}`;
const MINE = '#/mine/bccl-moonidih';
// financing_v1 and tornado_v1 are v1's all-in unit costs: `cm=v1` (Step 13b).
const MINE_V1 = `${MINE}?cm=v1`;

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
const structure = (page: Page, name: RegExp) => page.getByRole('radio', { name });
const target2030 = (page: Page) => page.getByRole('button', { name: /At 2026-27 target/ }).click();

async function csvLines(page: Page): Promise<string[]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  const path = await download.path();
  return readFileSync(path, 'utf8').trim().split(/\r?\n/);
}

test('v1 costs: structure E at 2030 shows the golden break-even and turns the grant on', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(MINE_V1);
  await target2030(page);
  await structure(page, /A grant or gap funding/).click();
  await expect(structure(page, /A grant or gap funding/)).toHaveAttribute('aria-checked', 'true');
  await expect(breakeven(page)).toHaveText(usd(financing.at_15.E.breakeven as number));
  await expect(breakeven(page)).toHaveText('$2.73');
  await expect(page.getByRole('button', { name: '30%' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/s=E/);
  expect(errors).toEqual([]);
});

test('v1 costs: structure B at $5 shows the developer-declines message', async ({ page }) => {
  await page.goto(MINE_V1);
  await target2030(page);
  await page.getByLabel(/Credit price in US dollars/).fill('5');
  await structure(page, /A developer builds and runs it/).click();
  const y = usd(financing.at_5.B.breakeven_for_developer as number);
  await expect(page.getByTestId('developer-declines')).toHaveText(
    `No developer would take this at $5 a tonne. They would need about ${y}.`,
  );
  await expect(breakeven(page)).toHaveText(y);
});

test('v1 costs: structure B at $15 by 2030: the developer goes ahead', async ({ page }) => {
  await page.goto(MINE_V1);
  await target2030(page);
  await structure(page, /A developer builds and runs it/).click();
  await expect(page.getByTestId('developer-declines')).toHaveCount(0);
  await expect(page.getByTestId('who-pays')).toContainText(
    `${((financing.at_15.B.dev_irr as number) * 100).toFixed(1)}%`,
  );
});

test('the CSV has one row per crediting year', async ({ page }) => {
  await page.goto(MINE);
  let lines = await csvLines(page);
  expect(lines[0]).toMatch(/^Year,/);
  expect(lines.length - 1).toBe(10);

  await page.getByRole('button', { name: '15 years' }).click();
  lines = await csvLines(page);
  expect(lines.length - 1).toBe(15);
});

test("v1 costs: the tornado's first row is tornado_v1 top6[0] for the current case", async ({ page }) => {
  await page.goto(MINE_V1);
  const first = page.getByTestId('tornado').locator('[data-key]').first();
  await expect(first).toHaveAttribute('data-key', tornado.moonidih_wb2034.top6[0]);

  await target2030(page);
  await expect(first).toHaveAttribute('data-key', tornado.moonidih_v1.top6[0]);
  await expect(page.getByTestId('tornado').locator('[data-key]')).toHaveCount(6);
});

test('structure and units round-trip through the URL', async ({ page }) => {
  await page.goto(MINE);
  await structure(page, /A buyer pays in advance/).click();
  await page.getByRole('button', { name: '₹' }).click();
  await page.getByRole('button', { name: 'tCH4' }).click();
  await expect(page).toHaveURL(/cur=inr/);
  await expect(page).toHaveURL(/unit=ch4/);
  await expect(breakeven(page)).toHaveText(/^₹/);
  const url = page.url();
  const shown = await breakeven(page).textContent();

  const fresh = await page.context().newPage();
  await fresh.goto(url);
  await expect(structure(fresh, /A buyer pays in advance/)).toHaveAttribute('aria-checked', 'true');
  await expect(breakeven(fresh)).toHaveText(shown ?? '');
  await expect(fresh.getByRole('button', { name: 'tCH4' })).toHaveAttribute('aria-pressed', 'true');
});

test('arrow keys move between the structures', async ({ page }) => {
  await page.goto(MINE);
  await structure(page, /Coal India funds it/).focus();
  await page.keyboard.press('ArrowRight');
  await expect(structure(page, /A developer builds and runs it/)).toBeFocused();
  await expect(structure(page, /A developer builds and runs it/)).toHaveAttribute('aria-checked', 'true');
});

test('the explain panel shows the break-even formula with this mine', async ({ page }) => {
  await page.goto(MINE);
  await page.getByText('Explain this number').click();
  const panel = page.getByTestId('explain');
  await expect(panel).toContainText('Build cost');
  await expect(panel.locator('strong')).toHaveText(await breakeven(page).innerText());
});

test('save chart as PNG gives a PNG twice the chart size', async ({ page }) => {
  await page.goto(MINE);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save chart as PNG: Cash each year' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  const pngWidth = bytes.readUInt32BE(16);
  const svgWidth = await page.getByTestId('chart-cash').locator('svg').first().evaluate((s) => s.clientWidth);
  expect(pngWidth).toBeGreaterThanOrEqual(svgWidth * 2);
});

test('no console errors and no horizontal overflow at 390px with every structure', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MINE);
  await page.getByText('Explain this number').click();
  for (const name of [/developer/, /buyer/, /price floor/, /grant or gap/]) {
    await structure(page, name).click();
    const overflow = (await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')) as number;
    expect(overflow).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

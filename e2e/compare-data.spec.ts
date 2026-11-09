import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const INPUTS = readFileSync(new URL('../public/templates/mine_inputs_template.csv', import.meta.url), 'utf8');
const SERIES = readFileSync(new URL('../public/templates/mine_series_template.csv', import.meta.url), 'utf8');

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const headline = (page: Page) => page.getByTestId('headline');
const bar = (page: Page, id: string) => page.getByTestId(`supply-bar-${id}`);
const priceBox = (page: Page) => page.getByLabel(/Credit price in US dollars/);
const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

test.describe('Compare', () => {
  test('renders the supply curve and a computed headline', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('#/compare');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which mines pay?');
    await expect(page.getByTestId('supply-curve').locator('svg')).toBeVisible();
    await expect(headline(page)).toHaveText(
      /^At \$15 a tonne, 2 of 6 mines and archetypes break even, cutting \d+\.\d{2} MtCO2e over 10 years\.$/,
    );
    expect(errors).toEqual([]);
  });

  // The pages default to the cost build-up (Step 13c), so these are build-up numbers.
  test('at $15 the paying set is Moonidih and Degree III underground; Degree III closing sits just above', async ({
    page,
  }) => {
    await page.goto('#/compare');
    for (const id of ['bccl-moonidih', 'archetype-degree-3-ug']) {
      await expect(bar(page, id)).toHaveAttribute('data-pays', 'true');
    }
    await expect(bar(page, 'archetype-degree-3-closing')).toHaveAttribute('data-pays', 'false');
    await expect(page.getByTestId('rank-archetype-degree-3-closing')).toContainText('$18.55');
    await expect(page.getByTestId('rank-archetype-degree-3-closing')).toContainText('Short by $3.55');
  });

  test('moving the price changes the headline count', async ({ page }) => {
    await page.goto('#/compare');
    await priceBox(page).fill('19');
    await expect(headline(page)).toContainText('At $19 a tonne, 3 of 6 mines and archetypes break even');
    await expect(bar(page, 'archetype-degree-3-closing')).toHaveAttribute('data-pays', 'true');
    await priceBox(page).fill('5');
    await expect(headline(page)).toContainText('At $5 a tonne, 1 of 6 mines and archetypes break even');
    await priceBox(page).fill('0.5');
    await expect(headline(page)).toHaveText('At $0.50 a tonne, none of the 6 mines and archetypes break even.');
  });

  test('a copied URL reproduces the price and the selection', async ({ page }) => {
    await page.goto('#/compare');
    await priceBox(page).fill('11');
    await page.getByRole('checkbox', { name: 'Compare Degree II underground' }).check();
    await expect.poll(() => page.url()).toContain('p=11');
    await expect.poll(() => page.url()).toContain('sel=');
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    await expect(headline(page)).toContainText('At $11 a tonne');
    await expect(page.getByRole('checkbox', { name: 'Compare Degree II underground' })).toBeChecked();
  });

  test('lists archetypes that cannot be abated, with the reason', async ({ page }) => {
    await page.goto('#/compare');
    const list = page.getByTestId('not-abatable');
    await expect(list).toContainText('Degree I underground');
    await expect(list).toContainText('Opencast');
    await expect(list).toContainText('0.05% methane, below the 0.20%');
  });

  test('side by side takes two or three entries', async ({ page }) => {
    await page.goto('#/compare');
    const table = page.getByTestId('side-by-side');
    await expect(table.locator('thead th')).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Compare Degree II underground' }).check();
    await expect(table.locator('thead th')).toHaveCount(3);
    const lastBox = page.getByRole('checkbox', { name: 'Compare Degree III, closing in 4 years' });
    await expect(lastBox).toBeDisabled();
  });

  test('scenario lines carry their badges', async ({ page }) => {
    await page.goto('#/compare');
    await expect(page.getByTestId('supply-line-ccts_floor')).toBeAttached();
    await expect(page.getByRole('list', { name: 'Price scenario lines' })).toContainText('Sellable later (CCTS)');
    await expect(page.getByRole('list', { name: 'Price scenario lines' })).toContainText('Benchmark only');
  });
});

test.describe('Data', () => {
  test('offers both templates for download', async ({ page, request }) => {
    await page.goto('#/data');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Use your own mine data');
    await expect(page.getByTestId('session-note')).toHaveText('Uploaded data is used only in this browser session.');
    for (const name of ['mine_inputs_template.csv', 'mine_series_template.csv']) {
      const href = await page.getByRole('link', { name }).getAttribute('href');
      const res = await request.get(new URL(href!, page.url()).toString());
      expect(res.ok()).toBe(true);
      expect(await res.text()).toContain('bccl-moonidih');
    }
  });

  test('uploading the unmodified templates changes nothing', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('#/data');
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', INPUTS));
    await page.getByTestId('upload-series').locator('input[type=file]').setInputFiles(csv('series.csv', SERIES));
    await expect(page.getByTestId('upload-inputs').getByTestId('upload-summary')).toContainText('1 of 1 row used');
    await expect(page.getByTestId('upload-series').getByTestId('upload-summary')).toContainText('8 of 8 rows used');
    await expect(page.getByTestId('uploaded-count')).toContainText('No uploaded values are in use');
    expect(errors).toEqual([]);
  });

  test('a changed value is used on the Compare page, and can be removed', async ({ page }) => {
    await page.goto('#/compare');
    const before = await page.getByTestId('rank-bccl-moonidih').textContent();
    await page.goto('#/data');
    const edited = INPUTS.replace('0.003,,no', '0.006,,no');
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', edited));
    await expect(page.getByTestId('uploaded-count')).toContainText('1 uploaded value is in use');
    await page.getByRole('link', { name: 'See the Compare page' }).click();
    await expect(page.getByTestId('rank-bccl-moonidih')).not.toHaveText(before!);
    await page.goto('#/data');
    await page.getByRole('button', { name: 'Remove uploaded values' }).click();
    await expect(page.getByTestId('uploaded-count')).toContainText('No uploaded values are in use');
  });

  test('a bad row is listed by row and column and is not used', async ({ page }) => {
    await page.goto('#/data');
    const bad = INPUTS.replace('0.003,,no', '5,,no');
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', bad));
    const errors = page.getByTestId('upload-errors');
    await expect(errors).toBeVisible();
    const row = errors.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(0)).toHaveText('3');
    await expect(row.locator('td').nth(1)).toHaveText('vam_conc');
    await expect(row.locator('td').nth(2)).toHaveText('must be at most 1 (found 5)');
    await expect(page.getByTestId('upload-summary')).toContainText('0 of 1 row used');
    await expect(page.getByTestId('uploaded-count')).toContainText('No uploaded values are in use');
  });
});

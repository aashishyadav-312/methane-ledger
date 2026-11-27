import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/*
 * Step 8: the About pages, Compare for every mine, and the Data page, inside the v2 shell.
 *
 * Moonidih is taken from its record, as the rest of the app does ("measured beats estimated"). Its break-even
 * ($3.37) is below AMP Colliery's ($4.49), so at $7 two mines pay and Moonidih is the cheapest bar. With
 * Moonidih taken from its estimate ($11.77) the counts are 4 at $15 and 1 at $7 and AMP Colliery is first
 * (tests/ui/v2/pages-compare.test.ts checks both).
 */

const TEMPLATE = readFileSync(new URL('../../public/templates/v2/mine_inputs_template.csv', import.meta.url), 'utf8');
const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

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
const paying = (page: Page) => page.locator('[data-testid^="supply-bar-"][data-pays="true"]');

const ABOUT_ROUTES = [
  { hash: '#/compare', h1: 'Which mines pay?' },
  { hash: '#/method', h1: 'How the model works' },
  { hash: '#/assumptions', h1: 'What the model assumes' },
  { hash: '#/sources', h1: 'Where the data comes from' },
  { hash: '#/data', h1: 'Use your own mine data' },
] as const;

test.describe('every About route renders inside the v2 shell', () => {
  for (const { hash, h1 } of ABOUT_ROUTES) {
    test(`${hash}`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto(hash);
      await expect(page.locator('header.v2-header')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
      await expect(page.locator('main#main')).toContainText(h1);
      await expect(page.getByRole('contentinfo')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Compare', () => {
  test('shows a computed headline for every modelled mine', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('#/compare');
    await expect(headline(page)).toHaveText(
      /^At \$15 a tonne, 4 of 58 mines break even, cutting \d+\.\d{2} MtCO2e over 10 years\.$/,
    );
    await expect(page.locator('[data-testid^="supply-bar-"]')).toHaveCount(58);
    expect(errors).toEqual([]);
  });

  test('4 mines pay at $15, and the price moves the count', async ({ page }) => {
    await page.goto('#/compare');
    await expect(paying(page)).toHaveCount(4);
    await priceBox(page).fill('7');
    await expect(headline(page)).toContainText('At $7 a tonne, 2 of 58 mines break even');
    await expect(paying(page)).toHaveCount(2);
    await expect(bar(page, 'bccl-moonidih')).toHaveAttribute('data-pays', 'true');
    await expect(bar(page, 'bccl-amp-colliery')).toHaveAttribute('data-pays', 'true');
    await priceBox(page).fill('0.5');
    await expect(headline(page)).toHaveText('At $0.50 a tonne, none of the 58 mines break even.');
  });

  test('the ten cheapest bars carry a name', async ({ page }) => {
    await page.goto('#/compare');
    await expect(page.locator('[data-testid^="supply-bar-"][data-labelled="true"]')).toHaveCount(10);
    await expect(bar(page, 'bccl-amp-colliery').locator('text')).toContainText('AMP Colliery');
  });

  test('hovering a bar names the mine', async ({ page }) => {
    await page.goto('#/compare');
    await bar(page, 'bccl-amp-colliery').hover();
    const tip = page.getByTestId('supply-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('AMP Colliery');
    await expect(tip).toContainText('BCCL');
  });

  test('clicking the cheapest bar opens its mine, and the next one opens AMP Colliery', async ({ page }) => {
    await page.goto('#/compare');
    await bar(page, 'bccl-moonidih').click();
    await expect(page).toHaveURL(/#\/mine\/bccl-moonidih/);
    await page.goBack();
    await expect(headline(page)).toBeVisible();
    await bar(page, 'bccl-amp-colliery').click();
    await expect(page).toHaveURL(/#\/mine\/bccl-amp-colliery/);
  });

  test('the ranked list links to a mine and tags estimated inputs', async ({ page }) => {
    await page.goto('#/compare');
    const row = page.getByTestId('rank-bccl-amp-colliery');
    await expect(row).toContainText('Estimated inputs');
    await expect(page.getByTestId('rank-bccl-moonidih')).toContainText('Illustrative inputs');
    await row.getByRole('link', { name: 'AMP Colliery' }).click();
    await expect(page).toHaveURL(/#\/mine\/bccl-amp-colliery/);
  });

  test('a subsidiary filter narrows the chart, the list and the headline', async ({ page }) => {
    await page.goto('#/compare');
    await page.getByRole('button', { name: /^ECL \(\d+\)$/ }).click();
    await expect(headline(page)).toContainText('ECL mines break even');
    await expect(bar(page, 'bccl-amp-colliery')).toHaveCount(0);
    await expect.poll(() => page.url()).toContain('sub=ECL');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(bar(page, 'bccl-amp-colliery')).toHaveCount(1);
  });

  test('the archetypes are an optional toggle', async ({ page }) => {
    await page.goto('#/compare');
    const before = await page.locator('[data-testid^="supply-bar-"]').count();
    await page.getByRole('button', { name: 'Show the five archetypes' }).click();
    await expect(headline(page)).toContainText('mines and archetypes');
    expect(await page.locator('[data-testid^="supply-bar-"]').count()).toBeGreaterThan(before);
  });

  test('side by side takes up to three mines, and a copied link reproduces them', async ({ page }) => {
    await page.goto('#/compare');
    const table = page.getByTestId('side-by-side');
    await expect(table.locator('thead th')).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Compare NAKC' }).check();
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect(page.getByRole('checkbox', { name: 'Compare Jhanjra Project Colliery' })).toBeDisabled();
    await expect.poll(() => page.url()).toContain('sel=');
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    await expect(page.getByRole('checkbox', { name: 'Compare NAKC' })).toBeChecked();
  });
});

test.describe('About pages', () => {
  test('Method explains how every mine gets inputs, and where positions come from', async ({ page }) => {
    await page.goto('#/method');
    const inputs = page.getByTestId('method-inputs');
    await expect(inputs.getByRole('heading', { name: 'How every mine gets inputs' })).toBeVisible();
    await expect(inputs.locator('li')).toHaveCount(5);
    await expect(inputs).toContainText('Global Energy Monitor');
    const positions = page.getByTestId('method-positions');
    await expect(positions.getByRole('heading', { name: 'Mine positions' })).toBeVisible();
    await expect(positions).toContainText('coordinates Global Energy Monitor gives');
  });

  test('Assumptions lists the estimation parameters with sources and quality tags', async ({ page }) => {
    await page.goto('#/assumptions');
    const table = page.getByTestId('estimation-table');
    await expect(table.getByRole('heading', { name: 'Estimated inputs for every mine' })).toBeVisible();
    await expect(table.locator('tbody tr').first()).toContainText('Estimated');
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(15);
  });

  test('Sources credits Global Energy Monitor with its licence', async ({ page }) => {
    await page.goto('#/sources');
    await expect(page.getByTestId('gem-licence')).toContainText('CC BY 4.0');
    await expect(page.getByRole('link', { name: 'Global Coal Mine Tracker' })).toBeVisible();
  });

  test('no em dashes, arrows or all-caps labels in the new copy', async ({ page }) => {
    for (const { hash } of ABOUT_ROUTES) {
      await page.goto(hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const text = await page.locator('main').innerText();
      expect(text, hash).not.toContain('—');
      expect(text, hash).not.toContain('→');
      // A label is capitals by style (text-transform) or by typing: neither is allowed.
      const caps = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('main h1, main h2, main h3, main th, main label, main button, main .eyebrow, main .tag')) {
          const text = (el.textContent ?? '').trim();
          // Two or more capital-only words in a row ("ESTIMATED INPUTS"); a lone acronym or mine name such as NAKC is fine.
          const typed = text.split(/\s+/).filter((w) => /^[A-Z]{2,}$/.test(w)).length >= 2 && text === text.toUpperCase();
          const styled = getComputedStyle(el).textTransform === 'uppercase';
          if (typed || styled) out.push(text);
        }
        return out;
      });
      expect(caps, hash).toEqual([]);
    }
  });
});

test.describe('Data', () => {
  test('offers the v2 template with the optional columns', async ({ page, request }) => {
    await page.goto('#/data');
    await expect(page.getByTestId('optional-columns')).toContainText('degree');
    await expect(page.getByTestId('optional-columns')).toContainText('methane_mm3');
    const href = await page.getByRole('link', { name: 'mine_inputs_template.csv' }).getAttribute('href');
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.ok()).toBe(true);
    const text = await res.text();
    expect(text.split('\n')[0]).toMatch(/,degree,methane_mm3$/);
    expect(text).toBe(TEMPLATE);
  });

  test('uploading the unmodified template changes nothing', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('#/data');
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', TEMPLATE));
    await expect(page.getByTestId('upload-inputs').getByTestId('upload-summary')).toContainText('2 of 2 rows used');
    await expect(page.getByTestId('uploaded-count')).toContainText('No uploaded values are in use');
    expect(errors).toEqual([]);
  });

  test('an uploaded degree overrides the estimate on Compare, and can be removed', async ({ page }) => {
    await page.goto('#/compare');
    const before = await page.getByTestId('rank-bccl-amp-colliery').textContent();
    await page.goto('#/data');
    const edited = TEMPLATE.trimEnd().replace(/,3,23\.7$/, ',1,');
    expect(edited).not.toBe(TEMPLATE.trimEnd());
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', edited));
    await expect(page.getByTestId('uploaded-count')).toContainText('1 uploaded value is in use');
    await page.getByRole('link', { name: 'See the Compare page' }).click();
    // At Degree I the mine has no drained gas and its ventilation air is too dilute, so it leaves the list.
    await expect(page.getByTestId('rank-bccl-amp-colliery')).toHaveCount(0);
    await page.goto('#/data');
    await page.getByRole('button', { name: 'Remove uploaded values' }).click();
    await expect(page.getByTestId('uploaded-count')).toContainText('No uploaded values are in use');
    await page.goto('#/compare');
    await expect(page.getByTestId('rank-bccl-amp-colliery')).toHaveText(before!);
  });

  test('a bad row is listed by row and column and is not used', async ({ page }) => {
    await page.goto('#/data');
    const bad = TEMPLATE.trimEnd().replace(/,3,23\.7$/, ',7,23.7');
    await page.getByTestId('upload-inputs').locator('input[type=file]').setInputFiles(csv('inputs.csv', bad));
    const errors = page.getByTestId('upload-errors');
    await expect(errors).toBeVisible();
    const row = errors.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(0)).toHaveText('4');
    await expect(row.locator('td').nth(1)).toHaveText('degree');
    await expect(row.locator('td').nth(2)).toHaveText('must be 1, 2 or 3 (found 7)');
    await expect(page.getByTestId('upload-summary')).toContainText('1 of 2 rows used');
  });
});

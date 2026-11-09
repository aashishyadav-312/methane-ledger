import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Step 13b: the "All assumptions" sheet and the "What it costs" card. Expected values are the cost build-up
// goldens (tests/golden/costs_v1_1.json, from reference/ref_v1_1.py).
const costs = JSON.parse(readFileSync(new URL('../tests/golden/costs_v1_1.json', import.meta.url), 'utf8')) as Record<
  string,
  { breakeven: number }
>;
const usd = (x: number) => `$${x.toFixed(2)}`;
const MINE = '#/mine/bccl-moonidih';
const MINE_2030 = `${MINE}?cb=target`;

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const breakeven = (page: Page) => page.getByTestId('breakeven');
const openButton = (page: Page) => page.getByRole('button', { name: /^All assumptions \(\d+\)$/ });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'All assumptions' });
const tab = (page: Page, name: string) => sheet(page).getByRole('tab', { name: new RegExp(`^${name}`) });
const numberBox = (page: Page, label: RegExp) => sheet(page).getByRole('spinbutton', { name: label });

async function openSheet(page: Page) {
  await openButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

/** The `x=` panel changes in a mine page URL: base64url of a JSON object of path to value. */
function panelChanges(url: string): Record<string, unknown> {
  const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  const x = query.get('x');
  return x === null ? {} : (JSON.parse(Buffer.from(x, 'base64url').toString('utf8')) as Record<string, unknown>);
}

/** `$17.06M` to 17.06 (millions). */
const millions = (text: string | null) => Number((text ?? '').replace(/[^0-9.]/g, ''));

test('the sheet opens and closes by keyboard, and gives focus back', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(MINE);
  await openButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('searchbox')).toBeFocused();
  await expect(openButton(page)).toHaveAttribute('aria-expanded', 'true');

  // Tab stays inside the sheet.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await sheet(page).evaluate((el) => el.contains(el.ownerDocument.activeElement))).toBe(true);

  // Arrow keys move between the group tabs.
  await tab(page, 'Market').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Mine and gas')).toBeFocused();
  await expect(tab(page, 'Mine and gas')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(openButton(page)).toBeFocused();

  // A click on the scrim closes it too.
  await openSheet(page);
  await page.getByTestId('adv-scrim').click({ position: { x: 20, y: 20 } });
  await expect(sheet(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('85 rupees per dollar at 2030 shows $11.64', async ({ page }) => {
  await page.goto(MINE_2030);
  await expect(breakeven(page)).toHaveText(usd(costs.moonidih_2030_default.breakeven));
  await openSheet(page);
  await numberBox(page, /^Rupees per US dollar/).fill('85');
  await expect(breakeven(page)).toHaveText(usd(costs.moonidih_2030_fx85.breakeven));
  await expect(breakeven(page)).toHaveText('$11.64');
  // The 2030 closure year (cb=target) is one change from the default; the rupee rate is the second.
  await expect(page.getByTestId('adv-changed')).toHaveText('2 changed');
  await expect(page.locator('.mine-fx')).toContainText('at ₹85 per $');
});

test('a local factor of 1.0 at 2030 shows $14.10', async ({ page }) => {
  await page.goto(MINE_2030);
  await openSheet(page);
  await tab(page, 'Costs').click();
  await numberBox(page, /^Local factor for Indian labour/).fill('1');
  await expect(breakeven(page)).toHaveText(usd(costs.moonidih_2030_local_factor_1.breakeven));
  await expect(breakeven(page)).toHaveText('$14.10');
});

test('an out-of-range value shows a message and is not applied', async ({ page }) => {
  await page.goto(MINE_2030);
  await openSheet(page);
  await tab(page, 'Costs').click();
  const box = numberBox(page, /^Local factor for Indian labour/);
  await box.fill('9');
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet(page).getByRole('alert')).toContainText('Enter a number from');
  await expect(breakeven(page)).toHaveText('$11.54');
});

test('the v1 cost basis switch gives the v1 numbers and cm=v1', async ({ page }) => {
  await page.goto(MINE_2030);
  await openSheet(page);
  await tab(page, 'Costs').click();
  await sheet(page).getByRole('button', { name: 'v1 all-in unit costs' }).click();
  await expect(breakeven(page)).toHaveText('$8.33');
  await expect(page).toHaveURL(/cm=v1/);
  await expect(page.getByTestId('cost-card-v1')).toBeVisible();
});

test('Reset all restores the defaults', async ({ page }) => {
  await page.goto(MINE_2030);
  await openSheet(page);
  await numberBox(page, /^Rupees per US dollar/).fill('85');
  await tab(page, 'Costs').click();
  await numberBox(page, /^Local factor for Indian labour/).fill('1');
  // The closure year (cb=target), the rupee rate and the local factor.
  await expect(page.getByTestId('adv-changed')).toHaveText('3 changed');
  await expect(page).toHaveURL(/x=/);

  await sheet(page).getByRole('button', { name: 'Reset all' }).click();
  await expect(page.getByTestId('adv-changed')).toHaveText('0 changed');
  await expect(numberBox(page, /^Local factor for Indian labour/)).toHaveValue('0.6');
  // Reset all also puts the controls back, so the closure year returns to current output (2034).
  await expect(breakeven(page)).toHaveText(usd(costs.moonidih_2034_default.breakeven));
  await expect(page).not.toHaveURL(/x=/);
});

test('the URL round-trips with panel changes', async ({ page }) => {
  await page.goto(MINE_2030);
  await openSheet(page);
  await numberBox(page, /^Rupees per US dollar/).fill('85');
  await tab(page, 'Costs').click();
  await numberBox(page, /^Engines: share for equipment/).fill('70');
  await numberBox(page, /^Staff for the engines/).fill('20');
  await tab(page, 'Finance').click();
  await numberBox(page, /^Royalty to Coal India/).fill('12');
  // Four panel values, plus the closure year from cb=target.
  await expect(page.getByTestId('adv-changed')).toHaveText('5 changed');
  await page.keyboard.press('Escape');
  // The URL is written 150 ms after the last change: wait until x= holds all four panel values.
  await expect
    .poll(() => Object.keys(panelChanges(page.url())).sort())
    .toEqual(['costs.headcount.power', 'costs.split.power.0', 'finance.royaltyShare', 'settings.usdToInr']);
  expect(panelChanges(page.url())).toEqual({
    'costs.headcount.power': 20,
    'costs.split.power.0': 0.7,
    'finance.royaltyShare': 0.12,
    'settings.usdToInr': 85,
  });
  const shown = await breakeven(page).textContent();
  expect(shown).not.toBe('$11.54');
  const capexTotal = await page.getByTestId('capex-total').textContent();

  const fresh = await page.context().newPage();
  await fresh.goto(page.url());
  await expect(breakeven(fresh)).toHaveText(shown ?? '');
  await expect(fresh.getByTestId('capex-total')).toHaveText(capexTotal ?? '');
  await openSheet(fresh);
  await expect(fresh.getByTestId('adv-changed')).toHaveText('5 changed');
  await expect(numberBox(fresh, /^Rupees per US dollar/)).toHaveValue('85');
  await tab(fresh, 'Costs').click();
  await expect(numberBox(fresh, /^Engines: share for equipment/)).toHaveValue('70');
  await expect(numberBox(fresh, /^Staff for the engines/)).toHaveValue('20');
});

test('the capex categories add up to the total shown', async ({ page }) => {
  await page.goto(MINE_2030);
  const card = page.getByTestId('cost-card');
  await expect(card).toContainText("Includes owner's costs (10%) and contingency (15%)");
  const total = millions(await page.getByTestId('capex-total').textContent());
  const cells = await card.locator('tfoot td[data-category]').allTextContents();
  expect(cells).toHaveLength(4);
  const sum = cells.reduce((s, t) => s + millions(t), 0);
  // Each cell is rounded to $0.01M.
  expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.02);
  expect(total).toBeCloseTo(26.39, 2);
});

test('the cost card follows the rupee toggle, in crore', async ({ page }) => {
  await page.goto(`${MINE_2030}&cur=inr`);
  await expect(page.getByTestId('capex-total')).toHaveText(/^₹[\d.]+ crore$/);
  await expect(page.getByTestId('staff-line')).toContainText('₹9,00,000');
});

test('the waterfall shows the running-cost parts on the cost build-up', async ({ page }) => {
  await page.goto(MINE_2030);
  const chart = page.getByTestId('chart-waterfall');
  await expect(chart).toContainText('Staff');
  await expect(chart).toContainText('Engine overhauls');
  await expect(chart).toContainText('Insurance');
});

test('no console errors and no horizontal overflow at 390px with the sheet open', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MINE);
  await openSheet(page);
  await tab(page, 'Costs').click();
  const box = await sheet(page).boundingBox();
  expect(box?.width).toBe(390);
  const overflow = (await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')) as number;
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

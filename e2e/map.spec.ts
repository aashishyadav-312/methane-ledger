import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface MapMine {
  id: string;
  name: string;
  band: string;
  runoutYear: number | null;
  runoutLabel: string;
  modelled: boolean;
  x: number;
  y: number;
}
interface MapJson {
  viewBox: [number, number, number, number];
  bands: Record<string, number>;
  mines: MapMine[];
}

const data = JSON.parse(readFileSync(new URL('../src/generated/mines_map.json', import.meta.url), 'utf8')) as MapJson;

const LEGEND: [string, string][] = [
  ['By 2031', 'by2031'],
  ['2032 to 2036', 'by2036'],
  ['2037 to 2050', 'by2050'],
  ['After 2050', 'after2050'],
  ['No date', 'nodate'],
  ['Already closed', 'closed'],
];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const H1 = 'Which closing mines can pay for their own methane?';

test('the H1 shows', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(H1);
});

test('legend counts equal mines_map.json', async ({ page }) => {
  await page.goto('./#/');
  const rows = page.getByRole('list', { name: 'Expected closure, number of mines' }).getByRole('listitem');
  await expect(rows).toHaveCount(LEGEND.length);
  for (const [i, [label, key]] of LEGEND.entries()) {
    await expect(rows.nth(i).locator('.legend-label')).toHaveText(label);
    await expect(rows.nth(i).locator('.legend-count')).toHaveText(String(data.bands[key]));
  }
  const counted = Object.fromEntries(LEGEND.slice(0, 5).map(([, key]) => [key, 0]));
  for (const m of data.mines) counted[m.band] += 1;
  for (const [, key] of LEGEND.slice(0, 5)) expect(counted[key]).toBe(data.bands[key]);
});

test('the map has an aria-label built from the counts', async ({ page }) => {
  await page.goto('./#/');
  const map = page.getByRole('img', { name: /Map of India/ });
  await expect(map).toBeVisible();
  const label = (await map.getAttribute('aria-label')) ?? '';
  for (const [name, key] of LEGEND) expect(label).toContain(`${name}, ${data.bands[key]}`);
});

test('clicking the pin goes to the Moonidih page', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('link', { name: /Start here Moonidih/ }).click();
  await expect(page).toHaveURL(/#\/mine\/bccl-moonidih$/);
});

test('pressing Tab reaches the pin', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('.start-pin')).toBeVisible();
  let reached = false;
  for (let i = 0; i < 15 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.locator('.start-pin').evaluate((el) => el.matches(':focus'));
  }
  expect(reached).toBe(true);
});

test('hovering a mine shows its tooltip', async ({ page }) => {
  await page.goto('./#/');
  const frame = page.locator('#mine-map');
  await expect(frame).toBeVisible();
  const mine = data.mines.find((m) => !m.modelled && m.x < 400)!; // well away from the lens and the pin
  const box = (await frame.boundingBox())!;
  const [vx, vy, vw, vh] = data.viewBox;
  await page.mouse.move(box.x + ((mine.x - vx) / vw) * box.width, box.y + ((mine.y - vy) / vh) * box.height);
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Model not built for this mine yet');
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(tip).toHaveCount(0);
});

test('the mine table opens, filters and sorts by run-out year', async ({ page }) => {
  await page.goto('./#/');
  const toggle = page.getByRole('button', { name: /Browse all mines/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('table')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const table = page.getByRole('table');
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(data.mines.length);

  const years = data.mines.flatMap((m) => (m.runoutYear === null ? [] : [m.runoutYear]));
  const yearCell = (i: number) => rows.nth(i).locator('td.browse-year');
  const runout = table.getByRole('columnheader', { name: /Run-out year/ });
  await expect(runout).toHaveAttribute('aria-sort', 'ascending');
  await expect(yearCell(0)).toHaveText(String(Math.min(...years)));

  await runout.getByRole('button').click();
  await expect(runout).toHaveAttribute('aria-sort', 'descending');
  const undated = data.mines.find((m) => m.runoutYear === null && m.band !== 'nodate')!;
  await expect(yearCell(0)).toHaveText(undated.runoutLabel);
  await expect(yearCell(data.mines.length - 1)).toHaveText(data.mines.find((m) => m.band === 'nodate')!.runoutLabel);

  await page.getByRole('button', { name: /By 2031/ }).click();
  await expect(rows).toHaveCount(data.bands.by2031);

  // Moonidih's row links to its page.
  await page.getByRole('button', { name: /By 2031/ }).click();
  await table.getByRole('link', { name: /Moonidih/ }).click();
  await expect(page).toHaveURL(/#\/mine\/bccl-moonidih$/);
});

test('a table row shows its mine on the map when focused', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /Browse all mines/ }).click();
  const other = data.mines.find((m) => !m.modelled)!;
  const locate = page.locator(`tr[data-mine-id="${other.id}"] button`);
  await expect(locate).toHaveAccessibleName(/show on the map$/);
  await locate.focus();
  await expect(page.getByRole('tooltip')).toContainText(other.name);
});

test('no console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/');
  await expect(page.locator('#mine-map')).toBeVisible();
  await page.getByRole('button', { name: /Browse all mines/ }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(errors).toEqual([]);
});

test('no horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/');
  await expect(page.locator('#mine-map')).toBeVisible();
  const overflow = () => page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /Browse all mines/ }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  // The pin is still a named link on phones, and the start card below the map opens the model too.
  await expect(page.getByRole('link', { name: /Start here Moonidih/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the model', exact: true })).toBeVisible();
});

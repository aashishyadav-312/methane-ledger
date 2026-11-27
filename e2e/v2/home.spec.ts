/// <reference lib="dom" />
/*
 * Step 6: the v2 home flow. Select a mine (search, map, route), the panel, Run, the scroll docking, Esc, phone, and
 * reduced motion. Runs against the built app (`npm run build`, then the Playwright web server).
 *
 * Screenshots for the PR: V2_HOME_SHOTS=1 npx playwright test e2e/v2/home.spec.ts -g screenshots
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface Golden {
  closure_curve: { moonidih_record: { curve: { power: Record<string, number> } } };
  cases: Record<string, { name: string; type: string; modelStatus: string; breakeven: number | null; closureYear: number }>;
}
const golden = JSON.parse(readFileSync(resolve(ROOT, 'tests/golden/estimation_v2.json'), 'utf8')) as Golden;
const timeline = JSON.parse(readFileSync(resolve(ROOT, 'src/generated/closure_timeline.json'), 'utf8')) as Record<
  string,
  { runoutYear?: number | null }
>;

const MOONIDIH = 'bccl-moonidih';
const AMP = 'bccl-amp-colliery';
/** The Moonidih record's break-even at its own closure year, drained gas to power (Appendix C goldens). */
const MOONIDIH_BE = golden.closure_curve.moonidih_record.curve.power[String(timeline[MOONIDIH].runoutYear)];
const AMP_BE = golden.cases[AMP].breakeven!;
/** An opencast mine the estimate cannot abate, from the goldens. */
const OPENCAST = Object.values(golden.cases).find((c) => c.type === 'OC' && c.modelStatus === 'not_abatable')!;

const money = (x: number) => `$${x.toFixed(2)}`;

async function search(page: Page, text: string) {
  const box = page.getByRole('combobox', { name: 'Search mines' });
  await box.fill(text);
  await expect(page.getByRole('listbox', { name: 'Matching mines' })).toBeVisible();
  await box.press('Enter');
}

const panel = (page: Page) => page.getByTestId('v2-panel');
const mapG = (page: Page) => page.locator('.mmv2-base g').first();
const dock = (page: Page) => page.locator('.mmv2-dock');

async function scrollToResults(page: Page) {
  const top = await page.getByTestId('v2-results').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), top);
}

test.describe('v2 home', () => {
  test('type "moo", Enter: the panel opens, the link names the mine, Run gives the record break-even', async ({ page }) => {
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which closing mines can pay for their own methane?');
    await search(page, 'moo');
    await expect(panel(page).getByRole('heading', { level: 1, name: 'Moonidih' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/mine/${MOONIDIH}`));
    await expect(panel(page).getByText('Illustrative inputs')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Run the model' }).click();
    await expect(page.getByTestId('v2-breakeven')).toHaveText(new RegExp(`^\\${money(MOONIDIH_BE)}`));
    await expect(page.getByTestId('v2-cue')).toBeVisible();
    // The results section is Step 7's dashboard, with the same break-even as the panel (it counts up once seen).
    await expect(page.getByTestId('results-v2')).toBeAttached();
    await scrollToResults(page);
    await expect(page.getByTestId('results-breakeven')).toHaveText(money(MOONIDIH_BE));
    await page.evaluate(() => window.scrollTo(0, 0));
    // The link keeps every input, plus the mine.
    await expect(page).toHaveURL(/[?&]p=\d/);
    await expect(page).toHaveURL(new RegExp(`[?&]m=${MOONIDIH}`));
  });

  test('AMP Colliery shows the estimate break-even', async ({ page }) => {
    await page.goto('./#/');
    await search(page, golden.cases[AMP].name);
    await expect(panel(page).getByRole('heading', { level: 1, name: golden.cases[AMP].name })).toBeVisible();
    await expect(panel(page).getByText('Estimated inputs')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Run the model' }).click();
    await expect(page.getByTestId('v2-breakeven')).toHaveText(new RegExp(`^\\${money(AMP_BE)}`));
  });

  test('an opencast mine shows "not abatable" and the input that would change it', async ({ page }) => {
    await page.goto('./#/');
    await search(page, OPENCAST.name);
    await expect(panel(page).getByRole('heading', { level: 1, name: OPENCAST.name })).toBeVisible();
    await expect(page.getByTestId('v2-not-modelled')).toHaveText(/not abatable/i);
    await expect(panel(page).getByRole('group', { name: 'Gassiness grade' })).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Run the model' })).toHaveCount(0);
  });

  test('scroll to the results: the mini map docks at top right; scroll up: the full map is back', async ({ page }) => {
    await page.goto(`./#/mine/${MOONIDIH}`);
    await expect(page.getByTestId('v2-breakeven')).toBeVisible();
    await expect(page.getByTestId('v2-results')).toBeVisible();
    await scrollToResults(page);
    await expect(page.locator('.mmv2[data-docked="true"]')).toHaveCount(1);
    const vw = page.viewportSize()!.width;
    await expect
      .poll(async () => {
        const b = await dock(page).boundingBox();
        return b ? [Math.round(b.x + b.width), Math.round(b.y), Math.round(b.width)] : null;
      })
      .toEqual([vw - 24, 16, 184]);
    await expect(page.getByRole('button', { name: /Back to the map/ })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.mmv2[data-docked="true"]')).toHaveCount(0);
    await expect.poll(async () => (await dock(page).boundingBox())?.width).toBe(vw);
  });

  test('Esc closes the panel and goes back to all of India', async ({ page }) => {
    await page.goto('./#/');
    const fit = await mapG(page).getAttribute('transform');
    await search(page, 'moo');
    await expect(panel(page)).toBeVisible();
    await expect.poll(() => mapG(page).getAttribute('transform')).not.toBe(fit);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which closing mines can pay for their own methane?');
    await expect.poll(() => mapG(page).getAttribute('transform')).toBe(fit);
  });

  test('a click on a mine dot selects it', async ({ page }) => {
    await page.goto('./#/');
    const dot = page.locator(`.mmv2-dots [data-id="${MOONIDIH}"]`).first();
    const b = (await dot.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page).toHaveURL(new RegExp(`#/mine/`));
    await expect(panel(page)).toBeVisible();
  });

  test('with reduced motion: no fly-to, and docking is a crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/');
    // The map jumps: sampled every frame, it shows only the fitted view and then the mine's view, nothing between.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      const g = document.querySelector('.mmv2-base g')!;
      const tick = () => {
        seen.add(g.getAttribute('transform') ?? '');
        requestAnimationFrame(tick);
      };
      tick();
    });
    await search(page, 'moo');
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(1000);
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen).toHaveLength(2);
    await panel(page).getByRole('button', { name: 'Run the model' }).click();
    await expect(page.getByTestId('v2-results')).toBeVisible();

    const vh = page.viewportSize()!.height;
    const top = await page.getByTestId('v2-results').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    // p = 0.3: no travel, the full map stays in place.
    await page.evaluate((y) => window.scrollTo(0, y), top - vh + 0.3 * vh);
    await page.waitForTimeout(400);
    expect(await dock(page).evaluate((el) => el.style.transform)).toBe('');
    // p = 1: the mini card, without the travel in between.
    await scrollToResults(page);
    await expect(page.locator('.mmv2[data-docked="true"]')).toHaveCount(1);
  });

  test('phone: search on top, a bottom sheet with three snap points, results below', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('./#/');
    await search(page, 'moo');
    const sheet = page.locator('.v2-sheet');
    await expect(sheet).toHaveAttribute('data-snap', 'peek');
    await expect(sheet.getByRole('heading', { level: 1, name: 'Moonidih' })).toBeVisible();
    const peekTop = async () => (await sheet.boundingBox())!.y;
    await expect.poll(peekTop).toBe(844 - 180);
    await sheet.getByRole('button', { name: 'Show more of the panel' }).click();
    await expect(sheet).toHaveAttribute('data-snap', 'half');
    await expect.poll(peekTop).toBe(844 - 422);

    // A fast flick up on the head projects past half to full.
    const head = sheet.locator('.v2-panel-head');
    const hb = (await head.boundingBox())!;
    await page.mouse.move(hb.x + 40, hb.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(hb.x + 40, hb.y + 10 - i * 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect(sheet).toHaveAttribute('data-snap', 'full');

    await sheet.getByRole('button', { name: 'Run the model' }).click();
    await expect(page.getByTestId('v2-breakeven')).toHaveText(new RegExp(`^\\${money(MOONIDIH_BE)}`));
    await expect(page.getByTestId('v2-results')).toBeVisible();
    await scrollToResults(page);
    await expect
      .poll(async () => {
        const b = await dock(page).boundingBox();
        return b ? [Math.round(b.x + b.width), Math.round(b.y), Math.round(b.width)] : null;
      })
      .toEqual([390 - 12, 12, 120]);
    await ctx.close();
  });
});

/* ---------- screenshots (at most 6), only with V2_HOME_SHOTS=1 ---------- */

const SHOTS = process.env.V2_HOME_SHOTS === '1';
const OUT = resolve(ROOT, 'shots/step-v2-6');

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

test.describe('screenshots', () => {
  test.skip(!SHOTS, 'set V2_HOME_SHOTS=1');
  test.describe.configure({ mode: 'serial' });

  test('desktop', async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('./#/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/v2-home-1440.png` });

    await search(page, 'moo');
    await settle(page);
    await panel(page).getByRole('button', { name: 'Run the model' }).click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/v2-mine-1440.png` });

    // Docking contact sheet at p = 0, 0.5 and 1.
    const vh = 900;
    const top = await page.getByTestId('v2-results').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const frames: string[] = [];
    for (const p of [0, 0.5, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), top - vh + p * vh);
      await page.waitForTimeout(800);
      frames.push((await page.screenshot()).toString('base64'));
    }
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 3 * 648 + 8, height: 460 });
    await sheet.setContent(
      `<body style="margin:0;font:14px sans-serif;background:#fff"><div style="display:flex;gap:8px;padding:8px">${frames
        .map(
          (b, i) =>
            `<figure style="margin:0;width:640px"><img style="width:100%;display:block;border:1px solid #ccc" src="data:image/png;base64,${b}"><figcaption>p = ${[0, 0.5, 1][i]}</figcaption></figure>`,
        )
        .join('')}</div></body>`,
    );
    await sheet.screenshot({ path: `${OUT}/v2-dock-frames.png`, fullPage: true });

    await page.screenshot({ path: `${OUT}/v2-results-1440.png` });
    writeFileSync(`${OUT}/README.txt`, 'Step 6 screenshots, from e2e/v2/home.spec.ts with V2_HOME_SHOTS=1.\n');
    await ctx.close();
  });

  test('phone', async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('./#/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/v2-home-390.png` });
    await search(page, 'moo');
    await settle(page);
    await page.locator('.v2-sheet').getByRole('button', { name: 'Run the model' }).click();
    await page.locator('.v2-sheet').getByRole('button', { name: 'Show more of the panel' }).click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/v2-phone-sheet-half-390.png` });
    await ctx.close();
  });
});

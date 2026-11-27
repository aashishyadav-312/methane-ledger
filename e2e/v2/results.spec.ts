/// <reference lib="dom" />
/*
 * Step 7: the results dashboard. The app does not route to the test route, so this spec builds the dashboard's own
 * harness (src/v2/results/harness) with Vite, serves it, and opens `#/__results?m=<id>` on it.
 *
 * Screenshots for the PR: V2_RESULTS_SHOTS=1 npx playwright test e2e/v2/results.spec.ts -g screenshots
 */
import { expect, test, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, type PreviewServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = 'src/v2/results/harness/index.html';
const MOONIDIH = 'bccl-moonidih';
/** Step 7, item 3: what the mini map needs kept clear at the top right of the results. */
const CLEAR_RIGHT_PX = 220;
const CLEAR_TOP_PX = 240;

declare global {
  interface Window {
    __results?: { setPrice(usdPerT: number): void; editCount(): number };
  }
}

test.describe.configure({ mode: 'default' });

let server: PreviewServer | null = null;
let outDir = '';
let base = '';

const freePort = () =>
  new Promise<number>((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  outDir = mkdtempSync(join(tmpdir(), 'v2-results-harness-'));
  await build({
    configFile: false,
    root: ROOT,
    base: './',
    logLevel: 'error',
    plugins: [react()],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(ROOT, HARNESS) } },
  });
  const port = await freePort();
  server = await preview({
    configFile: false,
    root: ROOT,
    base: './',
    logLevel: 'error',
    build: { outDir },
    preview: { port, strictPort: true, host: '127.0.0.1' },
  });
  base = `http://127.0.0.1:${port}/${HARNESS}`;
});

test.afterAll(async () => {
  await server?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;

/** Opens `#/__results?<query>` with fonts blocked (they are not under test) and console errors collected. */
async function open(page: Page, query = `m=${MOONIDIH}`, opts: { fonts?: boolean } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !FONT_HOSTS.test(m.text()) && !FONT_HOSTS.test(m.location().url)) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  if (!opts.fonts) await page.route(FONT_HOSTS, (r) => r.abort());
  await page.goto(`${base}#/__results?${query}`);
  await expect(page.getByTestId('results-v2')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__results));
  return errors;
}

const STRUCTURES = { A: '$3.37', B: '$8.21', C: '$3.65', D: '$0.00', E: '−$0.91' } as const;
const structureValue = (page: Page, k: string) => page.getByTestId(`structure-${k}-value`);
/** The dash offset of the closure chart's engines line: 1 undrawn, 0 drawn. */
const lineOffset = (page: Page) =>
  page.locator('.v2r-line--power').evaluate((el) => Number(el.getAttribute('stroke-dashoffset')));

test.describe('results dashboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Moonidih: the closure chart crossover reads 2031, and the mine is ringed', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('chart-closure').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('closure-crossover')).toHaveText('Engines cheaper from 2031');
    await expect(page.getByTestId('closure-flare-zone')).toContainText('Closing by 2030: a flare is cheaper');
    await expect(page.getByTestId('closure-mine-point')).toHaveText('Moonidih, 2034: $3.37');
    await expect(page.getByTestId('closure-offscale')).toHaveText('Off the scale: $43.31 in 2027.');
    expect(errors).toEqual([]);
  });

  test('the five structures at the defaults: A $3.37, B $8.21, C $3.65, D $0.00, E (30%) −$0.91', async ({ page }) => {
    await open(page);
    await page.getByTestId('chart-structures').scrollIntoViewIfNeeded();
    for (const [k, v] of Object.entries(STRUCTURES)) await expect(structureValue(page, k)).toHaveText(v);
    await expect(page.getByTestId('structure-E')).toContainText('A 30% grant');
    await expect(page.getByTestId('results-breakeven')).toHaveText('$3.37');
  });

  test('charts draw once when 40% visible: the tornado waits below the fold, then grows', async ({ page }) => {
    await open(page);
    const firstTornadoBar = page.locator('[data-testid="tornado-row"] rect').first();
    // Below the fold: still at its baseline (scaled to 0).
    await expect(firstTornadoBar).toHaveAttribute('transform', /scale\(0 1\)/);
    await page.getByTestId('chart-tornado').scrollIntoViewIfNeeded();
    await expect(firstTornadoBar).not.toHaveAttribute('transform', /.+/, { timeout: 3000 });
    // The headline counted up to the break-even.
    await expect(page.getByTestId('results-breakeven')).toHaveText('$3.37');
  });

  test('a re-run morphs values in place, with no redraw from zero', async ({ page }) => {
    await open(page);
    await page.getByTestId('chart-closure').scrollIntoViewIfNeeded();
    await expect.poll(() => lineOffset(page)).toBe(0);
    await page.getByTestId('chart-structures').scrollIntoViewIfNeeded();
    await expect(structureValue(page, 'D')).toHaveText('$0.00');
    await page.evaluate(() => window.__results!.setPrice(7));
    // Lines stay drawn through the re-run.
    expect(await lineOffset(page)).toBe(0);
    await expect(page.getByTestId('results-verdict')).toHaveText('Covered at $7');
    await expect(page.getByTestId('chart-structures')).toContainText('Your price $7');
    // The project break-even does not depend on the price; A stays put.
    await expect(structureValue(page, 'A')).toHaveText('$3.37');
  });

  test('leaves the top right clear for the docked mini map', async ({ page }) => {
    await open(page);
    const boxes = await page.evaluate(
      ({ clearTop }) => {
        const root = document.querySelector('[data-testid="results-v2"]')!;
        const top = root.getBoundingClientRect().top;
        const out: { text: string; right: number }[] = [];
        for (const el of Array.from(root.querySelectorAll<HTMLElement>('a, button, li, span, h2, p, svg'))) {
          if (el.closest('.sr-only')) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || r.top - top >= clearTop) continue;
          out.push({ text: (el.textContent ?? '').slice(0, 40), right: r.right });
        }
        return out;
      },
      { clearTop: CLEAR_TOP_PX },
    );
    expect(boxes.length).toBeGreaterThan(5);
    const viewportW = page.viewportSize()!.width;
    for (const b of boxes) expect(b.right, b.text).toBeLessThanOrEqual(viewportW - CLEAR_RIGHT_PX);
  });

  test('Edit inputs calls back', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Edit inputs' }).click();
    expect(await page.evaluate(() => window.__results!.editCount())).toBe(1);
  });

  test('desktop is two columns', async ({ page }) => {
    await open(page);
    const credits = await page.getByTestId('chart-credits').boundingBox();
    const waterfall = await page.getByTestId('chart-waterfall').boundingBox();
    expect(Math.abs(credits!.y - waterfall!.y)).toBeLessThan(2);
    expect(waterfall!.x).toBeGreaterThan(credits!.x + credits!.width);
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('shows final values immediately, with charts fully drawn', async ({ page }) => {
    await open(page);
    // Read once, with no waiting: nothing counts up or draws in.
    expect(await page.getByTestId('results-breakeven').textContent()).toBe('$3.37');
    expect(await structureValue(page, 'B').textContent()).toBe(STRUCTURES.B);
    expect(await structureValue(page, 'E').textContent()).toBe(STRUCTURES.E);
    expect(await lineOffset(page)).toBe(0);
    expect(await page.locator('[data-testid="tornado-row"] rect[transform]').count()).toBe(0);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('one column, no sideways scroll', async ({ page }) => {
    const errors = await open(page);
    const credits = await page.getByTestId('chart-credits').boundingBox();
    const waterfall = await page.getByTestId('chart-waterfall').boundingBox();
    expect(waterfall!.y).toBeGreaterThan(credits!.y + credits!.height);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The summary bar keeps clear of the 120px phone mini map (12px from the corner, Appendix E).
    const rights = await page
      .getByTestId('results-summary')
      .locator('li, button, span')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    for (const r of rights) expect(r).toBeLessThanOrEqual(390 - (120 + 12));
    expect(errors).toEqual([]);
  });
});

test.describe('AMP Colliery estimate', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('shows its own break-even and crossover', async ({ page }) => {
    await open(page, 'm=bccl-amp-colliery');
    await expect(page.getByTestId('results-breakeven')).toHaveText('$4.49');
    await expect(page.getByTestId('closure-crossover')).toHaveText('Engines cheaper from 2032');
    await expect(page.getByText('Estimated inputs')).toBeVisible();
  });
});

test.describe('screenshots', () => {
  // V2_RESULTS_SHOTS=1 writes all four; a comma list (v2-results-390,v2-results-reveal) re-shoots only those.
  const SHOTS = process.env.V2_RESULTS_SHOTS ?? '';
  test.skip(!SHOTS, 'Set V2_RESULTS_SHOTS=1 to write the Step 7 screenshots.');
  const OUT = resolve(ROOT, 'shots/step-v2-7');
  const wanted = (name: string) => SHOTS === '1' || SHOTS.split(',').includes(name);

  test('screenshots', async ({ browser }) => {
    test.setTimeout(180_000);
    mkdirSync(OUT, { recursive: true });
    const ready = async (page: Page) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
    };
    const full = async (name: string, w: number, h: number) => {
      if (!wanted(name)) return;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await open(page, `m=${MOONIDIH}&freeze=8`, { fonts: true });
      await ready(page);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      await ctx.close();
    };
    await full('v2-results-1440', 1440, 900);
    await full('v2-results-390', 390, 844);

    if (wanted('v2-results-closure-2x')) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await open(page, `m=${MOONIDIH}&freeze=8&mini=0`, { fonts: true });
      await ready(page);
      await page.getByTestId('chart-closure').screenshot({ path: `${OUT}/v2-results-closure-2x.png` });
      await ctx.close();
    }

    // Contact sheet of the reveal at frozen times: one image of the charts at 0, 0.4 and 0.8 seconds.
    if (!wanted('v2-results-reveal')) return;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const secs = [0, 0.4, 0.8];
    const pngs: string[] = [];
    for (const s of secs) {
      await open(page, `m=${MOONIDIH}&freeze=${s}`, { fonts: true });
      await ready(page);
      await page.getByTestId('chart-closure').scrollIntoViewIfNeeded();
      const top = await page.getByTestId('chart-closure').boundingBox();
      pngs.push(
        (await page.screenshot({ fullPage: true, clip: { x: 0, y: top!.y + (await scrollY(page)) - 24, width: 1440, height: 1240 } })).toString(
          'base64',
        ),
      );
    }
    const cell = 720;
    const html = `<body style="margin:0;background:#fff;font:14px sans-serif"><div style="display:flex;gap:8px;padding:8px">${pngs
      .map(
        (b, i) =>
          `<figure style="margin:0;width:${cell}px"><img style="width:100%;display:block;border:1px solid #ccc" src="data:image/png;base64,${b}"><figcaption>${secs[i]} s</figcaption></figure>`,
      )
      .join('')}</div></body>`;
    const sheetPath = join(outDir, 'sheet.html');
    writeFileSync(sheetPath, html);
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 3 * (cell + 8) + 8, height: 400 });
    await sheet.goto(`file://${sheetPath}`);
    await sheet.screenshot({ path: `${OUT}/v2-results-reveal.png`, fullPage: true });
    await ctx.close();
  });
});

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

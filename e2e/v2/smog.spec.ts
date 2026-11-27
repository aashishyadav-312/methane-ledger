/// <reference lib="dom" />
// Smog layer e2e. Runs against the smog harness (src/v2/smog/harness), built and served by this spec, so it does not
// depend on the home page (Step 6) being merged: the v1 map land with the smog canvas between land and dots.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { build, preview, type PreviewServer } from 'vite';

test.describe.configure({ mode: 'serial' });

const ROOT = resolve(import.meta.dirname, '../..');
const OUT_DIR = resolve(ROOT, 'node_modules/.smog-harness-e2e');
let server: PreviewServer;
let base = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await build({
    configFile: resolve(ROOT, 'vite.config.ts'),
    base: '/',
    logLevel: 'error',
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { input: resolve(ROOT, 'src/v2/smog/harness/index.html') },
    },
  });
  server = await preview({
    configFile: resolve(ROOT, 'vite.config.ts'),
    base: '/',
    logLevel: 'error',
    build: { outDir: OUT_DIR },
    preview: { port: 0 },
  });
  base = `${server.resolvedUrls!.local[0]}src/v2/smog/harness/index.html`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server?.httpServer.close(() => done()));
});

interface Stats {
  live: number;
  simTimeS: number;
  framesRequested: number;
  framesDrawn: number;
  running: boolean;
}
interface Probe {
  x: number;
  y: number;
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, query: string) {
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => (window as unknown as { __smog?: { stats(): unknown } }).__smog?.stats());
}

const stats = (page: Page) => page.evaluate(() => (window as unknown as { __smog: { stats(): Stats } }).__smog.stats());

/** Screen positions (CSS px) of the centre of Jharia and of a point in Rajasthan, at the current map transform. */
const probes = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __smog: { toScreen(p: Probe): Probe; probes: { jharia: Probe; rajasthan: Probe } };
      }
    ).__smog;
    return { jharia: s.toScreen(s.probes.jharia), rajasthan: s.toScreen(s.probes.rajasthan) };
  });

/** Mean luminance (0 to 255) of the composited page in a square around a point, from a real screenshot. */
async function luminance(page: Page, at: Probe, radiusPx: number): Promise<number> {
  const png = await page.screenshot({
    clip: { x: at.x - radiusPx, y: at.y - radiusPx, width: radiusPx * 2, height: radiusPx * 2 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

/** How much the smog darkens the page around a point: luminance with the canvas hidden minus with it shown. */
async function smogDarkening(page: Page, at: Probe, radiusPx: number) {
  const withSmog = await luminance(page, at, radiusPx);
  await page.locator('canvas[data-smog]').evaluate((c: HTMLCanvasElement) => (c.style.visibility = 'hidden'));
  const without = await luminance(page, at, radiusPx);
  await page.locator('canvas[data-smog]').evaluate((c: HTMLCanvasElement) => (c.style.visibility = ''));
  return without - withSmog;
}

test('the smog canvas exists, fills the map slot, and caps its pixel ratio', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'mode=overview&freeze=8');
  const canvas = page.locator('canvas[data-smog]');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  const slot = await page.getByTestId('smog-slot').boundingBox();
  expect(box).toEqual(slot);
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, cw: c.clientWidth }));
  expect(size.w).toBeLessThanOrEqual(Math.round(size.cw * 1.5));
  expect(size.w).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('frozen at t = 8 s, the centre of Jharia is darker than a point in Rajasthan, and stays so when zoomed', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await open(page, 'mode=overview&freeze=8&dots=0');
  const s = await stats(page);
  expect(s.simTimeS).toBeCloseTo(8, 5);
  expect(s.running).toBe(false);
  expect(s.live).toBeGreaterThan(0);

  const radiusPx = 16;
  let p = await probes(page);
  const jharia = await smogDarkening(page, p.jharia, radiusPx);
  const rajasthan = await smogDarkening(page, p.rajasthan, radiusPx);
  expect(rajasthan).toBeLessThan(0.25);
  expect(jharia).toBeGreaterThan(1);
  expect(jharia).toBeGreaterThan(rajasthan + 1);

  // Zoom the map toward Jharia: the haze follows its mines.
  await page.evaluate(() => {
    const s = (window as unknown as { __smog: { setTransform(t: { k: number; x: number; y: number }): void } }).__smog;
    s.setTransform({ k: 2, x: -400, y: -300 });
  });
  p = await probes(page);
  expect(await smogDarkening(page, p.jharia, radiusPx)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('live, the smog starts empty and fills, drawing every frame', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'mode=overview');
  const first = await stats(page);
  await page.waitForTimeout(1500);
  const later = await stats(page);
  expect(later.running).toBe(true);
  expect(later.simTimeS).toBeGreaterThan(first.simTimeS);
  expect(later.framesDrawn).toBeGreaterThan(first.framesDrawn + 20);
  expect(later.live).toBeGreaterThan(first.live);
  expect(errors).toEqual([]);
});

test('reduced motion draws the t = 8 s still once and never animates', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await open(page, 'mode=focus&id=bccl-moonidih');
  const before = await stats(page);
  expect(before.simTimeS).toBeCloseTo(8, 5);
  expect(before.framesRequested).toBe(0);
  const pixels = () =>
    page.locator('canvas[data-smog]').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 3; i < d.length; i += 4) sum += d[i];
      return sum;
    });
  const a = await pixels();
  await page.waitForTimeout(500);
  expect(await pixels()).toBe(a);
  expect(a).toBeGreaterThan(0);
  const after = await stats(page);
  expect(after.framesRequested).toBe(0);
  expect(after.simTimeS).toBe(before.simTimeS);
  expect(errors).toEqual([]);
  await ctx.close();
});

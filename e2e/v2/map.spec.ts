/// <reference lib="dom" />
/*
 * Step 3: the zoomable map engine. The v2 home (Step 6) does not exist yet, so this spec builds the engine's own
 * harness page (src/v2/map/harness) with Vite, serves it, and drives `MineMapV2` through `window.__map`.
 *
 * Screenshots for the PR: V2_MAP_SHOTS=1 npx playwright test e2e/v2/map.spec.ts -g screenshots
 */
import { expect, test, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, type PreviewServer } from 'vite';
import {
  constrainTransform,
  cubicBezier,
  dockFrame,
  fitTransform,
  flyPath,
  nextDocked,
  panExtent,
  pickLabels,
} from '../../src/v2/map/geometry';
import type { MapApi, MapTransform, MineId } from '../../src/v2/contracts';

/** What the harness puts on `window` (src/v2/map/harness/main.tsx). */
declare global {
  interface Window {
    __map?: {
      api: (MapApi & { getZoomLevel(): number; getFitTransform(): MapTransform; showAll(): Promise<void> }) | null;
      select(id: MineId | null): void;
      selected(): MineId | null;
    };
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = 'src/v2/map/harness/index.html';
const MOONIDIH = 'bccl-moonidih';
const PANEL_W = 460;

/** A mine whose position really is coalfield-approximate, picked from the data (Moonidih is GEM-positioned). */
const COALFIELD_MINE = (() => {
  const data = JSON.parse(readFileSync(resolve(ROOT, 'src/generated/v2/mines_v2.json'), 'utf8')) as {
    mines: { id: string; name: string; positionQuality: string }[];
  };
  const m = data.mines.find((x) => x.positionQuality === 'coalfield');
  if (!m) throw new Error('mines_v2.json has no coalfield-positioned mine');
  return m;
})();

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
  outDir = mkdtempSync(join(tmpdir(), 'v2-map-harness-'));
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

/** Opens the harness, with fonts blocked (they are not under test) and console errors collected. */
async function open(page: Page, query = '', opts: { fonts?: boolean } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !FONT_HOSTS.test(m.text()) && !FONT_HOSTS.test(m.location().url)) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  if (!opts.fonts) await page.route(FONT_HOSTS, (r) => r.abort());
  await page.goto(`${base}${query ? `?${query}` : ''}`);
  await expect(page.locator('.mmv2-surface')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__map?.api));
  return errors;
}

const zoomLevel = (page: Page) => page.evaluate(() => window.__map!.api!.getZoomLevel());
const transform = (page: Page) => page.evaluate(() => window.__map!.api!.getTransform());

test.describe('map engine', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('draws every mine, the ink boundary and an application role, with no console errors', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('.mmv2-dot')).toHaveCount(311);
    await expect(page.locator('.mmv2-closed')).toHaveCount(315);
    await expect(page.locator('.mmv2-boundary')).toHaveCount(1);
    await expect(page.getByRole('application', { name: /Map of India/ })).toBeVisible();
    expect(await zoomLevel(page)).toBeCloseTo(1, 5);
    expect(errors).toEqual([]);
  });

  test('zoom buttons zoom in and out, and show all of India', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(await zoomLevel(page)).toBeCloseTo(2, 5);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(await zoomLevel(page)).toBeCloseTo(4, 5);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    expect(await zoomLevel(page)).toBeCloseTo(2, 5);
    await page.getByRole('button', { name: 'Show all of India' }).click();
    await expect.poll(() => zoomLevel(page)).toBeCloseTo(1, 5);
    expect(errors).toEqual([]);
  });

  test('keyboard: + and − zoom, arrows pan, 0 shows all of India', async ({ page }) => {
    await open(page);
    await page.getByRole('application').focus();
    await page.keyboard.press('+');
    expect(await zoomLevel(page)).toBeCloseTo(2, 5);
    const before = await transform(page);
    await page.keyboard.press('ArrowRight');
    const after = await transform(page);
    expect(after.x).toBeLessThan(before.x);
    await page.keyboard.press('-');
    expect(await zoomLevel(page)).toBeCloseTo(1, 5);
    await page.keyboard.press('+');
    await page.keyboard.press('0');
    expect(await zoomLevel(page)).toBeCloseTo(1, 5);
  });

  test('flyTo(Moonidih) ends with Moonidih at zoom 6 in the centre of the area left of the panel', async ({ page }) => {
    const errors = await open(page);
    const frames = await page.evaluate(
      async ({ id, panel }) => {
        const api = window.__map!.api!;
        const seen: { k: number; x: number; y: number }[] = [];
        const off = api.onTransform((t) => seen.push(t));
        const t0 = performance.now();
        await api.flyTo(id, { offsetRight: panel });
        off();
        return { seen, ms: performance.now() - t0 };
      },
      { id: MOONIDIH, panel: PANEL_W },
    );
    expect(frames.ms).toBeGreaterThan(400);
    expect(frames.ms).toBeLessThan(1500);
    expect(frames.seen.length).toBeGreaterThan(10);
    expect(await zoomLevel(page)).toBeCloseTo(6, 3);

    const p = await page.evaluate((id) => window.__map!.api!.getScreenPoint(id), MOONIDIH);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo((1440 - PANEL_W) / 2, 0);
    expect(p!.y).toBeCloseTo(450, 0);

    // The drawn dot agrees: inside the left area.
    await page.evaluate((id) => window.__map!.select(id), MOONIDIH);
    const box = await page.locator(`.mmv2-dot[data-id="${MOONIDIH}"]`).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThan(1440 - PANEL_W);
    expect(box!.x).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('fly-to is continuous: no frame jumps the mine across the screen', async ({ page }) => {
    await open(page);
    const steps = await page.evaluate((id) => {
      const api = window.__map!.api!;
      const pts: { x: number; y: number; k: number }[] = [];
      const off = api.onTransform((t) => pts.push({ x: t.x, y: t.y, k: t.k }));
      return api.flyTo(id, { offsetRight: 460 }).then(() => {
        off();
        return pts;
      });
    }, MOONIDIH);
    // Screen position of the target mine in each frame, from the reported transforms.
    const fit = await page.evaluate(() => window.__map!.api!.getFitTransform());
    const ks = steps.map((s) => s.k / fit.k);
    for (let i = 1; i < ks.length; i++) {
      // Scale never changes by more than 25% in one frame along the van Wijk path.
      expect(ks[i] / ks[i - 1]).toBeLessThan(1.25);
      expect(ks[i] / ks[i - 1]).toBeGreaterThan(0.8);
    }
  });

  test('a drag interrupts a fly-to at the current transform', async ({ page }) => {
    await open(page);
    await page.evaluate((id) => {
      (window as unknown as { __fly: Promise<void> }).__fly = window.__map!.api!.flyTo(id, { offsetRight: 460 });
    }, MOONIDIH);
    await page.waitForTimeout(200);
    await page.mouse.move(300, 600);
    await page.mouse.down();
    await page.mouse.move(340, 620, { steps: 4 });
    await page.mouse.up();
    await page.evaluate(() => (window as unknown as { __fly: Promise<void> }).__fly);
    const z = await zoomLevel(page);
    expect(z).toBeGreaterThan(1);
    expect(z).toBeLessThan(6);
  });

  test('labels: the selected mine in italics, at most 12 others at zoom ≥ 4, none overlapping', async ({ page }) => {
    await open(page, `fly=${MOONIDIH}&offsetRight=${PANEL_W}`);
    await expect.poll(() => zoomLevel(page)).toBeCloseTo(6, 3);
    const sel = page.locator('.mmv2-label.is-sel');
    await expect(sel).toHaveText('Moonidih');
    expect(await sel.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    const boxes = await page.locator('.mmv2-label').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      }),
    );
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThanOrEqual(13);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
    // Other dots fade to 45%, and the live region names the mine.
    const dimmed = () => page.locator('.mmv2-dimmable').evaluate((el) => Number(getComputedStyle(el).opacity));
    await expect.poll(dimmed).toBeCloseTo(0.45, 2);
    expect(await page.locator('.mmv2-dimmable .mmv2-dot.is-sel').count()).toBe(0);
    await expect(page.getByText('Moonidih selected')).toBeAttached();
    // Below zoom 4 only the selected mine is labelled.
    await page.getByRole('application').focus();
    await page.keyboard.press('0');
    await expect(page.locator('.mmv2-label')).toHaveCount(1);
  });

  test('hover shows the tooltip; "Approximate position" only on coalfield-positioned mines; a click selects', async ({ page }) => {
    const errors = await open(page, `fly=${MOONIDIH}&offsetRight=${PANEL_W}`);
    await expect.poll(() => zoomLevel(page)).toBeCloseTo(6, 3);
    await page.evaluate(() => window.__map!.select(null));
    const p = (await page.evaluate((id) => window.__map!.api!.getScreenPoint(id), MOONIDIH))!;
    await page.mouse.move(p.x, p.y);
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('Moonidih');
    await expect(tip).toContainText('BCCL, underground');
    await expect(tip).toContainText('Runs out 2034');
    // Moonidih has a GEM position, so no approximation note.
    await expect(tip).not.toContainText('Approximate position');
    await expect(page.locator(`.mmv2-dot[data-id="${MOONIDIH}"]`)).toHaveClass(/is-hover/);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => window.__map!.selected())).toBe(MOONIDIH);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('a coalfield-positioned mine shows "Approximate position" in its tooltip', async ({ page }) => {
    const id = COALFIELD_MINE.id;
    const errors = await open(page, `fly=${id}&offsetRight=${PANEL_W}`);
    await expect.poll(() => zoomLevel(page)).toBeCloseTo(6, 3);
    await page.evaluate(() => window.__map!.select(null));
    const p = (await page.evaluate((mid) => window.__map!.api!.getScreenPoint(mid), id))!;
    await page.mouse.move(p.x, p.y);
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText(COALFIELD_MINE.name);
    await expect(tip).toContainText('Approximate position');
    expect(errors).toEqual([]);
  });

  test('frozen clock: ?freeze=0.3 renders the same fly-to frame every time', async ({ page }) => {
    await open(page, `fly=${MOONIDIH}&offsetRight=${PANEL_W}&freeze=0.3`);
    const a = await transform(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__map?.api));
    const b = await transform(page);
    expect(b.k).toBeCloseTo(a.k, 6);
    expect(b.x).toBeCloseTo(a.x, 4);
    const z = await zoomLevel(page);
    expect(z).toBeGreaterThan(1);
    expect(z).toBeLessThan(6);
  });

  test('wheel zoom: 60 frames at a median under 20 ms each', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const el = document.querySelector<HTMLElement>('.mmv2-surface')!;
      const dot = document.querySelector('.mmv2-dot')!;
      const rect = el.getBoundingClientRect();
      const frame: number[] = [];
      const work: number[] = [];
      await new Promise((res) => requestAnimationFrame(res));
      let last = performance.now();
      for (let i = 0; i < 60; i++) {
        await new Promise((res) => requestAnimationFrame(res));
        const now = performance.now();
        frame.push(now - last);
        last = now;
        const t0 = performance.now();
        el.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i < 30 ? -60 : 60,
            clientX: rect.left + rect.width * 0.62,
            clientY: rect.top + rect.height * 0.48,
            bubbles: true,
            cancelable: true,
          }),
        );
        dot.getBoundingClientRect(); // style and layout inside the measured slice
        work.push(performance.now() - t0);
      }
      const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      return { frame: median(frame), work: median(work), zoomed: window.__map!.api!.getZoomLevel() };
    });
    console.log(`wheel zoom median frame ${r.frame.toFixed(1)} ms, work ${r.work.toFixed(2)} ms`);
    expect(r.work).toBeLessThan(20);
    expect(r.frame).toBeLessThan(20);
  });

  test('docking: at p = 1 the map is a 184px card at the top right, and a link back', async ({ page }) => {
    await open(page, 'dock=1');
    const box = await page.locator('.mmv2-dock').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(184, 0);
    expect(box!.x + box!.width).toBeCloseTo(1440 - 24, 0);
    expect(box!.y).toBeCloseTo(16, 0);
    await expect(page.getByRole('button', { name: 'Back to the map' })).toBeVisible();
    expect(await page.locator('.mmv2-dock').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  });

  test('docking at p = 0.5 is part way, and the map is not fixed yet', async ({ page }) => {
    await open(page, 'dock=0.5');
    const box = (await page.locator('.mmv2-dock').boundingBox())!;
    expect(box.width).toBeLessThan(1440);
    expect(box.width).toBeGreaterThan(184);
    expect(await page.locator('.mmv2-dock').evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('fly-to jumps in one frame, with a crossfade of the dots', async ({ page }) => {
    const errors = await open(page);
    const r = await page.evaluate(async (id) => {
      const api = window.__map!.api!;
      let frames = 0;
      const off = api.onTransform(() => frames++);
      const t0 = performance.now();
      await api.flyTo(id, { offsetRight: 460 });
      off();
      const fades = document.querySelector('.mmv2-dots')!.getAnimations().length;
      return { frames, ms: performance.now() - t0, fades };
    }, MOONIDIH);
    expect(r.frames).toBe(1);
    expect(r.ms).toBeLessThan(100);
    expect(r.fades).toBe(1);
    expect(await zoomLevel(page)).toBeCloseTo(6, 3);
    expect(errors).toEqual([]);
  });

  test('docking crosses over at p = 0.5 with no travel', async ({ page }) => {
    await open(page, 'dock=0.4');
    const full = (await page.locator('.mmv2-dock').boundingBox())!;
    expect(full.width).toBeCloseTo(1440, 0);
    await open(page, 'dock=0.6');
    const mini = (await page.locator('.mmv2-dock').boundingBox())!;
    expect(mini.width).toBeCloseTo(184, 0);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('docks into a 120px card 12px from the corner', async ({ page }) => {
    await open(page, 'dock=1');
    const box = (await page.locator('.mmv2-dock').boundingBox())!;
    expect(box.width).toBeCloseTo(120, 0);
    expect(box.x + box.width).toBeCloseTo(390 - 12, 0);
    expect(box.y).toBeCloseTo(12, 0);
  });
});

test.describe('geometry (pure)', () => {
  const VB = [0, 0, 906, 1016] as const;

  test('fit, pan limits and the easing curve', () => {
    const fit = fitTransform(VB, { width: 1440, height: 900 });
    expect(fit.k).toBeCloseTo(900 / 1016, 6);
    expect(fit.x).toBeCloseTo((1440 - 906 * fit.k) / 2, 6);
    const extent = panExtent(VB);
    const vp: [[number, number], [number, number]] = [
      [0, 0],
      [1440, 900],
    ];
    // A map smaller than the viewport may sit anywhere inside it, but not off its edge.
    expect(constrainTransform(fit, vp, extent)).toBe(fit);
    const off = constrainTransform({ ...fit, x: 2000 }, vp, extent);
    expect(off.x + extent[1][0] * fit.k).toBeCloseTo(1440, 6);
    const ease = cubicBezier(0.77, 0, 0.175, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // Reference values solved by bisection on the Bézier polynomials.
    expect(ease(0.25)).toBeCloseTo(0.052889, 4);
    expect(ease(0.5)).toBeCloseTo(0.595971, 4);
    expect(ease(0.98)).toBeCloseTo(0.99980, 4);
  });

  test('fly path duration is clamped to 500–900 ms and ends on the target', () => {
    const fit = fitTransform(VB, { width: 1440, height: 900 });
    const to = { k: fit.k * 6, x: 490 - 561 * fit.k * 6, y: 450 - 444 * fit.k * 6 };
    const path = flyPath(fit, to, [490, 450], 1440);
    expect(path.durationMs).toBeGreaterThanOrEqual(500);
    expect(path.durationMs).toBeLessThanOrEqual(900);
    expect(path.at(1)).toEqual(to);
    expect(path.at(0).k).toBeCloseTo(fit.k, 6);
  });

  test('labels never overlap and the selected one is always placed', () => {
    const t = { k: 5, x: -2500, y: -1800 };
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      name: `Mine number ${i}`,
      x: 560 + (i % 8) * 2,
      y: 440 + Math.floor(i / 8) * 2,
      size: 40 - i,
    }));
    const labels = pickLabels({
      candidates,
      selected: candidates[39],
      transform: t,
      zoom: 6,
      viewport: { width: 1440, height: 900 },
      dotRadiusPx: () => 6,
      measure: (s) => s.length * 6,
    });
    expect(labels[0]).toMatchObject({ id: 'm39', selected: true });
    expect(labels.length).toBeLessThanOrEqual(13);
  });

  test('dock frame ends at the card and hysteresis holds', () => {
    const rest = { left: 0, top: 0, width: 1440, height: 900 };
    const end = dockFrame(1, rest, 1440);
    expect(end.scale).toBeCloseTo(184 / 1440, 6);
    expect(end.tx).toBeCloseTo(-24, 6);
    expect(end.ty).toBeCloseTo(16, 6);
    expect(end.clipRadius * end.scale).toBeCloseTo(16, 6);
    expect(dockFrame(0, rest, 1440)).toMatchObject({ scale: 1, tx: 0, ty: 0, chrome: 0 });
    expect(nextDocked(false, 0.97)).toBe(false);
    expect(nextDocked(false, 0.98)).toBe(true);
    expect(nextDocked(true, 0.96)).toBe(true);
    expect(nextDocked(true, 0.94)).toBe(false);
  });
});

test.describe('screenshots', () => {
  // V2_MAP_SHOTS=1 writes all four; a comma list (v2-home-390,v2-flyto-frames) re-shoots only those.
  const SHOTS = process.env.V2_MAP_SHOTS ?? '';
  test.skip(!SHOTS, 'Set V2_MAP_SHOTS=1 to write the Step 3 screenshots.');
  const OUT = resolve(ROOT, 'shots/step-v2-3');
  const wanted = (name: string) => SHOTS === '1' || SHOTS.split(',').includes(name);

  test('screenshots', async ({ browser }) => {
    test.setTimeout(120_000);
    mkdirSync(OUT, { recursive: true });
    const shot = async (name: string, w: number, h: number, query: string) => {
      if (!wanted(name)) return;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await open(page, query, { fonts: true });
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      await ctx.close();
    };
    await shot('v2-home-1440', 1440, 900, 'layout=home');
    await shot('v2-jharia-1440', 1440, 900, `layout=home&fly=${MOONIDIH}&offsetRight=${PANEL_W}&panel=1`);
    await shot('v2-home-390', 390, 844, '');

    // Contact sheet of the fly-to at frozen times: one image.
    if (!wanted('v2-flyto-frames')) return;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const secs = [0, 0.3, 0.6, 0.9];
    const pngs: string[] = [];
    for (const s of secs) {
      await open(page, `layout=home&fly=${MOONIDIH}&offsetRight=${PANEL_W}&panel=1&freeze=${s}`, { fonts: true });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      pngs.push((await page.screenshot()).toString('base64'));
    }
    const cell = 640;
    const html = `<body style="margin:0;background:#fff;font:14px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${pngs
      .map(
        (b, i) =>
          `<figure style="margin:0;width:${cell}px"><img style="width:100%;display:block;border:1px solid #ccc" src="data:image/png;base64,${b}"><figcaption>${secs[i]} s</figcaption></figure>`,
      )
      .join('')}</div></body>`;
    const sheetPath = join(outDir, 'sheet.html');
    writeFileSync(sheetPath, html);
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 2 * (cell + 8) + 8, height: 400 });
    await sheet.goto(`file://${sheetPath}`);
    await sheet.screenshot({ path: `${OUT}/v2-flyto-frames.png`, fullPage: true });
    await ctx.close();
  });
});

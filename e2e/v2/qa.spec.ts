/// <reference lib="dom" />
/*
 * Step 9: the release QA checks that can be automated. Performance of the smog (`?perf=1`), the keyboard path,
 * visible focus, what a screen reader hears, contrast on the glass controls, 200% zoom, reduced motion and reduced
 * transparency, and the deep link. Runs against the built app (`npm run build`, then the Playwright web server).
 *
 * Contact sheets for the PR: `npm run shots -- --step v2-9 --frames <name>@0,0.4,1`.
 */
import { expect, test, type Page } from '@playwright/test';

const MOONIDIH = 'bccl-moonidih';
const MOONIDIH_NAME = 'Moonidih';
/** Step 9, item 2: the smog's median frame cost over 300 frames. */
const SMOG_FRAMES = 300;
const SMOG_MEDIAN_LIMIT_MS = 4;
/** WCAG 2.1 AA for body text. */
const CONTRAST_MIN = 4.5;

const search = (page: Page) => page.getByRole('combobox', { name: 'Search mines' });
const panel = (page: Page) => page.getByTestId('v2-panel');

async function smogFrames(page: Page, wanted: number): Promise<number[]> {
  await page.waitForFunction(
    (n) => ((window as unknown as { __smogFrameMs?: number[] }).__smogFrameMs?.length ?? 0) >= n,
    wanted,
    { timeout: 30_000 },
  );
  return page.evaluate((n) => (window as unknown as { __smogFrameMs: number[] }).__smogFrameMs.slice(0, n), wanted);
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test.describe('performance', () => {
  test('the smog engine tick is under 4 ms at the median over 300 frames, on the home', async ({ page }) => {
    await page.goto('./#/?perf=1');
    const m = median(await smogFrames(page, SMOG_FRAMES));
    console.log(`smog tick, home: median ${m.toFixed(2)} ms over ${SMOG_FRAMES} frames`);
    expect(m).toBeLessThan(SMOG_MEDIAN_LIMIT_MS);
  });

  test('and with a mine selected', async ({ page }) => {
    await page.goto(`./#/mine/${MOONIDIH}?perf=1`);
    await expect(panel(page)).toBeVisible();
    const m = median(await smogFrames(page, SMOG_FRAMES));
    console.log(`smog tick, mine: median ${m.toFixed(2)} ms over ${SMOG_FRAMES} frames`);
    expect(m).toBeLessThan(SMOG_MEDIAN_LIMIT_MS);
  });
});

test.describe('links', () => {
  test('a mine link works on a hard reload', async ({ page }) => {
    await page.goto(`./#/mine/${MOONIDIH}`);
    await expect(panel(page)).toBeVisible();
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: MOONIDIH_NAME })).toBeVisible();
    await expect(page.getByTestId('v2-breakeven')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/mine/${MOONIDIH}`));
  });

  test('the About menu has "Version 1 site", and it points at the site root', async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: /About/ }).click();
    const link = page.getByRole('menuitem', { name: /Version 1 site/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/methane-ledger/');
  });
});

test.describe('keyboard', () => {
  test('"/" to search, select, the panel, Run, results, Esc', async ({ page }) => {
    await page.goto('./#/');
    await page.keyboard.press('/');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('moonidih');
    await expect(page.getByRole('listbox', { name: 'Matching mines' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    // Choosing a mine puts focus on the panel title.
    await expect(page.getByRole('heading', { level: 1, name: MOONIDIH_NAME })).toBeFocused();

    // Tab reaches Run, and Enter runs it.
    const run = page.getByRole('button', { name: 'Run the model' });
    for (let i = 0; i < 40 && !(await run.evaluate((e) => e === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(run).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('v2-peek')).toBeVisible();
    await expect(page.getByTestId('v2-results')).toBeVisible();

    // Esc closes the mine from anywhere in the panel.
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$/);
  });

  test('focus is visible on every control reached by Tab, on the home and on a mine', async ({ page }) => {
    const hidden: string[] = [];
    for (const route of ['./#/', `./#/mine/${MOONIDIH}`]) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await page.keyboard.press('Tab');
      for (let i = 0; i < 45; i++) {
        const seen = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const ring = (e: Element) => {
            const cs = getComputedStyle(e);
            const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
            const shadow = cs.boxShadow !== 'none' && /\b[2-9]px\b/.test(cs.boxShadow);
            return outline || shadow;
          };
          // A bare field inside a bordered box shows the ring on the box (the search field's own focus state is its
          // ink border, which eases in, so it is read from its marker).
          const ok =
            ring(el) ||
            (el.parentElement ? ring(el.parentElement) || el.parentElement.hasAttribute('data-focused') : false);
          const r = el.getBoundingClientRect();
          return {
            script: el.tabIndex === -1, // focused by the app (a heading), not a control
            ok,
            label: `${el.tagName}.${el.className} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}`,
            shown: r.width > 0 && r.height > 0,
          };
        });
        if (seen && seen.shown && !seen.ok && !seen.script) hidden.push(`${route}: ${seen.label}`);
        await page.keyboard.press('Tab');
      }
    }
    expect(hidden).toEqual([]);
  });
});

test.describe('lazy pages', () => {
  test('a page that loads on demand still gets focus on its H1 when the route changes', async ({ page }) => {
    await page.goto('./#/');
    await expect(search(page)).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = '#/method';
    });
    await expect(page.getByRole('heading', { level: 1, name: 'How the model works' })).toBeFocused();
    await page.evaluate(() => {
      window.location.hash = '#/compare';
    });
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });
});

test.describe('screen reader', () => {
  test('hears the selected mine, and then the result', async ({ page }) => {
    await page.goto('./#/');
    await search(page).fill('moonidih');
    await search(page).press('Enter');
    await expect(page.locator('[aria-live="polite"]', { hasText: `${MOONIDIH_NAME} selected` })).toHaveCount(1);
    const status = page.getByTestId('v2-result-status');
    await expect(status).toHaveText('');
    await page.getByRole('button', { name: 'Run the model' }).click();
    await expect(status).toHaveText(/Moonidih\. Break-even credit price \$[\d.]+ a tonne\. .+\./);
  });

  test('the live regions are in the page before they speak', async ({ page }) => {
    await page.goto('./#/');
    await expect(page.locator('[aria-live="polite"]').first()).toBeAttached();
    await search(page).fill('moonidih');
    await expect(page.getByRole('status').filter({ hasText: /of \d+ mines match/ })).toHaveCount(1);
  });
});

test.describe('contrast', () => {
  for (const route of ['./#/', `./#/mine/${MOONIDIH}`]) {
    test(`text on the glass controls is at least 4.5:1 over the darkest smog (${route})`, async ({ page }) => {
      await page.goto(route);
      await expect(search(page)).toBeVisible();
      if (route.includes('mine')) await page.getByRole('button', { name: 'Run the model' }).click();
      await page.getByTestId('v2-results').waitFor({ state: 'attached' });
      const rows = await page.evaluate(() => {
        const parse = (c: string) => {
          const hex = c.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
          if (hex) {
            const n = parseInt(hex[1], 16);
            return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
          }
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const p = m[1].split(',').map((x) => parseFloat(x));
          return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        };
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const lum = (c: { r: number; g: number; b: number }) =>
          0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
        // The smog is rgb(var(--smog)); the worst case is that colour fully opaque behind the glass.
        const smog = getComputedStyle(document.documentElement)
          .getPropertyValue('--smog')
          .split(',')
          .map((x) => parseFloat(x));
        const under = { r: smog[0], g: smog[1], b: smog[2], a: 1 };
        const over = (fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }) => ({
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        });
        const out: { label: string; ratio: number }[] = [];
        // Every element whose own background is the glass token, and the text inside it.
        const glass = parse(getComputedStyle(document.documentElement).getPropertyValue('--glass'))!;
        const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
        for (const el of all) {
          const bg = parse(getComputedStyle(el).backgroundColor);
          if (!bg || Math.abs(bg.a - glass.a) > 0.01 || bg.r !== glass.r) continue;
          const flat = over(bg, under);
          const texts = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))].filter((n) =>
            Array.from(n.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? '').trim() !== ''),
          );
          for (const t of texts) {
            const fg = parse(getComputedStyle(t).color);
            if (!fg) continue;
            const text = over(fg, flat);
            const [a, b] = [lum(text) + 0.05, lum(flat) + 0.05];
            out.push({
              label: `${el.className} > ${(t.textContent ?? '').trim().slice(0, 24)}`,
              ratio: Math.max(a, b) / Math.min(a, b),
            });
          }
        }
        return out;
      });
      expect(rows.length).toBeGreaterThan(0);
      const low = rows.filter((r) => r.ratio < CONTRAST_MIN);
      console.log(`glass text checked: ${rows.length}, lowest ${Math.min(...rows.map((r) => r.ratio)).toFixed(2)}:1`);
      expect(low).toEqual([]);
    });
  }
});

test.describe('zoom, reduced motion, reduced transparency', () => {
  test('200% zoom (a 720 px wide window): no sideways scroll, search and panel usable', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const route of ['./#/', `./#/mine/${MOONIDIH}`, './#/compare', './#/method']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
    await page.goto('./#/');
    await expect(search(page)).toBeVisible();
    await search(page).fill('moonidih');
    await search(page).press('Enter');
    // On a window this narrow the panel is the bottom sheet.
    await expect(page.getByRole('heading', { level: 1, name: MOONIDIH_NAME })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run the model/ })).toBeAttached();
    await ctx.close();
  });

  test('reduced motion: the smog is one still frame, nothing flies', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/?perf=1');
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(
      () => (window as unknown as { __smogFrameMs?: number[] }).__smogFrameMs?.length ?? 0,
    );
    expect(frames).toBe(0);
  });

  test('reduced transparency: the glass controls are solid', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    await page.goto('./#/');
    await expect(search(page)).toBeVisible();
    const glass = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--glass').trim(),
    );
    expect(glass).not.toMatch(/rgba/);
    const blur = await page.evaluate(() => {
      const el = document.querySelector('.mmv2-zoom') ?? document.querySelector('.mmv2-zoom-btn');
      return el ? getComputedStyle(el).backdropFilter : 'none';
    });
    expect(blur === 'none' || blur === '').toBe(true);
  });
});

test.describe('motion', () => {
  test('fly-to has no jumps: sampled every frame, the view never changes by more than a small step', async ({
    page,
  }) => {
    await page.goto('./#/');
    await expect(search(page)).toBeVisible();
    await page.waitForTimeout(1500); // the load animation is over
    await page.evaluate(() => {
      const w = window as unknown as { __flight: string[]; __stop: boolean };
      w.__flight = [];
      w.__stop = false;
      const g = document.querySelector('.mmv2-base g')!;
      const tick = () => {
        w.__flight.push(g.getAttribute('transform') ?? '');
        if (!w.__stop) requestAnimationFrame(tick);
      };
      tick();
    });
    await search(page).fill('moonidih');
    await expect(page.getByRole('listbox', { name: 'Matching mines' })).toBeVisible();
    await search(page).press('Enter');
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(2500);
    const flight = await page.evaluate(() => {
      const w = window as unknown as { __flight: string[]; __stop: boolean };
      w.__stop = true;
      return w.__flight;
    });
    // The values in "translate(x,y) scale(k)", in any spacing.
    const nums = flight.map((t) => (t.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number));
    const moves = nums.filter((n, i) => i === 0 || n.join() !== nums[i - 1].join());
    expect(moves.length).toBeGreaterThan(20); // it animated: many distinct frames, not one jump
    const k = moves.map((n) => n[n.length - 1]);
    const first = Math.log(k[0]);
    const last = Math.log(k[k.length - 1]);
    const total = Math.abs(last - first);
    let worst = 0;
    for (let i = 1; i < k.length; i++) worst = Math.max(worst, Math.abs(Math.log(k[i]) - Math.log(k[i - 1])));
    console.log(
      `fly-to: ${moves.length} distinct frames, zoom ${k[0].toFixed(2)} to ${k[k.length - 1].toFixed(2)}, largest step ${worst.toFixed(3)} in ln k`,
    );
    // The largest single-frame step in zoom is a small share of the whole move, and the zoom never starts from zero.
    expect(worst).toBeLessThan(total * 0.25);
    expect(Math.min(...k)).toBeGreaterThan(k[0] * 0.5);
  });
});

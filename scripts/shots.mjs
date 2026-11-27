// Usage: node scripts/shots.mjs --step N [--only a,b] [--frames name@0,1.5,4]
// Views flagged "v2" in shots.config.json are built and served under /methane-ledger/v2/.
// --frames renders the named view at each listed second (frozen clock, ?freeze=<s>) into ONE contact-sheet image.
// Builds once, serves `vite preview` on a free port, captures views to shots/step-N/<name>.png, then stops.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const step = opt('step') ?? '0';
const only = opt('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const framesArg = opt('frames');
let frames = null;
if (framesArg) {
  const [frameName, secs] = framesArg.split('@');
  const seconds = (secs ?? '').split(',').map(Number);
  if (!frameName || !seconds.length || seconds.some((n) => !Number.isFinite(n))) {
    console.error('Use --frames <name>@0,1.5,4');
    process.exit(1);
  }
  frames = { name: frameName, seconds };
}

const config = JSON.parse(readFileSync(new URL('./shots.config.json', import.meta.url), 'utf8'));
const wanted = frames ? [frames.name] : only;
const views = wanted ? config.filter((v) => wanted.includes(v.name)) : config;
const missing = (wanted ?? []).filter((n) => !config.some((v) => v.name === n));
if (missing.length) {
  console.error(`Unknown view(s): ${missing.join(', ')}`);
  process.exit(1);
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const useV2 = views.some((v) => v.v2);
const basePath = useV2 ? '/methane-ledger/v2/' : '/methane-ledger/';
execFileSync('npm', ['run', 'build'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, BASE_PATH: basePath },
});
const port = await freePort();
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, BASE_PATH: basePath },
});
const base = `http://localhost:${port}${basePath}`;

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const outDir = `shots/step-${step}`;
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const withParam = (path, key, value) => path + (path.includes('?') ? '&' : '?') + `${key}=${value}`;
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (!frames) {
      await page.goto(base + v.path);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${outDir}/${v.name}.png`, fullPage: v.fullPage });
      console.log(`${outDir}/${v.name}.png`);
    } else {
      const pngs = [];
      for (const t of frames.seconds) {
        await page.goto(base + withParam(v.path, 'freeze', t));
        await page.reload();
        await page.waitForLoadState('networkidle');
        pngs.push((await page.screenshot({ fullPage: v.fullPage })).toString('base64'));
      }
      // One HTML grid of the frames, screenshotted once.
      const cell = Math.min(v.w, 640);
      const html = `<body style="margin:0;background:#fff;font:14px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${pngs
        .map(
          (b, i) =>
            `<figure style="margin:0;width:${cell}px"><img style="width:100%;display:block;border:1px solid #ccc" src="data:image/png;base64,${b}"><figcaption>${frames.seconds[i]} s</figcaption></figure>`,
        )
        .join('')}</div></body>`;
      const sheet = await ctx.newPage();
      await sheet.setViewportSize({ width: Math.min(frames.seconds.length, 2) * (cell + 8) + 8, height: 400 });
      await sheet.setContent(html);
      await sheet.waitForLoadState('load');
      const out = `${outDir}/${v.name}-frames.png`;
      await sheet.screenshot({ path: out, fullPage: true });
      console.log(out);
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}

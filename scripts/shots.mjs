// Usage: node scripts/shots.mjs --step N [--only a,b]
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

const config = JSON.parse(readFileSync(new URL('./shots.config.json', import.meta.url), 'utf8'));
const views = only ? config.filter((v) => only.includes(v.name)) : config;
const missing = (only ?? []).filter((n) => !config.some((v) => v.name === n));
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

execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
const port = await freePort();
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/methane-ledger/`;

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
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(base + v.path);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${outDir}/${v.name}.png`, fullPage: v.fullPage });
    await ctx.close();
    console.log(`${outDir}/${v.name}.png`);
  }
  await browser.close();
} finally {
  server.kill();
}

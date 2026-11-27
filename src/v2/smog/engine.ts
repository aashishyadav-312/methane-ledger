// The smog: a framework-free canvas particle system (PLAN_V2 Appendix D, DESIGN_V2 "The smog").
//
// - Emitters sit at mines, in map units. A particle stores its emitter (the anchor) and a drift offset in CSS px,
//   so plumes keep their on-screen size while the map zooms, and stay over their mines.
// - Spawning is a Poisson process per emitter (time-rescaled, so rates can change smoothly).
// - Everything random comes from one seeded generator; the clock is injectable. Same seed and steps, same frame.
import type { MapTransform, MineId, SmogApi, SmogMode } from '../contracts';
import { clamp01, lerp } from '../motion/easing';
import {
  easeOut,
  SMOG_ALPHA_BASE,
  SMOG_ALPHA_SPAN,
  SMOG_BUDGET_DESKTOP,
  SMOG_CURL_PX_PER_S,
  SMOG_DEFAULT_SEED,
  SMOG_DOCKED_RATE_PER_S,
  SMOG_DOCKED_SIZE_FROM_PX,
  SMOG_DOCKED_SIZE_GROW_PX,
  SMOG_DPR_MAX,
  SMOG_FILL_MS,
  SMOG_FOCUS_ALPHA_MULT,
  SMOG_FOCUS_OTHER_MULT,
  SMOG_FOCUS_SELECTED_MULT,
  SMOG_LIFE_MAX_S,
  SMOG_LIFE_MIN_S,
  SMOG_MAX_ALPHA,
  SMOG_MAX_DT_S,
  SMOG_MAX_SPEED_PX_PER_S,
  SMOG_MODE_MS,
  SMOG_NOISE_FREQ_PER_UNIT,
  SMOG_NOISE_SPEED_PER_S,
  SMOG_PARTICLE_PHASE_SPREAD,
  SMOG_RATE_PER_STRENGTH,
  SMOG_RGB,
  SMOG_RISE_MAX_PX_PER_S,
  SMOG_RISE_MIN_PX_PER_S,
  SMOG_SIZE_FROM_PX,
  SMOG_SIZE_GROW_PX,
  SMOG_STILL_DT_S,
  SMOG_THROTTLE_FAST_MS,
  SMOG_THROTTLE_RATE_MULT,
  SMOG_THROTTLE_RECOVER_FRAMES,
  SMOG_THROTTLE_SLOW_FRAMES,
  SMOG_THROTTLE_SLOW_MS,
  SMOG_WIND_PX_PER_S,
} from '../motion/tokens';
import { createSimplex2, curl2, type Noise2 } from './noise';
import { IDENTITY_TRANSFORM, projectionFor, type Projection, type ViewBox } from './projection';
import { exp1, mulberry32, uniform, type Rng } from './rng';
import { smogSprite, type SpriteCanvas } from './sprite';
import type { SmogEmitter } from './strength';

export interface SmogViewport {
  widthPx: number;
  heightPx: number;
  /** Device pixel ratio; capped at SMOG_DPR_MAX. */
  dpr: number;
}

export interface SmogEngineOptions {
  emitters: readonly SmogEmitter[];
  /** The map's viewBox (map units). */
  viewBox: ViewBox;
  /** Null or absent: simulate only (tests). */
  canvas?: HTMLCanvasElement | null;
  seed?: number;
  /** Live-particle cap. Defaults to the desktop budget. */
  budget?: number;
  /** Clock in milliseconds for the live loop. Defaults to performance.now. */
  now?: () => number;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  /** Wall clock used only to measure frame cost for the throttle. */
  perfNow?: () => number;
}

export interface SmogStats {
  live: number;
  byEmitter: Map<MineId, number>;
  simTimeS: number;
  throttled: boolean;
  budget: number;
  running: boolean;
  /** Animation frames requested since the engine was made. */
  framesRequested: number;
  /** Frames drawn since the engine was made. */
  framesDrawn: number;
}

export interface SmogEngine extends SmogApi {
  setEmitters(emitters: readonly SmogEmitter[]): void;
  setTransform(t: MapTransform): void;
  setViewport(v: SmogViewport): void;
  /** CSS scale applied to the canvas from outside (the docked card); docked particles compensate for it. */
  setDisplayScale(scale: number): void;
  setBudget(budget: number): void;
  getMode(): SmogMode;
  /** Start the live loop (no-op if running). */
  start(): void;
  /** Stop the live loop; the last frame stays on the canvas. */
  stop(): void;
  /** Advance the simulation by dt seconds (no drawing). */
  step(dtS: number): void;
  /** Draw the current state. */
  draw(): void;
  /** Feed one frame's cost to the auto-throttle. */
  recordFrameMs(ms: number): void;
  stats(): SmogStats;
}

interface Particle {
  /** Emitter index. */
  e: number;
  /** Drift from the emitter, CSS px. */
  ox: number;
  oy: number;
  ageS: number;
  lifeS: number;
  risePxPerS: number;
  /** Sim time this particle started fading out (culled by a mode change), or -1. */
  fadeAtS: number;
  /** Per-particle seed in [0, 1): its phase in the noise field, so a plume billows instead of moving as one. */
  seed: number;
}

const FILL_S = SMOG_FILL_MS / 1000;
const MODE_S = SMOG_MODE_MS / 1000;
const MEAN_LIFE_S = (SMOG_LIFE_MIN_S + SMOG_LIFE_MAX_S) / 2;

/** E[min(L, T)] for a life L uniform on [min, max]. */
function meanLifeCappedAt(tS: number) {
  const a = SMOG_LIFE_MIN_S;
  const b = SMOG_LIFE_MAX_S;
  if (tS <= a) return tS;
  if (tS >= b) return MEAN_LIFE_S;
  return ((tS * tS - a * a) / 2 + tS * (b - tS)) / (b - a);
}

/** P(L > t) for a life L uniform on [min, max]. */
const survival = (tS: number) => clamp01((SMOG_LIFE_MAX_S - tS) / (SMOG_LIFE_MAX_S - SMOG_LIFE_MIN_S));

/**
 * Page-load fill. Starting from 0 particles, normal births alone take a whole life (up to 9 s) to reach the steady
 * density. During the fill window we add "fill" births at FILL_EXTRA_RATE × λ whose death times follow P(L > t) on
 * [fill end, max life]; then the live count rises linearly to exactly the steady λ × E[L] at the end of the fill and
 * stays there (in expectation), with no overshoot or dip afterwards. The t = 8 s still is the steady state.
 */
const FILL_EXTRA_RATE = (MEAN_LIFE_S - meanLifeCappedAt(FILL_S)) / FILL_S;

function sampleFillDeathS(rng: Rng): number {
  for (;;) {
    const t = uniform(rng, FILL_S, SMOG_LIFE_MAX_S);
    if (rng() < survival(t)) return t;
  }
}

export function createSmogEngine(opts: SmogEngineOptions): SmogEngine {
  const seed = opts.seed ?? SMOG_DEFAULT_SEED;
  const canvas = opts.canvas ?? null;
  const ctx = canvas ? (canvas.getContext('2d') as CanvasRenderingContext2D | null) : null;
  const viewBox = opts.viewBox;
  const raf = opts.requestFrame ?? ((cb: FrameRequestCallback) => requestAnimationFrame(cb));
  const caf = opts.cancelFrame ?? ((h: number) => cancelAnimationFrame(h));
  const perfNow = opts.perfNow ?? (() => performance.now());
  let clock: () => number = opts.now ?? (() => performance.now());
  let budget = opts.budget ?? SMOG_BUDGET_DESKTOP;

  const noise: Noise2 = createSimplex2(seed ^ 0x9e3779b9);
  let rng: Rng = mulberry32(seed);

  // Emitters, as parallel arrays.
  let emitters: SmogEmitter[] = [];
  let idIndex = new Map<MineId, number>();
  let baseRate = new Float64Array(0);
  let rate = new Float64Array(0);
  let rateFrom = new Float64Array(0);
  let rateTo = new Float64Array(0);
  let alphaMul = new Float64Array(0);
  let alphaFrom = new Float64Array(0);
  let alphaTo = new Float64Array(0);
  let hazard = new Float64Array(0);
  let hazardFill = new Float64Array(0);
  let maxAlpha = new Float64Array(0);
  let order: number[] = []; // emitter indices, strongest first (budget priority)
  let rank = new Int32Array(0);

  let mode: SmogMode = { kind: 'overview' };
  let modeStartS = 0;
  let look = 0;
  let lookFrom = 0;
  let lookTo = 0;

  const pool: Particle[] = [];
  let live = 0;
  let simS = 0;

  let transform: MapTransform = IDENTITY_TRANSFORM;
  let viewport: SmogViewport = { widthPx: canvas?.clientWidth ?? 0, heightPx: canvas?.clientHeight ?? 0, dpr: 1 };
  let proj: Projection | null = null;
  let displayScale = 1;

  let throttled = false;
  let slowRun = 0;
  let fastRun = 0;

  let running = false;
  let frameHandle: number | null = null;
  let lastClockMs: number | null = null;
  let lastPerfMs: number | null = null;
  let framesRequested = 0;
  let framesDrawn = 0;
  let destroyed = false;

  const sprite: SpriteCanvas | null = ctx ? smogSprite(SMOG_RGB) : null;
  const curlOut: [number, number] = [0, 0];
  const candidates: number[] = [];

  function selectedIndex(m: SmogMode): number {
    if (m.kind === 'overview') return -1;
    return idIndex.get(m.id) ?? -1;
  }

  function computeTargets(m: SmogMode, outRate: Float64Array, outAlpha: Float64Array): number {
    const sel = selectedIndex(m);
    for (let i = 0; i < emitters.length; i++) {
      if (m.kind === 'overview') {
        outRate[i] = baseRate[i];
        outAlpha[i] = 1;
      } else if (m.kind === 'focus') {
        outRate[i] = baseRate[i] * (i === sel ? SMOG_FOCUS_SELECTED_MULT : SMOG_FOCUS_OTHER_MULT);
        outAlpha[i] = i === sel ? SMOG_FOCUS_ALPHA_MULT : 1;
      } else {
        outRate[i] = i === sel ? SMOG_DOCKED_RATE_PER_S : 0;
        outAlpha[i] = i === sel ? SMOG_FOCUS_ALPHA_MULT : 1;
      }
    }
    return m.kind === 'docked' ? 1 : 0;
  }

  function snapToMode() {
    lookTo = computeTargets(mode, rateTo, alphaTo);
    rate.set(rateTo);
    rateFrom.set(rateTo);
    alphaMul.set(alphaTo);
    alphaFrom.set(alphaTo);
    look = lookFrom = lookTo;
    modeStartS = simS - MODE_S;
  }

  function setEmitters(list: readonly SmogEmitter[]) {
    const oldIds = emitters.map((e) => e.id);
    emitters = list.map((e) => ({ ...e, strength: clamp01(e.strength) }));
    idIndex = new Map(emitters.map((e, i) => [e.id, i]));
    const n = emitters.length;
    baseRate = new Float64Array(n);
    rate = new Float64Array(n);
    rateFrom = new Float64Array(n);
    rateTo = new Float64Array(n);
    alphaMul = new Float64Array(n);
    alphaFrom = new Float64Array(n);
    alphaTo = new Float64Array(n);
    hazard = new Float64Array(n);
    hazardFill = new Float64Array(n);
    maxAlpha = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = emitters[i].strength;
      baseRate[i] = SMOG_RATE_PER_STRENGTH * s;
      maxAlpha[i] = SMOG_ALPHA_BASE + SMOG_ALPHA_SPAN * s;
      hazard[i] = exp1(rng);
      hazardFill[i] = exp1(rng);
    }
    order = emitters.map((_, i) => i).sort((a, b) => emitters[b].strength - emitters[a].strength || a - b);
    rank = new Int32Array(n);
    order.forEach((e, r) => (rank[e] = r));
    // Keep particles whose mine is still there.
    let w = 0;
    for (let r = 0; r < live; r++) {
      const p = pool[r];
      const idx = idIndex.get(oldIds[p.e]);
      if (idx === undefined) continue;
      p.e = idx;
      pool[r] = pool[w];
      pool[w] = p;
      w++;
    }
    live = w;
    snapToMode();
  }

  function setMode(next: SmogMode) {
    const same =
      next.kind === mode.kind && (next.kind === 'overview' || (mode.kind !== 'overview' && next.id === mode.id));
    if (same) return;
    mode = next;
    // Start from what is on screen now (interruptible).
    rateFrom.set(rate);
    alphaFrom.set(alphaMul);
    lookFrom = look;
    lookTo = computeTargets(mode, rateTo, alphaTo);
    modeStartS = simS;
    // Emitters turning down thin their existing particles to the new share, fading the rest out over the mode
    // change, so the change reads within SMOG_MODE_MS instead of over a whole particle life.
    for (let r = 0; r < live; r++) {
      const p = pool[r];
      if (p.fadeAtS >= 0) continue;
      const from = rateFrom[p.e];
      if (from <= 0) continue;
      const keep = rateTo[p.e] / from;
      if (keep < 1 && rng() >= keep) p.fadeAtS = simS;
    }
  }

  function spawn(e: number, fill: boolean) {
    let p = pool[live];
    if (!p) {
      p = { e: 0, ox: 0, oy: 0, ageS: 0, lifeS: 1, risePxPerS: 0, fadeAtS: -1, seed: 0 };
      pool[live] = p;
    }
    live++;
    p.e = e;
    p.ox = 0;
    p.oy = 0;
    p.ageS = 0;
    p.fadeAtS = -1;
    p.lifeS = fill
      ? Math.max(SMOG_STILL_DT_S, sampleFillDeathS(rng) - simS)
      : uniform(rng, SMOG_LIFE_MIN_S, SMOG_LIFE_MAX_S);
    p.risePxPerS = uniform(rng, SMOG_RISE_MIN_PX_PER_S, SMOG_RISE_MAX_PX_PER_S);
    p.seed = rng();
  }

  function removeAt(r: number) {
    live--;
    const last = pool[live];
    pool[live] = pool[r];
    pool[r] = last;
  }

  function currentProjection(): Projection {
    if (!proj) proj = projectionFor(viewBox, viewport.widthPx, viewport.heightPx, transform);
    return proj;
  }

  function step(dtS: number) {
    if (dtS <= 0 || destroyed) return;
    simS += dtS;

    // 1. Mode easing.
    const u = clamp01((simS - modeStartS) / MODE_S);
    const k = easeOut(u);
    for (let i = 0; i < emitters.length; i++) {
      // Rising rates ease in. Falling rates drop at once: setMode already thinned the existing particles to the new
      // level and fades the rest out over the change, so easing the births down as well would overshoot.
      rate[i] = rateTo[i] < rateFrom[i] ? rateTo[i] : lerp(rateFrom[i], rateTo[i], k);
      alphaMul[i] = lerp(alphaFrom[i], alphaTo[i], k);
    }
    look = lerp(lookFrom, lookTo, k);

    // 2. Births (Poisson, time-rescaled hazards). Candidates are collected first so the budget can drop the weakest.
    const throttle = throttled ? SMOG_THROTTLE_RATE_MULT : 1;
    const inFill = simS - dtS < FILL_S;
    candidates.length = 0;
    for (let i = 0; i < emitters.length; i++) {
      const lam = rate[i] * throttle;
      if (lam <= 0) continue;
      hazard[i] -= lam * dtS;
      while (hazard[i] <= 0) {
        candidates.push(i * 2);
        hazard[i] += exp1(rng);
      }
      if (inFill) {
        hazardFill[i] -= lam * FILL_EXTRA_RATE * Math.min(dtS, FILL_S - (simS - dtS));
        while (hazardFill[i] <= 0) {
          candidates.push(i * 2 + 1);
          hazardFill[i] += exp1(rng);
        }
      }
    }
    const room = budget - live;
    if (candidates.length > room) {
      candidates.sort((a, b) => rank[a >> 1] - rank[b >> 1] || a - b);
      candidates.length = Math.max(0, room);
    }
    for (const c of candidates) spawn(c >> 1, (c & 1) === 1);

    // 3. Move and age.
    const basePx = currentProjection().basePx || 1;
    const tau = simS * SMOG_NOISE_SPEED_PER_S;
    const [windX, windY] = SMOG_WIND_PX_PER_S;
    for (let r = live - 1; r >= 0; r--) {
      const p = pool[r];
      p.ageS += dtS;
      if (p.ageS >= p.lifeS || (p.fadeAtS >= 0 && simS - p.fadeAtS >= MODE_S)) {
        removeAt(r);
        continue;
      }
      const em = emitters[p.e];
      const nu = (em.x + p.ox / basePx) * SMOG_NOISE_FREQ_PER_UNIT;
      const nv = (em.y + p.oy / basePx) * SMOG_NOISE_FREQ_PER_UNIT;
      curl2(noise, nu, nv, tau + p.seed * SMOG_PARTICLE_PHASE_SPREAD, curlOut);
      let vx = windX + curlOut[0] * SMOG_CURL_PX_PER_S;
      let vy = windY - p.risePxPerS + curlOut[1] * SMOG_CURL_PX_PER_S;
      const speed = Math.hypot(vx, vy);
      if (speed > SMOG_MAX_SPEED_PX_PER_S) {
        vx *= SMOG_MAX_SPEED_PX_PER_S / speed;
        vy *= SMOG_MAX_SPEED_PX_PER_S / speed;
      }
      p.ox += vx * dtS;
      p.oy += vy * dtS;
    }
  }

  function draw() {
    if (destroyed) return;
    framesDrawn++;
    if (!ctx || !canvas) return;
    const dpr = Math.min(viewport.dpr, SMOG_DPR_MAX);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sprite || live === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    const pr = currentProjection();
    const w = viewport.widthPx;
    const h = viewport.heightPx;
    const sizeFrom = lerp(SMOG_SIZE_FROM_PX, SMOG_DOCKED_SIZE_FROM_PX / displayScale, look);
    const sizeGrow = lerp(SMOG_SIZE_GROW_PX, SMOG_DOCKED_SIZE_GROW_PX / displayScale, look);
    for (let r = 0; r < live; r++) {
      const p = pool[r];
      const em = emitters[p.e];
      const life = p.ageS / p.lifeS;
      const size = sizeFrom + sizeGrow * easeOut(life);
      const x = pr.originX + pr.scalePx * em.x + p.ox;
      const y = pr.originY + pr.scalePx * em.y + p.oy;
      if (x < -size || y < -size || x > w + size || y > h + size) continue;
      let a = Math.min(SMOG_MAX_ALPHA, maxAlpha[p.e] * alphaMul[p.e]) * Math.sin(Math.PI * life);
      if (p.fadeAtS >= 0) a *= 1 - easeOut(clamp01((simS - p.fadeAtS) / MODE_S));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function recordFrameMs(ms: number) {
    if (!throttled) {
      slowRun = ms > SMOG_THROTTLE_SLOW_MS ? slowRun + 1 : 0;
      if (slowRun >= SMOG_THROTTLE_SLOW_FRAMES) {
        throttled = true;
        slowRun = 0;
        fastRun = 0;
      }
    } else {
      fastRun = ms < SMOG_THROTTLE_FAST_MS ? fastRun + 1 : 0;
      if (fastRun >= SMOG_THROTTLE_RECOVER_FRAMES) {
        throttled = false;
        fastRun = 0;
        slowRun = 0;
      }
    }
  }

  const loop: FrameRequestCallback = () => {
    frameHandle = null;
    if (!running || destroyed) return;
    const nowMs = clock();
    if (lastClockMs !== null) step(Math.min(Math.max((nowMs - lastClockMs) / 1000, 0), SMOG_MAX_DT_S));
    lastClockMs = nowMs;
    draw();
    const perf = perfNow();
    if (lastPerfMs !== null) recordFrameMs(perf - lastPerfMs);
    lastPerfMs = perf;
    schedule();
  };

  function schedule() {
    if (frameHandle !== null) return;
    framesRequested++;
    frameHandle = raf(loop);
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    lastClockMs = null;
    lastPerfMs = null;
    schedule();
  }

  function stop() {
    running = false;
    if (frameHandle !== null) caf(frameHandle);
    frameHandle = null;
  }

  function reset() {
    rng = mulberry32(seed);
    live = 0;
    simS = 0;
    throttled = false;
    slowRun = 0;
    fastRun = 0;
    for (let i = 0; i < emitters.length; i++) {
      hazard[i] = exp1(rng);
      hazardFill[i] = exp1(rng);
    }
    snapToMode();
  }

  function renderStill(tS: number) {
    reset();
    const steps = Math.round(Math.max(0, tS) / SMOG_STILL_DT_S);
    for (let i = 0; i < steps; i++) step(SMOG_STILL_DT_S);
    draw();
  }

  function setViewport(v: SmogViewport) {
    viewport = {
      widthPx: Math.max(0, v.widthPx),
      heightPx: Math.max(0, v.heightPx),
      dpr: Math.min(v.dpr, SMOG_DPR_MAX),
    };
    proj = null;
    if (canvas) {
      canvas.width = Math.round(viewport.widthPx * viewport.dpr);
      canvas.height = Math.round(viewport.heightPx * viewport.dpr);
    }
  }

  setEmitters(opts.emitters);
  reset();

  return {
    setMode,
    setClock(now) {
      clock = now;
      lastClockMs = null;
    },
    renderStill,
    destroy() {
      stop();
      destroyed = true;
      live = 0;
    },
    setEmitters,
    setTransform(t) {
      transform = t;
      proj = null;
    },
    setViewport,
    setDisplayScale(s) {
      displayScale = s > 0 && Number.isFinite(s) ? s : 1;
    },
    setBudget(b) {
      budget = Math.max(0, Math.floor(b));
    },
    getMode: () => mode,
    start,
    stop,
    step,
    draw,
    recordFrameMs,
    stats() {
      const byEmitter = new Map<MineId, number>();
      for (let r = 0; r < live; r++) {
        const id = emitters[pool[r].e].id;
        byEmitter.set(id, (byEmitter.get(id) ?? 0) + 1);
      }
      return { live, byEmitter, simTimeS: simS, throttled, budget, running, framesRequested, framesDrawn };
    },
  };
}

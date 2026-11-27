import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cubicBezier } from '../../../src/v2/motion/easing';
import {
  easeOut,
  readFrozenSeconds,
  SMOG_BUDGET_DESKTOP,
  SMOG_BUDGET_PHONE,
  SMOG_LIFE_MAX_S,
  SMOG_LIFE_MIN_S,
  SMOG_MODE_MS,
  SMOG_RATE_PER_STRENGTH,
  SMOG_STILL_DT_S,
  SMOG_STILL_T_S,
  SMOG_STRENGTH_CLOSED,
  SMOG_STRENGTH_FLOOR,
} from '../../../src/v2/motion/tokens';
import { createSmogEngine, type SmogEngine } from '../../../src/v2/smog/engine';
import { createSimplex2 } from '../../../src/v2/smog/noise';
import { mulberry32 } from '../../../src/v2/smog/rng';
import { SmogLayer } from '../../../src/v2/smog/SmogLayer';
import { emittersFromSources, type SmogEmitter } from '../../../src/v2/smog/strength';
import { projectionFor } from '../../../src/v2/smog/projection';
import { fitTransform, toScreen } from '../../../src/v2/map/geometry';

const VIEWBOX = [0, 0, 906, 1016] as const;

function engineFor(emitters: SmogEmitter[], extra: Partial<Parameters<typeof createSmogEngine>[0]> = {}): SmogEngine {
  const e = createSmogEngine({ emitters, viewBox: VIEWBOX, canvas: null, seed: 7, ...extra });
  e.setViewport({ widthPx: 1440, heightPx: 900, dpr: 1 });
  return e;
}

/** A belt of emitters with a spread of strengths, like the coal belt. */
function belt(n: number, seed = 1): SmogEmitter[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    x: 400 + rng() * 250,
    y: 380 + rng() * 150,
    strength: i % 10 === 0 ? 1 : i % 3 === 0 ? 0.6 : SMOG_STRENGTH_FLOOR,
  }));
}

const run = (e: SmogEngine, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SMOG_STILL_DT_S); i++) e.step(SMOG_STILL_DT_S);
};
const share = (e: SmogEngine, id: string) => {
  const s = e.stats();
  return (s.byEmitter.get(id) ?? 0) / Math.max(1, s.live);
};

describe('smog engine', () => {
  it('gives identical particle counts at t = 8 s across runs with the same seed', () => {
    const a = engineFor(belt(120));
    const b = engineFor(belt(120));
    a.renderStill(SMOG_STILL_T_S);
    b.renderStill(SMOG_STILL_T_S);
    expect(a.stats().live).toBeGreaterThan(0);
    expect(a.stats().live).toBe(b.stats().live);
    expect([...a.stats().byEmitter]).toEqual([...b.stats().byEmitter]);
    // And the still is repeatable on the same engine.
    const first = a.stats().live;
    a.renderStill(SMOG_STILL_T_S);
    expect(a.stats().live).toBe(first);
    // A different seed gives a different (but equally steady) frame.
    const c = engineFor(belt(120), { seed: 8 });
    c.renderStill(SMOG_STILL_T_S);
    expect([...c.stats().byEmitter]).not.toEqual([...a.stats().byEmitter]);
  });

  it('holds the particle cap, and drops the weakest emitters first when over budget', () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({
      id: `e${i}`,
      x: i % 900,
      y: 500,
      strength: i < 300 ? 1 : 0.1,
    }));
    for (const budget of [SMOG_BUDGET_DESKTOP, SMOG_BUDGET_PHONE]) {
      const e = engineFor(many, { budget });
      let peak = 0;
      for (let i = 0; i < 12 / SMOG_STILL_DT_S; i++) {
        e.step(SMOG_STILL_DT_S);
        peak = Math.max(peak, e.stats().live);
      }
      expect(peak).toBeLessThanOrEqual(budget);
      expect(peak).toBe(budget);
      let strong = 0;
      for (const [id, n] of e.stats().byEmitter) if (Number(id.slice(1)) < 300) strong += n;
      expect(strong / e.stats().live).toBeGreaterThan(0.5);
    }
  });

  it('focus raises the selected emitter above 50% of live particles within 2 s', () => {
    // A strong mine among gassy and floor neighbours, as Moonidih sits among Jharia and Raniganj mines.
    // Plumes hold only a handful of particles each, so the share is averaged over a dozen seeds.
    const cluster: SmogEmitter[] = [
      { id: 'sel', x: 560, y: 444, strength: 1 },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `gassy${i}`, x: 550 + i * 6, y: 440, strength: 0.65 })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `floor${i}`,
        x: 530 + i * 5,
        y: 460,
        strength: SMOG_STRENGTH_FLOOR,
      })),
    ];
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const before: number[] = [];
    const focused: number[] = [];
    const control: number[] = [];
    for (const seed of seeds) {
      const e = engineFor(cluster, { seed });
      e.renderStill(SMOG_STILL_T_S);
      before.push(share(e, 'sel'));
      e.setMode({ kind: 'focus', id: 'sel' });
      run(e, 2);
      focused.push(share(e, 'sel'));
      const c = engineFor(cluster, { seed });
      c.renderStill(SMOG_STILL_T_S + 2);
      control.push(share(c, 'sel'));
    }
    expect(mean(before)).toBeLessThan(0.5);
    expect(mean(control)).toBeLessThan(0.5);
    expect(mean(focused)).toBeGreaterThan(0.5);
    expect(mean(focused)).toBeGreaterThan(3 * mean(before));
  });

  it('fills from 0 to the steady density over the page-load fill, without overshoot', () => {
    const emitters = belt(200);
    const e = engineFor(emitters);
    const meanLife = (SMOG_LIFE_MIN_S + SMOG_LIFE_MAX_S) / 2;
    const steady = emitters.reduce((a, m) => a + SMOG_RATE_PER_STRENGTH * m.strength, 0) * meanLife;
    expect(e.stats().live).toBe(0);
    run(e, 2.5);
    expect(e.stats().live / steady).toBeGreaterThan(0.85);
    run(e, 2.5);
    expect(e.stats().live / steady).toBeLessThan(1.15);
    run(e, 3);
    expect(Math.abs(e.stats().live / steady - 1)).toBeLessThan(0.15);
  });

  it('docked mode keeps only the selected plume', () => {
    const emitters = belt(60);
    const e = engineFor(emitters);
    e.renderStill(SMOG_STILL_T_S);
    e.setMode({ kind: 'docked', id: 'm0' });
    run(e, SMOG_MODE_MS / 1000 + 0.1);
    const s = e.stats();
    expect([...s.byEmitter.keys()]).toEqual(['m0']);
    run(e, 6);
    expect(e.stats().byEmitter.get('m0')).toBeGreaterThan(2);
  });

  it('mode changes are interruptible and ignore repeats', () => {
    const e = engineFor(belt(60));
    e.renderStill(4);
    e.setMode({ kind: 'focus', id: 'm0' });
    run(e, 0.2);
    e.setMode({ kind: 'focus', id: 'm0' });
    e.setMode({ kind: 'overview' });
    run(e, 0.2);
    expect(e.getMode()).toEqual({ kind: 'overview' });
    expect(e.stats().live).toBeGreaterThan(0);
  });

  it('auto-throttles after three slow frames and recovers after 60 fast ones', () => {
    const e = engineFor(belt(10));
    e.recordFrameMs(25);
    e.recordFrameMs(25);
    expect(e.stats().throttled).toBe(false);
    e.recordFrameMs(25);
    expect(e.stats().throttled).toBe(true);
    for (let i = 0; i < 59; i++) e.recordFrameMs(8);
    expect(e.stats().throttled).toBe(true);
    e.recordFrameMs(8);
    expect(e.stats().throttled).toBe(false);
  });

  it('runs the live loop on the injected clock and frames, and stops cleanly', () => {
    const frames: FrameRequestCallback[] = [];
    let nowMs = 0;
    const e = engineFor(belt(30), {
      now: () => nowMs,
      requestFrame: (cb) => frames.push(cb),
      cancelFrame: () => {},
      perfNow: () => nowMs,
    });
    e.start();
    for (let i = 0; i < 120; i++) {
      nowMs += 1000 / 60;
      frames.shift()?.(nowMs);
    }
    expect(e.stats().simTimeS).toBeCloseTo(119 / 60, 5);
    expect(e.stats().live).toBeGreaterThan(0);
    e.stop();
    const at = e.stats().simTimeS;
    nowMs += 1000;
    frames.splice(0).forEach((cb) => cb(nowMs));
    expect(e.stats().simTimeS).toBe(at);
    expect(e.stats().running).toBe(false);
    e.destroy();
  });
});

describe('smog and the map share one transform', () => {
  it("puts a mine where <MineMapV2> draws its dot, at the fit view and zoomed in", () => {
    const size = { width: 1440, height: 900 };
    const fit = fitTransform(VIEWBOX, size, { top: 72, right: 0, bottom: 0, left: 0 });
    for (const t of [fit, { k: fit.k * 6, x: -2400, y: -1900 }]) {
      const pr = projectionFor(VIEWBOX, size.width, size.height, t);
      const dot = toScreen(t, 561.4, 444.2);
      expect(pr.originX + pr.scalePx * 561.4).toBeCloseTo(dot.x, 6);
      expect(pr.originY + pr.scalePx * 444.2).toBeCloseTo(dot.y, 6);
    }
  });

  it('throttles on the frame\'s own cost, not on the time between frames', () => {
    const frames: FrameRequestCallback[] = [];
    let nowMs = 0;
    const e = engineFor(belt(30), {
      now: () => nowMs,
      requestFrame: (cb) => frames.push(cb),
      cancelFrame: () => {},
      perfNow: () => nowMs,
    });
    e.start();
    // A 30 Hz display: 33 ms between frames, but each frame's work is instant.
    for (let i = 0; i < 30; i++) {
      nowMs += 1000 / 30;
      frames.shift()?.(nowMs);
    }
    expect(e.stats().throttled).toBe(false);
    e.destroy();
  });
});

describe('smog inputs', () => {
  it('turns methane into Appendix D strengths', () => {
    const em = emittersFromSources([
      { id: 'big', x: 0, y: 0, methaneMm3PerYr: 99 },
      { id: 'mid', x: 0, y: 0, methaneMm3PerYr: 9 },
      { id: 'oc', x: 0, y: 0, methaneMm3PerYr: 500, floor: true },
      { id: 'tiny', x: 0, y: 0, methaneMm3PerYr: 0.01 },
      { id: 'none', x: 0, y: 0, methaneMm3PerYr: null },
      { id: 'closed', x: 0, y: 0, methaneMm3PerYr: null, closed: true },
    ]);
    const s = Object.fromEntries(em.map((e) => [e.id, e.strength]));
    expect(s.big).toBe(1);
    expect(s.mid).toBeCloseTo(0.5, 6);
    expect(s.oc).toBe(SMOG_STRENGTH_FLOOR);
    expect(s.tiny).toBe(SMOG_STRENGTH_FLOOR);
    expect(s.none).toBe(SMOG_STRENGTH_FLOOR);
    expect(s.closed).toBe(SMOG_STRENGTH_CLOSED);
  });

  it('has seeded, bounded simplex noise', () => {
    const a = createSimplex2(3);
    const b = createSimplex2(3);
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.137;
      const y = i * 0.071;
      expect(a(x, y)).toBe(b(x, y));
      max = Math.max(max, Math.abs(a(x, y)));
    }
    expect(max).toBeLessThanOrEqual(1.01);
    expect(max).toBeGreaterThan(0.5);
  });

  it('reads ?freeze= from the query or the hash route', () => {
    expect(readFrozenSeconds({ search: '?freeze=8', hash: '' })).toBe(8);
    expect(readFrozenSeconds({ search: '', hash: '#/mine/x?freeze=1.5' })).toBe(1.5);
    expect(readFrozenSeconds({ search: '', hash: '#/' })).toBeNull();
    expect(readFrozenSeconds({ search: '?freeze=abc', hash: '' })).toBeNull();
  });

  it('matches the CSS ease-out curve', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.9);
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe('<SmogLayer>', () => {
  let clearRects = 0;
  let drawImages = 0;
  let rafSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearRects = 0;
    drawImages = 0;
    const ctx = {
      setTransform: () => {},
      clearRect: () => clearRects++,
      drawImage: () => drawImages++,
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctx as unknown as CanvasRenderingContext2D,
    );
    rafSpy = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  const reduce = (on: boolean) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: on && q.includes('reduce'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );

  const mount = () =>
    act(() => {
      render(
        createElement(
          'div',
          { style: { position: 'relative', width: '800px', height: '600px' } },
          createElement(SmogLayer, { emitters: belt(80), viewBox: VIEWBOX, mode: { kind: 'overview' } }),
        ),
      );
    });

  it('with reduced motion draws one still frame and schedules no animation frames', () => {
    reduce(true);
    mount();
    expect(rafSpy).not.toHaveBeenCalled();
    expect(clearRects).toBe(1);
    expect(drawImages).toBeGreaterThan(0);
  });

  it('with ?freeze= draws that frame and schedules no animation frames', () => {
    reduce(false);
    window.history.replaceState(null, '', '/?freeze=3');
    mount();
    expect(rafSpy).not.toHaveBeenCalled();
    expect(clearRects).toBe(1);
  });

  it('runs live otherwise', () => {
    reduce(false);
    mount();
    expect(rafSpy).toHaveBeenCalled();
  });
});

// Easing helpers for v2 motion. Framework-free; the numbers that feed them live in tokens.ts.

export type Easing = (t: number) => number;

/** CSS-style cubic-bezier(x1, y1, x2, y2) as a function of progress t in [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  // Polynomial coefficients of the x(u) and y(u) curves (endpoints at 0 and 1).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (u: number) => ((ax * u + bx) * u + cx) * u;
  const yAt = (u: number) => ((ay * u + by) * u + cy) * u;
  const dxAt = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solveU = (x: number) => {
    // Newton first, bisection as the fallback when the slope is flat.
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = xAt(u) - x;
      if (Math.abs(err) < 1e-6) return u;
      const d = dxAt(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      const xu = xAt(u);
      if (Math.abs(xu - x) < 1e-6) break;
      if (xu < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return yAt(solveU(t));
  };
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** "cubic-bezier(a, b, c, d)" string for CSS from a 4-tuple. */
export const bezierCss = (b: readonly [number, number, number, number]) => `cubic-bezier(${b.join(', ')})`;

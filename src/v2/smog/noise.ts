// 2D simplex noise (after Gustavson's public-domain description) and its curl, for smog drift.
import { mulberry32 } from './rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
// Twelve gradient directions; only x and y of the classic 3D set are used in 2D.
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
/** Scales the raw sum to roughly [-1, 1]. */
const OUT_SCALE = 70;

export type Noise2 = (x: number, y: number) => number;

/** A seeded 2D simplex noise function returning values in about [-1, 1]. */
export function createSimplex2(seed: number): Noise2 {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const corner = (gi: number, x: number, y: number) => {
    const t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    const t2 = t * t;
    return t2 * t2 * (GRAD[gi * 2] * x + GRAD[gi * 2 + 1] * y);
  };
  return (xin: number, yin: number) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const n0 = corner(permMod12[ii + perm[jj]], x0, y0);
    const n1 = corner(permMod12[ii + i1 + perm[jj + j1]], x1, y1);
    const n2 = corner(permMod12[ii + 1 + perm[jj + 1]], x2, y2);
    return OUT_SCALE * (n0 + n1 + n2);
  };
}

/** Finite-difference step in noise space for the curl. */
const CURL_EPS = 1e-3;

/**
 * Curl of the scalar field ψ(u, v + τ) at noise coordinates (u, v), time offset τ: (∂ψ/∂v, −∂ψ/∂u).
 * Divergence-free, so particles swirl without bunching. Clamped to unit length; the caller scales it.
 */
export function curl2(noise: Noise2, u: number, v: number, tau: number, out: [number, number]): [number, number] {
  const vt = v + tau;
  const dv = (noise(u, vt + CURL_EPS) - noise(u, vt - CURL_EPS)) / (2 * CURL_EPS);
  const du = (noise(u + CURL_EPS, vt) - noise(u - CURL_EPS, vt)) / (2 * CURL_EPS);
  let cx = dv;
  let cy = -du;
  const len = Math.hypot(cx, cy);
  if (len > 1) {
    cx /= len;
    cy /= len;
  }
  out[0] = cx;
  out[1] = cy;
  return out;
}

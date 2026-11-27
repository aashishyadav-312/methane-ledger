// Seeded random numbers for the smog (mulberry32). Same seed, same sequence, on every machine.

export type Rng = () => number;

/** mulberry32: a small, fast 32-bit generator. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [lo, hi). */
export const uniform = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();

/** Exponential with mean 1 (the time to the next event of a unit-rate Poisson process). */
export const exp1 = (rng: Rng) => -Math.log(1 - rng());

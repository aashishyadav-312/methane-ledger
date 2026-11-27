// Pre-rendered soft disc sprites, drawn once per colour and size and reused for every particle.
import { SMOG_SPRITE_PX } from '../motion/tokens';

export type SpriteCanvas = HTMLCanvasElement | OffscreenCanvas;

const cache = new Map<string, SpriteCanvas | null>();

function makeCanvas(px: number): SpriteCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(px, px);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    return c;
  }
  return null;
}

/**
 * A radial-gradient disc in `rgb` at full alpha in the centre, fading to nothing at the rim. Particles set
 * their own alpha with globalAlpha. Returns null where no canvas exists (tests without a DOM canvas).
 */
export function smogSprite(rgb: readonly [number, number, number], px: number = SMOG_SPRITE_PX): SpriteCanvas | null {
  const key = `${rgb.join(',')}|${px}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const canvas = makeCanvas(px);
  const ctx = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!canvas || !ctx) {
    cache.set(key, null);
    return null;
  }
  const r = px / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const [red, green, blue] = rgb;
  // A soft, slightly flat-topped falloff (gaussian-like), so overlapping discs read as haze, not as dots.
  const stops: Array<[number, number]> = [
    [0, 1],
    [0.35, 0.9],
    [0.65, 0.55],
    [0.85, 0.2],
    [1, 0],
  ];
  for (const [at, a] of stops) g.addColorStop(at, `rgba(${red}, ${green}, ${blue}, ${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  cache.set(key, canvas);
  return canvas;
}

/** For tests: forget every cached sprite. */
export function clearSpriteCache() {
  cache.clear();
}

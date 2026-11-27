/*
 * The home's two timed moments, framework-free: the page-load sequence and the selection ripple (DESIGN_V2
 * "Motion"). Live, they run on the Web Animations API with no fill afterwards, so nothing is left on the map's
 * wrapper (a transform there would break the docked card's `position: fixed`). Frozen (`?freeze=<s>`), they are
 * drawn at that second and stay.
 */
import { clamp01, lerp } from '../motion/easing';
import {
  EASE_OUT_CSS,
  easeOut,
  LOAD_HEADLINE_DELAY_MS,
  LOAD_MAP_FADE_MS,
  LOAD_MAP_SCALE_FROM,
  REDUCED_CROSSFADE_MS,
  RIPPLE_MS,
  RIPPLE_OPACITY_FROM,
  RIPPLE_OPACITY_TO,
  RIPPLE_RADIUS_FROM_PX,
  RIPPLE_RADIUS_TO_PX,
} from '../motion/tokens';

const canAnimate = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && typeof el.animate === 'function';

/**
 * Page load: the map fades in over 600 ms (opacity 0 to 1, scale 0.985 to 1, `--ease-out`); the headline and the
 * search fade in 120 ms after it. Reduced motion: opacity only, over the 150 ms crossfade.
 */
export function playLoad(map: HTMLElement | null, lead: HTMLElement | null, freezeS: number | null, reduced: boolean) {
  const ms = reduced ? REDUCED_CROSSFADE_MS : LOAD_MAP_FADE_MS;
  const from = reduced ? 1 : LOAD_MAP_SCALE_FROM;
  if (freezeS !== null) {
    const pm = easeOut(clamp01((freezeS * 1000) / ms));
    const pl = easeOut(clamp01((freezeS * 1000 - LOAD_HEADLINE_DELAY_MS) / ms));
    if (map && pm < 1) {
      map.style.opacity = String(pm);
      map.style.transform = `scale(${lerp(from, 1, pm)})`;
    }
    if (lead && pl < 1) lead.style.opacity = String(pl);
    return;
  }
  if (canAnimate(map)) {
    map.animate(
      [
        { opacity: 0, transform: `scale(${from})` },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: ms, easing: EASE_OUT_CSS, fill: 'backwards' },
    );
  }
  if (canAnimate(lead)) {
    lead.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ms,
      delay: LOAD_HEADLINE_DELAY_MS,
      easing: EASE_OUT_CSS,
      fill: 'backwards',
    });
  }
}

/** The ring's diameter at the end of the ripple, px. */
export const RIPPLE_DIAMETER_PX = RIPPLE_RADIUS_TO_PX * 2;

/** One ring from the mine: radius 0 to 28px, opacity 0.5 to 0, 700 ms, once. Not under reduced motion. */
export function playRipple(el: HTMLElement | null, x: number, y: number): void {
  if (!canAnimate(el)) return;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.getAnimations().forEach((a) => a.cancel());
  const scaleFrom = RIPPLE_RADIUS_FROM_PX / RIPPLE_RADIUS_TO_PX;
  el.animate(
    [
      { opacity: RIPPLE_OPACITY_FROM, transform: `translate(-50%, -50%) scale(${scaleFrom})` },
      { opacity: RIPPLE_OPACITY_TO, transform: 'translate(-50%, -50%) scale(1)' },
    ],
    { duration: RIPPLE_MS, easing: EASE_OUT_CSS },
  );
}

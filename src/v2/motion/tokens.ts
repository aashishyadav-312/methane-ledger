// Every v2 timing, easing, spring and smog number, from docs/DESIGN_V2.md ("Motion", "The smog", "Map") and
// docs/PLAN_V2.md Appendices D, E and F. Components import from here; nothing hardcodes a duration.
// Units are in the names: _MS milliseconds, _S seconds, _PX CSS pixels, _PX_PER_S CSS pixels a second.
import { useSyncExternalStore } from 'react';
import { bezierCss, cubicBezier } from './easing';

// ---------------------------------------------------------------- easings

/** `--ease-out`: entrances, presses, smog mode changes. */
export const EASE_OUT_BEZIER = [0.23, 1, 0.32, 1] as const;
/** `--ease-drawer`: panel and sheet slides. */
export const EASE_DRAWER_BEZIER = [0.32, 0.72, 0, 1] as const;
/** Scroll docking curve e(p) (Appendix E). */
export const EASE_IN_OUT_DOCK_BEZIER = [0.77, 0, 0.175, 1] as const;

export const easeOut = cubicBezier(...EASE_OUT_BEZIER);
export const easeDrawer = cubicBezier(...EASE_DRAWER_BEZIER);
export const easeInOutDock = cubicBezier(...EASE_IN_OUT_DOCK_BEZIER);

export const EASE_OUT_CSS = bezierCss(EASE_OUT_BEZIER);
export const EASE_DRAWER_CSS = bezierCss(EASE_DRAWER_BEZIER);
export const EASE_IN_OUT_DOCK_CSS = bezierCss(EASE_IN_OUT_DOCK_BEZIER);

// ---------------------------------------------------------------- presses and reduced motion

export const PRESS_SCALE = 0.97;
export const PRESS_MS = 160;
/** Reduced motion swaps movement for a crossfade of this length (fly-to, docking). */
export const REDUCED_CROSSFADE_MS = 150;

// ---------------------------------------------------------------- page load (the one orchestrated sequence)

export const LOAD_MAP_FADE_MS = 600;
export const LOAD_MAP_SCALE_FROM = 0.985;
/** The headline and search fade in this long after the map starts. */
export const LOAD_HEADLINE_DELAY_MS = 120;
/** The smog starts at 0 particles and reaches its steady density over this time. */
export const SMOG_FILL_MS = 2500;

// ---------------------------------------------------------------- hover

export const DOT_HOVER_SCALE = 1.5;
export const DOT_HOVER_MS = 120;
export const TOOLTIP_FADE_MS = 125;

// ---------------------------------------------------------------- map (DESIGN_V2 "Map", Appendix F)

export const MAP_ZOOM_MIN_K = 1;
export const MAP_ZOOM_MAX_K = 24;
/** Panning is clamped to India plus this share of its size on each side. */
export const MAP_PAN_MARGIN_SHARE = 0.1;
export const MAP_LABEL_MIN_K = 4;
export const MAP_LABEL_COUNT = 12;
/** Coalfield-position mines get a hollow centre past this zoom. */
export const MAP_HOLLOW_MIN_K = 4;
export const MAP_DIM_OPACITY = 0.45;

export const FLY_TARGET_K = 6;
export const FLY_RHO = 1.2;
/** Duration = clamp(interpolateZoom duration × factor, min, max). */
export const FLY_DURATION_FACTOR = 0.6;
export const FLY_MIN_MS = 500;
export const FLY_MAX_MS = 900;

// ---------------------------------------------------------------- select a mine

export const RIPPLE_RADIUS_FROM_PX = 0;
export const RIPPLE_RADIUS_TO_PX = 28;
export const RIPPLE_OPACITY_FROM = 0.5;
export const RIPPLE_OPACITY_TO = 0;
export const RIPPLE_MS = 700;
export const PANEL_SLIDE_MS = 320;

// ---------------------------------------------------------------- run the model

export const RUN_PROGRESS_UNDERLINE_PX = 2;
export const COUNT_UP_MS = 600;
/** Skip the count-up when the last run was this recent. */
export const COUNT_UP_SKIP_MS = 300;
export const SCROLL_CUE_RISE_PX = 8;

// ---------------------------------------------------------------- scroll docking (Appendix E)

export const DOCK_SPRING = { stiffness: 300, damping: 40, mass: 1 } as const;
export const DOCK_ENTER_P = 0.98;
export const DOCK_EXIT_P = 0.95;
export const DOCK_SHADOW_AFTER_P = 0.9;
export const DOCK_BORDER_FADE_MS = 120;
export const DOCK_RADIUS_PX = 16;
export const DOCK_MARGIN_RIGHT_PX = 24;
export const DOCK_MARGIN_TOP_PX = 16;
export const DOCK_PHONE_MARGIN_PX = 12;
export const MINI_W_PX = 184;
export const MINI_W_PHONE_PX = 120;
export const RESULTS_SHEET_RADIUS_PX = 24;
export const RESULTS_SHEET_SHADOW = '0 -24px 60px rgba(26,25,22,.12)';
/** Reduced motion: the docking becomes a crossfade at this progress. */
export const DOCK_REDUCED_CROSSFADE_P = 0.5;

// ---------------------------------------------------------------- charts

/** A chart draws once when this share of it is on screen. */
export const CHART_REVEAL_THRESHOLD = 0.4;
export const CHART_LINE_DRAW_MS = 700;
export const CHART_BAR_GROW_MS = 500;
export const CHART_BAR_STAGGER_MS = 30;
export const CHART_BAR_STAGGER_MAX = 10;
export const CHART_MORPH_MS = 200;

// ---------------------------------------------------------------- layout breakpoints used by motion

/** Below this viewport width the phone budgets and docking apply. */
export const PHONE_MAX_W_PX = 768;

// ---------------------------------------------------------------- smog (Appendix D, DESIGN_V2 "The smog")

/** RGB of every smog particle (`--smog`). Never blue or purple. */
export const SMOG_RGB = [110, 101, 86] as const;
/** Highest alpha of any single particle (`--smog-max-alpha`). */
export const SMOG_MAX_ALPHA = 0.1;
/** maxAlpha = base + span × strength. */
export const SMOG_ALPHA_BASE = 0.05;
export const SMOG_ALPHA_SPAN = 0.04;
/** The selected plume keeps this much more alpha in focus and docked modes. */
export const SMOG_FOCUS_ALPHA_MULT = 1.3;

/** Strength floor for opencast and Degree I mines, and for mines with no methane figure. */
export const SMOG_STRENGTH_FLOOR = 0.08;
/** Strength of a closed mine (abandoned mine methane, faint wisps). */
export const SMOG_STRENGTH_CLOSED = 0.05;

/** Overview spawn rate λ = this × strength, particles a second. */
export const SMOG_RATE_PER_STRENGTH = 1.0;
export const SMOG_FOCUS_SELECTED_MULT = 8;
export const SMOG_FOCUS_OTHER_MULT = 0.3;
/** Docked: only the selected mine, at this absolute rate (particles a second). */
export const SMOG_DOCKED_RATE_PER_S = 2.5;
/** Mode changes ease the multipliers over this time, with easeOut. */
export const SMOG_MODE_MS = 600;

export const SMOG_LIFE_MIN_S = 4;
export const SMOG_LIFE_MAX_S = 9;
/** Wind: 3 px/s toward east-north-east, in screen space (y down). */
export const SMOG_WIND_PX_PER_S = [2.8, -1.0] as const;
export const SMOG_RISE_MIN_PX_PER_S = 8;
export const SMOG_RISE_MAX_PX_PER_S = 14;
/** Curl noise: curl(simplex(p × frequency, t × speed)) × strength. p in map units. */
export const SMOG_NOISE_FREQ_PER_UNIT = 0.004;
export const SMOG_NOISE_SPEED_PER_S = 0.15;
export const SMOG_CURL_PX_PER_S = 6;
/**
 * Each particle samples the noise field at its own time phase, seed × this (noise time units), so the particles of
 * one plume drift a little apart and billow. Tuned on stills (Step 4 design pass); 0 makes every plume a rigid line.
 */
export const SMOG_PARTICLE_PHASE_SPREAD = 0.5;
export const SMOG_MAX_SPEED_PX_PER_S = 20;

/** size(a) = from + grow × easeOut(a / L), in CSS px (diameter). */
export const SMOG_SIZE_FROM_PX = 4;
export const SMOG_SIZE_GROW_PX = 18;
export const SMOG_DOCKED_SIZE_FROM_PX = 2;
export const SMOG_DOCKED_SIZE_GROW_PX = 6;
/** Pre-rendered soft disc, drawn once. */
export const SMOG_SPRITE_PX = 64;

/**
 * The viewport the smog's px numbers are tuned for (the 1440 × 900 desktop artboard). Smaller maps scale particle
 * sizes and speeds down with the map, so a phone shows the same haze, not plumes twice as large as the coal belt.
 */
export const SMOG_REFERENCE_VIEWPORT_PX = [1440, 900] as const;

export const SMOG_BUDGET_DESKTOP = 700;
export const SMOG_BUDGET_PHONE = 220;
export const SMOG_DPR_MAX = 1.5;

/** Throttle: this many frames in a row over the slow limit halves every λ ... */
export const SMOG_THROTTLE_SLOW_FRAMES = 3;
export const SMOG_THROTTLE_SLOW_MS = 20;
/** ... until this many frames in a row under the fast limit. */
export const SMOG_THROTTLE_RECOVER_FRAMES = 60;
export const SMOG_THROTTLE_FAST_MS = 12;
export const SMOG_THROTTLE_RATE_MULT = 0.5;

/** The still frame: simulate from t = 0 to this time at a fixed step, then draw. */
export const SMOG_STILL_T_S = 8;
export const SMOG_STILL_DT_S = 1 / 30;
/** The live loop never advances the simulation by more than one still step per frame. */
export const SMOG_MAX_DT_S = SMOG_STILL_DT_S;
export const SMOG_DEFAULT_SEED = 20261127;

// ---------------------------------------------------------------- hooks

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}

/** Current `prefers-reduced-motion` value, without React (for engines and tests). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** True when the user asks for reduced motion. Updates live when the setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

/**
 * The `?freeze=<seconds>` value, read from the query string or from the query inside the hash route
 * (`#/mine/x?freeze=8`). Returns null when the page is live.
 */
export function readFrozenSeconds(
  loc: Pick<Location, 'search' | 'hash'> | undefined = globalThis.location,
): number | null {
  if (!loc) return null;
  const fromQuery = (q: string) => {
    const raw = new URLSearchParams(q).get('freeze');
    if (raw === null || raw.trim() === '') return null;
    const s = Number(raw);
    return Number.isFinite(s) && s >= 0 ? s : null;
  };
  const hashQuery = loc.hash.includes('?') ? loc.hash.slice(loc.hash.indexOf('?')) : '';
  return fromQuery(loc.search) ?? fromQuery(hashQuery);
}

function subscribeLocation(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

/** Frozen-clock time in seconds from `?freeze=`, or null when live. Animated views render that frame and stop. */
export function useFrozenClock(): number | null {
  return useSyncExternalStore(
    subscribeLocation,
    () => readFrozenSeconds(),
    () => null,
  );
}

/*
 * Map timings, easings and sizes. Every DESIGN_V2 motion number comes from `src/v2/motion/tokens.ts` (PLAN_V2 Global
 * rule 9); this file only groups them for the map and adds the map's own sizes, each with its source.
 */
import {
  DOCK_ENTER_P,
  DOCK_EXIT_P,
  DOCK_MARGIN_RIGHT_PX,
  DOCK_MARGIN_TOP_PX,
  DOCK_PHONE_MARGIN_PX,
  DOCK_RADIUS_PX,
  DOCK_REDUCED_CROSSFADE_P,
  DOCK_SHADOW_AFTER_P,
  DOCK_SPRING,
  DOT_HOVER_MS,
  DOT_HOVER_SCALE,
  EASE_DRAWER_BEZIER,
  EASE_IN_OUT_DOCK_BEZIER,
  EASE_OUT_BEZIER,
  FLY_DURATION_FACTOR,
  FLY_MAX_MS,
  FLY_MIN_MS,
  FLY_RHO,
  FLY_TARGET_K,
  MAP_DIM_OPACITY,
  MAP_HOLLOW_MIN_K,
  MAP_LABEL_COUNT,
  MAP_LABEL_MIN_K,
  MAP_PAN_MARGIN_SHARE,
  MAP_ZOOM_MAX_K,
  MAP_ZOOM_MIN_K,
  MINI_W_PHONE_PX,
  MINI_W_PX,
  PANEL_SLIDE_MS,
  PHONE_MAX_W_PX,
  PRESS_MS,
  PRESS_SCALE,
  readFrozenSeconds,
  REDUCED_CROSSFADE_MS as TOKEN_REDUCED_CROSSFADE_MS,
  TOOLTIP_FADE_MS,
} from '../motion/tokens';

/** DESIGN_V2 "Map": d3-zoom scale 1 to 24, relative to the fitted India view. */
export const ZOOM_EXTENT = [MAP_ZOOM_MIN_K, MAP_ZOOM_MAX_K] as const;
/** DESIGN_V2 "Map": panning clamped to India plus a 10% margin on every side. */
export const PAN_MARGIN_FRACTION = MAP_PAN_MARGIN_SHARE;
/** Zoom step for the + / − keys and buttons: d3-zoom's own double-click factor. */
export const ZOOM_STEP_FACTOR = 2;
/** d3-zoom's own double-click transition, turned to 0 under reduced motion. */
export const DBLCLICK_ZOOM_MS = 250;
/** DESIGN_V2 "Motion": presses scale to 0.97 over 160 ms. */
export const PRESS = { scale: PRESS_SCALE, ms: PRESS_MS } as const;
/** Arrow keys pan by this share of the visible map (one tenth, the margin above). */
export const KEY_PAN_FRACTION = PAN_MARGIN_FRACTION;

/** Appendix F: fly-to target zoom, path curvature and duration rule. */
export const FLY = {
  zoom: FLY_TARGET_K,
  rho: FLY_RHO,
  durationFactor: FLY_DURATION_FACTOR,
  minMs: FLY_MIN_MS,
  maxMs: FLY_MAX_MS,
} as const;

/** DESIGN_V2 "Motion", reduced motion: jump-cut with a 150 ms crossfade of the dots layer. */
export const REDUCED_CROSSFADE_MS = TOKEN_REDUCED_CROSSFADE_MS;

/** DESIGN_V2 "Motion", hover a mine: dot to 1.5 over 120 ms; tooltip 125 ms fade. */
export const HOVER = { scale: DOT_HOVER_SCALE, ms: DOT_HOVER_MS, tooltipFadeMs: TOOLTIP_FADE_MS } as const;

/** DESIGN_V2 "Motion", select: other dots fade to 45%, over the 320 ms of the panel slide they go with. */
export const SELECT = { dimOpacity: MAP_DIM_OPACITY, fadeMs: PANEL_SLIDE_MS } as const;

/** DESIGN_V2 tokens `--ease-out` and `--ease-drawer`, as control points. */
export const EASE_OUT = EASE_OUT_BEZIER;
export const EASE_DRAWER = EASE_DRAWER_BEZIER;

/** DESIGN_V2 "Map": labels for the 12 largest mines in view once k ≥ 4, Instrument Sans 11.5px. */
export const LABELS = {
  minZoom: MAP_LABEL_MIN_K,
  count: MAP_LABEL_COUNT,
  fontPx: 11.5,
  /** The selected mine's label, Newsreader italic: 15px as in V2-Mine-Open (`.moonl`). */
  selectedFontPx: 15,
  /** Gap between a dot's edge and its label, in px: the 4px base grid of DESIGN.md. */
  gapPx: 4,
  /** Height of a label's collision box: one 1.2 em line box. */
  lineHeightEm: 1.2,
  /** Baseline shift that centres a line of text on its dot (and a city label on its marker). */
  centreDyEm: 0.35,
  /** City labels sit this far from their marker, as in V2-Home. */
  cityGapEm: 0.6,
  /** Average glyph width, used to estimate label widths only where no canvas can measure them. */
  avgCharEm: 0.55,
  /** A paper halo a quarter em wide keeps labels legible over dots and smog. */
  haloEm: 0.25,
} as const;

/** DESIGN_V2 "Map": a coalfield-placed mine shows a hollow centre once zoomed in past k = 4. */
export const HOLLOW_MIN_ZOOM = MAP_HOLLOW_MIN_K;

/**
 * Dot sizes in map units at k = 1 (they are drawn at r / sqrt(k)).
 * Base radii are v1's (`src/components/map/geometry.ts` DOT_R, DESIGN.md "Map"). The selected dot and its ring keep
 * the ratios of V2-Mine-Open: dot 1.34 and ring 2.24 against 0.96 for an ordinary dot. DESIGN_V2 names a hollow
 * centre for coalfield-placed dots but gives no size, so it is half the dot's radius (a design choice of Step 3).
 */
export const DOT_SIZES = {
  operating: 3.1,
  closed: 2.3,
  nodate: 2.6,
  city: 2.4,
  selectedRatio: 1.34 / 0.96,
  ringRatio: 2.24 / 0.96,
  hollowRatio: 0.5,
  /** On phones the dots are drawn larger, as in V2-Phone (r 3.9 against 3.0 in V2-Home). */
  phoneScale: 3.9 / 3.0,
} as const;

/** v1 MineMap HIT_PX: a pointer within 9px of a dot hovers it. */
export const HIT_PX = 9;
/** v1 MapTooltip GAP_PX: gap between the dot and the tooltip. */
export const TOOLTIP_GAP_PX = 12;

/** PLAN_V2 Appendix E: scroll docking of the map into the mini-map card. */
export const DOCK = {
  ease: EASE_IN_OUT_DOCK_BEZIER,
  /** DESIGN_V2 `--mini-w` on desktop, and 120px on phones. */
  miniWidthPx: MINI_W_PX,
  phoneMiniWidthPx: MINI_W_PHONE_PX,
  /** Below this viewport width the phone layout applies (Step 6: phone is < 768px). */
  phoneMaxWidthPx: PHONE_MAX_W_PX,
  /** Final top-right corner of the card: (viewportW − right, top). */
  insetDesktop: { right: DOCK_MARGIN_RIGHT_PX, top: DOCK_MARGIN_TOP_PX },
  insetPhone: { right: DOCK_PHONE_MARGIN_PX, top: DOCK_PHONE_MARGIN_PX },
  radiusPx: DOCK_RADIUS_PX,
  shadowFrom: DOCK_SHADOW_AFTER_P,
  dockAt: DOCK_ENTER_P,
  undockBelow: DOCK_EXIT_P,
  reducedSwitchAt: DOCK_REDUCED_CROSSFADE_P,
  reducedFadeMs: TOKEN_REDUCED_CROSSFADE_MS,
  /** V2-Results mini card: border `--line` 1px, shadow 0 12px 32px rgba(26,25,22,.14). */
  shadow: { y: 12, blur: 32, alpha: 0.14 },
  borderPx: 1,
  /** Appendix E: the progress spring (applied by the caller, Step 6, with motion's useSpring). */
  spring: DOCK_SPRING,
} as const;

/**
 * The frozen clock for tests and screenshots: `?freeze=<seconds>`, read from the query string or from the hash's
 * query (`#/?freeze=0.6`, as `npm run shots -- --frames` writes it). Returns null when absent. One reader for the
 * whole app: `readFrozenSeconds` in `src/v2/motion/tokens.ts`.
 */
export const readFreezeSeconds = readFrozenSeconds;

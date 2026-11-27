/*
 * Map timings, easings and sizes. Every number cites its source (DESIGN_V2 "Map" and "Motion", PLAN_V2 Appendix E
 * and F, the approved mockups, or v1). Step 4 owns `src/v2/motion/tokens.ts`; once it merges, the timing constants
 * here should re-export from there (see the Step 3 PR, "Needs from other steps").
 */

/** DESIGN_V2 "Map": d3-zoom scale 1 to 24, relative to the fitted India view. */
export const ZOOM_EXTENT = [1, 24] as const;
/** DESIGN_V2 "Map": panning clamped to India plus a 10% margin on every side. */
export const PAN_MARGIN_FRACTION = 0.1;
/** Zoom step for the + / − keys and buttons: d3-zoom's own double-click factor. */
export const ZOOM_STEP_FACTOR = 2;
/** d3-zoom's own double-click transition, turned to 0 under reduced motion. */
export const DBLCLICK_ZOOM_MS = 250;
/** DESIGN_V2 "Motion": presses scale to 0.97 over 160 ms. */
export const PRESS = { scale: 0.97, ms: 160 } as const;
/** Arrow keys pan by this share of the visible map (one tenth, the margin above). */
export const KEY_PAN_FRACTION = PAN_MARGIN_FRACTION;

/** Appendix F: fly-to target zoom, path curvature and duration rule. */
export const FLY = {
  zoom: 6,
  rho: 1.2,
  durationFactor: 0.6,
  minMs: 500,
  maxMs: 900,
} as const;

/** DESIGN_V2 "Motion", reduced motion: jump-cut with a 150 ms crossfade of the dots layer. */
export const REDUCED_CROSSFADE_MS = 150;

/** DESIGN_V2 "Motion", hover a mine: dot to 1.5 over 120 ms; tooltip 125 ms fade. */
export const HOVER = { scale: 1.5, ms: 120, tooltipFadeMs: 125 } as const;

/** DESIGN_V2 "Motion", select: other dots fade to 45%, over the 320 ms of the panel slide they go with. */
export const SELECT = { dimOpacity: 0.45, fadeMs: 320 } as const;

/** DESIGN_V2 tokens `--ease-out` and `--ease-drawer`, as control points. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** DESIGN_V2 "Map": labels for the 12 largest mines in view once k ≥ 4, Instrument Sans 11.5px. */
export const LABELS = {
  minZoom: 4,
  count: 12,
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
export const HOLLOW_MIN_ZOOM = 4;

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
} as const;

/** v1 MineMap HIT_PX: a pointer within 9px of a dot hovers it. */
export const HIT_PX = 9;
/** v1 MapTooltip GAP_PX: gap between the dot and the tooltip. */
export const TOOLTIP_GAP_PX = 12;

/** PLAN_V2 Appendix E: scroll docking of the map into the mini-map card. */
export const DOCK = {
  ease: [0.77, 0, 0.175, 1] as const,
  /** DESIGN_V2 `--mini-w` on desktop, and 120px on phones. */
  miniWidthPx: 184,
  phoneMiniWidthPx: 120,
  /** Below this viewport width the phone layout applies (Step 6: phone is < 768px). */
  phoneMaxWidthPx: 768,
  /** Final top-right corner of the card: (viewportW − right, top). */
  insetDesktop: { right: 24, top: 16 },
  insetPhone: { right: 12, top: 12 },
  radiusPx: 16,
  shadowFrom: 0.9,
  dockAt: 0.98,
  undockBelow: 0.95,
  reducedSwitchAt: 0.5,
  reducedFadeMs: 150,
  /** V2-Results mini card: border `--line` 1px, shadow 0 12px 32px rgba(26,25,22,.14). */
  shadow: { y: 12, blur: 32, alpha: 0.14 },
  borderPx: 1,
  /** Appendix E: the progress spring (applied by the caller, Step 6, with motion's useSpring). */
  spring: { stiffness: 300, damping: 40, mass: 1 },
} as const;

/**
 * The frozen clock for tests and screenshots: `?freeze=<seconds>`, read from the query string or from the hash's
 * query (`#/?freeze=0.6`, as `npm run shots -- --frames` writes it). Returns null when absent.
 */
export function readFreezeSeconds(loc: Pick<Location, 'search' | 'hash'> | undefined = globalThis.location): number | null {
  if (!loc) return null;
  const fromSearch = new URLSearchParams(loc.search).get('freeze');
  const hashQuery = loc.hash.includes('?') ? loc.hash.slice(loc.hash.indexOf('?') + 1) : '';
  const raw = fromSearch ?? new URLSearchParams(hashQuery).get('freeze');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

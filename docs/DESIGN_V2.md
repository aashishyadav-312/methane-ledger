# Methane Ledger v2 design spec (approved 27 Nov 2026)

v2 keeps v1's look (`docs/DESIGN.md`: paper and ink, Newsreader / Instrument Sans / IBM Plex Mono, the closure-band
colours). This file adds only what is new. The approved mockups are in `design/v2/*.dc.html`; port their structure,
spacing and copy, not their template syntax.

| Artboard | What it shows |
|---|---|
| `V2-Home.dc.html` | Full-screen map, headline, search with results open, compact legend, zoom controls |
| `V2-Mine-Open.dc.html` | A mine chosen: map zoomed and shifted left, inputs panel (460px) on the right, result peek, scroll cue |
| `V2-Results.dc.html` | Scrolled: results cover the map; the map docked as a 184px card at top right; five charts |
| `V2-Phone.dc.html` | Phone: map, search, bottom sheet |
| `V2-Nav-About.dc.html` | Nav: Map, Data, About; About opens Compare, Method, Assumptions, Sources |

Changes from the mockups, by decision of 27 Nov:

- The nav is **Map, Data, About**. Compare moves into the About menu, above Method.
- The India boundary is drawn in **ink** (`--ink`, 1.1px, non-scaling) for contrast, not the grey edge of v1.
- The smog rises **from the mines** as a live animation (below), not as static haze blobs.

## New tokens (add to `src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--boundary` | #1A1916 | India outline, 1.1px, `vector-effect: non-scaling-stroke` |
| `--state-line` | #CFC7B4 | Coal-state borders, 0.5px non-scaling |
| `--smog` | 110, 101, 86 | RGB of smog particles (used as `rgba(var(--smog), a)`), never blue or purple |
| `--smog-max-alpha` | 0.10 | Highest alpha of any single particle |
| `--glass` | rgba(251, 250, 246, 0.84) | Floating controls over the map, with `backdrop-filter: blur(14px)` |
| `--panel-w` | 460px | Mine panel width on desktop |
| `--mini-w` | 184px | Docked mini-map card width |
| `--ease-out` | cubic-bezier(.23, 1, .32, 1) | Entrances, presses |
| `--ease-drawer` | cubic-bezier(.32, .72, 0, 1) | Panel and sheet slides |
| `--z-map` 0, `--z-smog` 1, `--z-ui` 10, `--z-panel` 20, `--z-sheet` 30, `--z-mini` 40, `--z-menu` 50 | | Layers |

Reduced transparency: `--glass` becomes solid `--card`. Reduced motion: see below.

## Motion (the approved feel: calm, physical, one moment at a time)

Principles from apple-design and emil-design-eng:

- Transform and opacity only.
- Every gesture is interruptible and starts from the current on-screen value.
- Nothing animates from scale 0.
- Presses scale to 0.97 over 160ms.
- Keyboard actions never animate.

From huashu-art-motion:

- Design one still frame first, then make it move.
- The picture is always quietly alive.
- One palette across the whole film; no blue-purple.
- A test of the frame is a still, not a video.

| Moment | Spec |
|---|---|
| **Page load** (the one orchestrated sequence) | Map fades in over 600ms (opacity 0 to 1, scale 0.985 to 1, `--ease-out`). The smog starts at 0 particles and fills over 2.5s. The headline and search fade in 120ms after the map. Nothing else animates on load. |
| **Hover a mine** | Dot scales to 1.5 (120ms). Tooltip appears with no delay after the first one, 125ms fade, origin at the dot. |
| **Select a mine** (click, Enter in search) | Fly-to with `d3.interpolateZoom` (van Wijk smooth zoom, rho 1.2), 500 to 900ms by distance, centring the mine in the area left of the panel, at zoom k = 6. A single ripple ring goes out from the mine (r 0 to 28px, opacity 0.5 to 0, 700ms, once). The panel slides in from the right (translateX 100% to 0, 320ms, `--ease-drawer`). Other mines' dots fade to 45%. |
| **Run the model** | The button shows a 2px progress underline for the real compute time (usually under 50ms, so it looks instant). The results section appears below the fold. The headline number counts up once from 0 over 600ms (skipped if under 300ms since the last run). The scroll cue pill rises 8px into view. |
| **Scroll to the results** | The results sheet (rounded 24px top corners, shadow up) scrolls over the map naturally. The map container follows scroll progress p (Appendix E of PLAN_V2): it scales down and travels to the top-right corner until it exactly matches the 184px mini-map card. At p ≥ 0.98 the card's border and shadow fade in (120ms). Scrolling up reverses it exactly; it is scroll-linked, never time-based. A spring smooths p (stiffness 300, damping 40) so trackpad jitter never shows. |
| **Charts in the results** | Each chart draws once when 40% of it is on screen: lines by stroke-dashoffset (700ms), bars grow from their baseline (500ms, 30ms stagger, at most 10 bars staggered). Re-running the model morphs values in place (200ms), with no redraw from zero. |
| **Close the panel** | The reverse of select, along the same path: panel out to the right, the map zooms back to the previous view. |

**Reduced motion:**

- No fly-to: jump-cut with a 150ms crossfade.
- No ripple, no count-up, no chart draw-ins.
- The scroll docking becomes a crossfade at p = 0.5.
- The smog renders one still frame (seed fixed, t = 8s) and does not move.

## The smog (live, from the mines)

The smog shows where methane comes from. Each operating mine is an emitter; closed mines give off faint wisps (abandoned mine methane). It is a single canvas layer between the land and the dots.

| Element | Spec |
|---|---|
| **Emitter strength** | s = log10(1 + methane Mm³ a year) normalised to 0 to 1 across mines. Methane comes from the mine's estimate (PLAN_V2 Appendix B); opencast and Degree I mines get the floor (0.08). Closed mines get 0.05. |
| **Particle** | A pre-rendered soft disc (radial gradient sprite, 64px, drawn once). Size grows 4 to 22px over its life (ease-out). Alpha follows `maxAlpha × sin(π × age / life)`, with maxAlpha 0.04 to 0.10 by emitter strength. Life 4 to 9s. |
| **Motion** | Rises 8 to 14 px a second in screen space. Curl-noise drift (2D simplex, frequency 0.004, speed 0.15), plus a steady wind of 3 px a second toward the east-north-east, as over the Indian plains in the dry season. Particles never move faster than 20 px a second. |
| **Overview mode** (home) | Spawn rate 0.6 particles a second × strength. Visible as a thin warm haze over the coal belt, thicker over Jharia and Raniganj. |
| **Focus mode** (a mine selected) | The selected mine's rate goes ×5 and its particles keep 1.3× alpha, so it reads as a small, concentrated plume. Every other mine goes ×0.3. The change eases over 600ms. |
| **Docked mode** (results) | Only the selected mine emits, at a size scaled to the mini map (particles 2 to 8px). A small plume stays alive in the corner card. |
| **Budget** | At most 700 live particles on desktop and 220 on phones. Device pixel ratio capped at 1.5. Pauses when the tab is hidden or the map is off screen (IntersectionObserver). Target 60 fps; if a frame takes over 20ms three times in a row, halve the spawn rate. |
| **Determinism** | A seeded random generator and an injectable clock (`smog.setClock(fn)`), so tests and screenshots are repeatable (`?freeze=8` renders the frame at t = 8s and stops). |

## Map

- **Zoom and pan:** d3-zoom on the map group, scale 1 to 24, panning clamped to India plus a 10% margin. Wheel, pinch, double-click and keyboard (+ / − / 0, arrows pan) all work.
- **Dots** are drawn with a radius of r / sqrt(k), so they grow only gently as you zoom in. The band colours are as in v1.
- **Labels:** at k ≥ 4 the names of the 12 largest mines in view appear (Instrument Sans 11.5px, ink-2, collision-avoided). The selected mine is always labelled in Newsreader italic.
- **Positions:** a mine with Global Coal Mine Tracker coordinates is drawn there; others stay at their coalfield point, with a hollow centre dot when zoomed in past k = 4 and the tooltip line "Approximate position".
- **Floating controls** (search, legend, zoom buttons) sit on `--glass` and never cover the selected mine: the fly-to centre accounts for the panel.

## Search

- **Box:** 56px tall, 440px wide on desktop, full width on phones. "/" focuses it. Esc clears it, then closes the results.
- **Results:** the top 8 matches. Each row shows a band dot, the name with the matched text in semibold, "company, state, type", and "runs out YYYY". ↑↓ move through the list, Enter selects.
- **Ranking:** PLAN_V2 Appendix G. Under the box: "4 of 311". With no match: "No mine matches 'xyz'. Try a company or state."

## Copy

Sentence case everywhere. No all-caps labels, no "→" in buttons, no middle-dot strings in new copy. Spell out acronyms on first use per view. Estimated inputs always carry the tag "Estimated inputs" (amber); a mine with a measured record shows "Illustrative inputs" until the real data arrives.

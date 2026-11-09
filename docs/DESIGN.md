# Methane Ledger design spec (approved 8 Nov 2026)

The approved look lives in four artboards in `design/` (Main, Moonidih, Landing-Mobile, Style). They are mockups
written in a design-canvas format (`<x-dc>`, `{{holes}}`, `<sc-for>`), not app code. Copy their markup, spacing and
styles. Do not copy their template syntax or runtime. Every token below goes into `src/styles/tokens.css` as a CSS
custom property, and components use only the tokens, never raw hex values.

## Look

A survey map printed on warm paper. Paper and ink stay quiet so the closure colours carry the map. The display serif
is for the questions people ask, a plain sans is for controls, and every number is set in a monospaced face.

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--paper` | #F4F1E9 | Page ground |
| `--card` | #FBFAF6 | Cards, panels, pin card |
| `--ink` | #1A1916 | Text, primary button, strong borders |
| `--ink-2` | #4F4B44 | Secondary text |
| `--ink-3` | #6B665D | Tertiary text, axis labels (5.05:1 on paper) |
| `--eyebrow` | #9A3322 | Eyebrows ("Start here", section kickers) |
| `--line` | #DDD7CA | Hairlines, card borders |
| `--line-soft` | #E7E2D6 | Dividers inside cards |
| `--track` | #EDE8DC | Segmented-control track |
| `--line-strong` | #CFC7B4 | Secondary button and chip borders, slider track |
| `--land` | #E8E3D6 | India land fill |
| `--land-coal` | #DFD7C4 | Coal-state fill (state lines in `--paper`, 1.2) |
| `--land-edge` | #C9C0AB | Coastline and border stroke (0.9) |
| `--lens` | #E2DACA | Inset lens fill |
| `--band-2031` | #C0412B | Closing by 2031 |
| `--band-2036` | #DC8A32 | 2032 to 2036 |
| `--band-2050` | #D7B23E | 2037 to 2050 |
| `--band-after` | #2F6B46 | After 2050 |
| `--band-closed` | #A29D91 | Already closed (opacity 0.55 on the map) |
| `--band-nodate` | #8D877B | No date: hollow ring, 1px stroke, paper fill |
| `--stream-drained` | #22405F | Drained gas |
| `--stream-vam` | #86A5C2 | Ventilation air |
| `--stream-amm` | #B98E52 | After closure |
| `--ok-bg` / `--ok-fg` | #E3EEE5 / #24563A | "Covered at $X" pill |
| `--short-bg` / `--short-fg` | #F6E0DA / #9A3322 | "Short by $X a tonne" pill |
| `--tag-bg` / `--tag-fg` | #F6E7C4 / #8A5A00 | Dummy and illustrative tags |
| `--est-bg` / `--est-fg` | #EDE8DC / #4F4B44 | Estimated quality tag |
| `--lit-bg` / `--lit-fg` | #E3EAF2 / #22405F | Literature quality tag |
| `--range` | #2F6B46 | The price range that covers the project on the ruler |

Contrast has been checked: ink 15.6:1, ink-2 7.7:1, ink-3 5.05:1, eyebrow 6.5:1 and tag-fg 4.8:1 on its tag. Band
colours are never the only signal; a label always sits beside them.

## Type

Fonts are loaded from Google Fonts in `index.html` with `display=swap`: Newsreader (opsz, 400 to 600, italic), Instrument
Sans (400 to 600) and IBM Plex Mono (400, 500).

| Role | Spec |
|---|---|
| Landing H1 | Newsreader 450, 58px, line-height 1.02, tracking −0.025em (phone 40px) |
| Mine title | Newsreader 450, 64px, line-height 1, tracking −0.03em |
| Section H2 | Newsreader 450, 36px, line-height 1.1, tracking −0.02em (phone 28px) |
| Headline number | Newsreader 420, 96px, line-height 0.95, tracking −0.035em, `tabular-nums lining-nums` |
| Lede | Instrument Sans 18px, line-height 1.55, ink-2 |
| Body | Instrument Sans 16px, line-height 1.5 |
| Label | Instrument Sans 14px, 600 |
| Caps | Instrument Sans 12px, 600, 0.08em, uppercase, ink-3 |
| Figures | IBM Plex Mono 500, 24px, tracking −0.02em (tiles); 11 to 15px elsewhere |

## Shape, space, depth

- The content has a 1320px max width with 40px side padding on desktop and 16 to 20px on phones.
- Radii: cards 16px, inner tiles 14px, segmented track 10px with 8px segments, pills and buttons 999px.
- Shadows: the pin card uses `0 6px 20px rgba(26,25,22,.12)` (`.16` on hover); the active segment uses
  `0 1px 2px rgba(26,25,22,.14)`.
- Targets are at least 44px. Primary buttons are 48px high, chips 32px, segments 38px.

## Motion

- Easing everywhere: `cubic-bezier(.23,1,.32,1)`.
- Press: scale 0.97 over 160ms.
- Values, bars and markers settle over 200ms, animating only transform, opacity or height for bars.
- Only the start mine pulses: a ring scaling 0.6 to 2.2 with opacity 0.55 to 0, over 2.4s.
- Under `prefers-reduced-motion`: no pulse (a static ring at opacity 0.35), no transitions.

## Map

- **ViewBox and projection.** The viewBox is 906 × 1016. The projection is equirectangular around 22°N:
  x = (lon − 68) × cos(22°) × 33 and y = (37.2 − lat) × 33.
- **Dots:**
  - operating mine: r 3.1, fill is its band colour, 0.8 paper stroke
  - closed mine: r 2.3, opacity 0.55
  - no date: r 2.6, hollow
  - start mine: r 4.6 on the map, with an HTML pin over it (44px target, pulse, ink ring, card to the right)
- **Draw order:** closed, no date, after 2050, 2037–2050, 2032–2036, by 2031, then the start mine.
- **Lens.** The window [x 548, y 435.5, w 26, h 19] around the Jharia coalfield is redrawn in the Bay of Bengal at
  x 612, y 596, width 232 (scale 8.9), with ink leader lines and the label "Jharia coalfield, 9× closer". Moonidih
  sits inside it, ringed and labelled in Newsreader italic.
- **City labels** (Instrument Sans 500, 11.5px, ink-3, with a dot of r 2.6):
  - New Delhi 28.61, 77.21 (label east)
  - Mumbai 19.08, 72.88 (east)
  - Kolkata 22.57, 88.36 (east)
  - Ranchi 23.34, 85.31 (west)
  - Nagpur 21.15, 79.09 (west)
- **Positions are approximate.** Mines sit at coalfield centroids plus a fixed jitter, and the page says so.

## Copy rules

- Write for a mine planner, not a carbon trader: "credit price needed to break even", never "LCOA".
- Use plain words and short sentences. No em dashes, no hype, no emoji. Spell out every acronym on first use on each
  page.
- Never imply Coal India can sell into California or the EU. Those prices always carry "Benchmark only".
- Results are indicative, at pre-feasibility level, and not investment advice. The Method page and the footer say so.
- Every number in copy is built from data (template plus values). Nothing is typed by hand.

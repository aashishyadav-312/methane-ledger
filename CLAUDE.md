# Methane Ledger: rules for Claude Code

Methane Ledger is a static website (Vite, React, TypeScript, GitHub Pages). It shows every Coal India mine on a map
coloured by expected closure, and models whether carbon credits can pay for methane abatement at a mine, starting with
Moonidih (BCCL).

- The plan is `docs/PLAN_V1.md`. Do only the step you were given, and follow its Global rules.
- `docs/SPEC_V1.md` is the full spec. Read only the sections your step names. Where it disagrees with PLAN_V1, the
  plan wins: the landing page is the map, not the supply curve.
- `docs/DESIGN.md` holds the approved tokens, type, motion and copy rules. `design/*.dc.html` are approved mockups.
  They are reference only, not app code.
- `reference/` (Python) and `tests/golden/` are the source of truth for the model. Never edit them to make a test pass.
- `data/raw/` holds the original source files, read only, and only the Step 1 pipeline reads them.
- `src/model/` imports nothing from React or the browser. Put units in names. No hidden constants.
- No new dependencies. Do not merge PRs. Do not push to `main`.
- Commands: `npm run check` (all gates), `npx vitest run <path>`, `npx playwright test e2e/<file>`,
  `npm run shots -- --step N --only a,b`, `npm run golden:check`, `npm run data`.

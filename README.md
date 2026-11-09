# Methane Ledger

Which closing Coal India mines can pay for their own methane abatement with carbon credits? This is a static website
(Vite, React, TypeScript, GitHub Pages). It shows every Coal India mine on a map coloured by expected closure, and
models whether carbon credits can pay for methane abatement at a mine, starting with Moonidih (BCCL).

## Commands

```bash
npm ci               # install exact dependencies (Node version in .nvmrc)
npm run dev          # local dev server
npm run check        # typecheck, lint, unit tests, build
npm run e2e          # Playwright end-to-end tests (chromium)
npm run golden:check # regenerate the Python reference goldens and confirm they are unchanged
npm run py:setup     # create .venv for the data pipeline (openpyxl, shapely)
```

## Plan

The build plan is `docs/PLAN_V1.md`, and the full spec is `docs/SPEC_V1.md`. Design tokens and copy rules are in
`docs/DESIGN.md`. Before the first deploy, set Settings > Pages > Source to "GitHub Actions".

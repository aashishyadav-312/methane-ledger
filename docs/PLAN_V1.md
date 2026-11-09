# Methane Ledger v1 build plan

This plan builds Methane Ledger from an empty GitHub repository to a live v1 site on GitHub Pages. The site has a
map of every Coal India mine coloured by when it is expected to close, and a working methane-credit model for
Moonidih. Target: live by 10 January 2027, ahead of the Ranchi workshop on 22 January.

## How to use this file

1. Create an empty GitHub repo called `methane-ledger` (public, so Pages is free). Clone it to your computer and unzip
   the starter kit into it. Commit the kit as the first commit on `main` and push.
2. For each step, open Claude Code in the repo and set the model and effort named in the step. Then paste:
   `Read docs/PLAN_V1.md: the Global rules, then Step N. Do Step N only.`
3. Every step works on its own branch and ends with a pull request (PR). You review and merge. Claude Code never
   merges.
4. Steps in the same **wave** touch different files, so they can run at the same time in separate worktrees. Waves 1,
   2 and 3 are meant to run overnight (see "Overnight runs" below).

| Step | What | Model | Effort | Wave |
|---|---|---|---|---|
| 0 | Scaffold, tooling, CI, Pages deploy | Sonnet 5.5 | medium | 0 (with you) |
| 1 | Mine data pipeline: workbook and map to JSON | Sonnet 5.5 | high | 1 (overnight) |
| 2 | Core model port to TypeScript, golden tests | Opus 5.5 | high | 1 (overnight) |
| 3 | Data layer: schemas and data files | Sonnet 5.5 | high | 1 (overnight) |
| 4 | Design system and app shell | Sonnet 5.5 | high | 1 (overnight) |
| 5 | Map landing page | Opus 5.5 | high | 2 (overnight) |
| 6 | Mine page: Moonidih model view | Opus 5.5 | high | 2 (overnight) |
| 7 | Financing structures, waterfall, tornado (model only) | Sonnet 5.5 | high | 2 (overnight) |
| 8 | Mine page: finance switch, more charts, explain, export | Opus 5.5 | high | 3 (overnight) |
| 9 | Method, Assumptions and Sources pages | Sonnet 5.5 | medium | 3 (overnight) |
| 10 | Compare (supply curve) and Data upload pages | Sonnet 5.5 | high | 3 (overnight) |
| 11 | QA, accessibility, performance, release | Sonnet 5.5 | high | 4 (with you) |
| 13a | Cost build-up in the model (run before 12) | Sonnet 5.5 | high | 4 (overnight) |
| 13b | "All assumptions" panel and cost tables | Opus 5.5 | high | 4 (overnight) |
| 12 | Real data from CMPDI and Coal India (when it arrives) | Opus 5.5 | high | later |
| Review | Review any PR in a fresh session, diff only | Opus 5.5 | medium | any time |
| Fix-up | Resolve merge conflicts or a failed CI run | Sonnet 5.5 | medium | any time |

Dependencies:

- Step 0 comes before everything.
- Wave 1 (Steps 1 to 4) needs Step 0 merged.
- Wave 2 needs all of wave 1 merged: Step 5 uses 1 and 4; Step 6 uses 2, 3 and 4; Step 7 uses 2 and 3.
- Wave 3 needs wave 2 merged.
- Step 11 needs everything merged.
- Wave 4 (Steps 13a and 13b, in parallel) runs after Step 11 and before Step 12, since it doesn't need real data.
  13b codes against the Appendix G names, so both can run on the same night.

Suggested calendar:

| When | What |
|---|---|
| Week of 9 Nov | Step 0, night 1 |
| Week of 16 Nov | Review and merge wave 1, night 2 |
| Week of 23 Nov | Night 3 |
| Week of 30 Nov | Step 11, then a walk-through with Sandeep |
| December | Buffer, then Step 12 when CMPDI data arrives |

## Overnight runs

Background sessions keep running after you close the terminal while the computer stays awake. On a laptop, stop it
sleeping first: on macOS run `caffeinate -dimsu` in a spare terminal, and keep the lid open or plug in an external
display.

Night 1, after Step 0 is merged (run from the repo root on an up-to-date `main`):

```bash
git switch main && git pull
P='Read docs/PLAN_V1.md: the Global rules, then Step'
claude --bg -w step-1 -n step-1 --model sonnet --effort high --permission-mode auto "$P 1. Do Step 1 only."
claude --bg -w step-2 -n step-2 --model opus   --effort high --permission-mode auto "$P 2. Do Step 2 only."
claude --bg -w step-3 -n step-3 --model sonnet --effort high --permission-mode auto "$P 3. Do Step 3 only."
claude --bg -w step-4 -n step-4 --model sonnet --effort high --permission-mode auto "$P 4. Do Step 4 only."
claude agents    # optional: watch them; any session that is waiting on you shows here
```

Night 2 runs Steps 5 (opus), 6 (opus) and 7 (sonnet). Night 3 runs Steps 8 (opus), 9 (sonnet, effort medium) and 10
(sonnet). Night 4 runs Steps 13a (sonnet) and 13b (opus). Use the same pattern, with the model and effort from the table.

In the morning:

1. Run `claude agents` (or `gh pr list`) to see which steps finished.
2. Read each PR's report.
3. Merge in step order.
4. If a later PR then conflicts, run the Fix-up prompt on its branch:
   `Rebase step/N onto origin/main, resolve conflicts keeping both sides' intent, run npm test, push.`

`.claude/settings.json` (in the starter kit) pre-approves the commands steps need: tests, build, git on `step/*`
branches, and `gh pr create`. It blocks force-push, pushes to `main`, `gh pr merge` and `rm -rf`. Auto mode reviews
everything else. If a session stops on a question, answer it in the morning with
`claude -r step-N "<your answer>"`.

---

## Global rules (every step)

**Scope and reading (saves tokens)**

1. `CLAUDE.md` loads automatically. Read only the Global rules, your own step, and the appendix sections your step
   names. Do not read other steps.
2. Do not read `docs/SPEC_V1.md` in full. When your step names a section, find it with `rg -n '^### 9' docs/SPEC_V1.md`
   and read only those lines with offset and limit.
3. Never open `data/raw/*.xlsx` or the PDF except in Step 1. Never print generated JSON in full: use
   `jq 'keys'`, `jq length` or `head -c 600`.
4. Use `rg` and targeted reads, not whole-directory reads. Do not re-read a file you just wrote.
5. Do not spawn subagents. Do not run web searches. If a fact is missing, stop and ask in the PR.

**Ownership (keeps parallel steps conflict-free)**

6. Edit only the paths your step owns (listed in each step). If you need a change elsewhere, do not make it. Write it
   under "Needs from other steps" in the PR. The exception is new files inside your own folders.
7. No new npm dependencies after Step 0. If one seems necessary, stop and ask.
8. `src/model/types.ts` is the contract between steps. Only Steps 2 and 13a may edit it, and only by adding optional
   fields.

**Correctness**

9. Never change a file in `tests/golden/` or `reference/` to make a test pass. A golden test that fails means the
   TypeScript is wrong.
10. Units in names (`ch4Mm3`, `capexUsd`, `priceUsdPerT`). No hidden constants: every number comes from `data/` or
    `src/model/constants.ts`, with a source.
11. No hardcoded result numbers in JSX or copy. Sentences with numbers are built from computed values (template plus
    values). Before the PR, run `rg -n '[0-9]+\.[0-9]+' src/pages src/components | rg -v test` and justify or remove
    each new hit.
12. Copy follows `docs/DESIGN.md` › Copy rules. No em dashes, no emoji.

**Speed and cost**

13. While working, run only the tests you touched: `npx vitest run <path>`. Before the PR, run `npm run check`
    (typecheck, lint, all unit tests, build) exactly once.
14. Playwright end-to-end tests run only in Steps 5, 6, 8, 10 and 11, and only that step's spec files:
    `npx playwright test e2e/<file>`.
15. Screenshots: one batched run at the end with `npm run shots -- --step N --only <names>` (names come from
    `scripts/shots.config.json`). View at most 6 images per step. Re-shoot at most once, and only the views you fixed.
    Viewports are 1440×900 and 390×844 at device scale 1. Do not look at screenshots while still building.
16. Never leave a dev server or watcher running. `npm run shots` builds, serves and stops by itself.
17. Wrap any command that could run long in `timeout 300`. If it times out, or the same failure survives 3 fix
    attempts, stop and write up what you found in the PR as "Blocked".
18. Commit in small steps with messages like `feat(map): ...`. Keep console output short (`| tail -20`).

**Finish**

19. Start each step with `git fetch origin && git switch -c step/N-<slug> origin/main`. In a worktree, rename the
    worktree's branch to that name instead.
20. Push and open the PR with `gh pr create --fill --base main`.
21. The PR body follows the template in `.github/pull_request_template.md`:
    - what changed
    - "Done when" checks with pass or fail
    - test counts
    - screenshot paths (not the images)
    - "Needs from other steps"
    - anything not done
22. Your final message is at most 15 lines. Stop after the PR. Do not merge.

---

## Step 0: scaffold, tooling, CI and Pages deploy

**Model: Sonnet 5.5 · Effort: medium · Run with you watching (about 20 minutes)**
Branch: `step/0-scaffold`.
Owns: everything except `docs/`, `data/raw/`, `data/geo/`, `reference/`, `tests/golden/` and `design/` (those come
from the starter kit and stay as they are).

1. Vite, React and TypeScript (strict) app at the repo root. In `vite.config.ts`, set `base: '/methane-ledger/'`.
   Node: write the version you have into `.nvmrc` (22 or newer).
2. Install the full v1 dependency set now, pinned exact (`npm install --save-exact`), so later steps never install
   anything:
   - runtime: `react react-dom zod papaparse d3-scale d3-shape d3-array`
   - dev: `typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event
     @playwright/test eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier @types/react
     @types/react-dom @types/papaparse @types/d3-scale @types/d3-shape @types/d3-array @vitest/coverage-v8`
   Then run `npx playwright install chromium` once.
3. Python for the data pipeline: write `scripts/requirements.txt` with `openpyxl` and `shapely`. Add a
   `npm run py:setup` script that runs `python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt`,
   and run it.
4. Add `package.json` scripts:
   - `dev`, `build`, `preview`
   - `typecheck` (`tsc -b --noEmit`), `lint`
   - `test` (`vitest run`), `e2e` (`playwright test`)
   - `check` (typecheck, lint, test, build in that order)
   - `data` (`.venv/bin/python scripts/data/build_data.py`)
   - `golden` (`python3 reference/ref_v1.py`; standard library only)
   - `golden:check` (runs golden, then `git diff --exit-code tests/golden`)
   - `shots` (`node scripts/shots.mjs`)
5. Create the folder skeleton with stub files, so parallel steps only fill their own files. A stub exports a
   placeholder component or `export {}`.
   - `src/main.tsx`, `src/app/App.tsx` (renders "Methane Ledger" only)
   - `src/model/` (`types.ts` from Appendix C verbatim, plus `constants.ts`, `index.ts`)
   - `src/data/`, `src/generated/`, `src/state/`
   - `src/styles/`, `src/ui/`, `src/lib/`
   - `src/pages/{MapPage,MinePage,ComparePage,MethodPage,AssumptionsPage,SourcesPage,DataPage}/index.tsx`
   - `src/components/{map,charts,inputs}/`
   - `tests/{model,data,datalayer,ui}/`, `e2e/`
   - `src/generated/mines_map.json` and `src/generated/closure_timeline.json` as valid placeholders in the Appendix D
     shapes, holding only the Moonidih entry and zero counts. Step 1 overwrites them, and Step 3 can build against
     them in the meantime.
6. `scripts/shots.mjs` and `scripts/shots.config.json`:
   - It builds once, starts `vite preview` on a free port, and opens Chromium with Playwright.
   - It captures each named view at its viewport at device scale 1 into `shots/step-N/<name>.png` (gitignored),
     then closes the server.
   - Options: `--only a,b` and `--step N`.
   - Config entries look like `{ "name": "map-1440", "path": "#/", "w": 1440, "h": 900, "fullPage": false }`. Seed it
     with `map-1440`, `map-390`, `mine-1440`, `mine-390`, `ui-1440`, `method-1440`, `compare-1440`, `data-1440`.
7. Testing setup:
   - Vitest with a jsdom environment for `tests/ui/`, node for the rest.
   - Playwright config: chromium only, `webServer` set to `npm run preview`, `baseURL` with the `/methane-ledger/`
     base.
   - One smoke test each: `tests/model/smoke.test.ts` (2+2) and `e2e/smoke.spec.ts` (page title).
8. CI in `.github/workflows/`:
   - `ci.yml` on pull requests: `npm ci`, `npm run check`, then `npx playwright install --with-deps chromium` and
     `npm run e2e`. Set up Python and run `npm run golden:check`.
   - `deploy.yml` on push to `main`: build, then deploy to GitHub Pages with `actions/upload-pages-artifact` and
     `actions/deploy-pages`.
   - Tell me to set Settings › Pages › Source to "GitHub Actions".
9. Add `.github/pull_request_template.md` with the sections from Global rule 21. Add `.gitignore` covering
   `node_modules`, `dist`, `.venv`, `__pycache__/`, `shots/`, `playwright-report/`, `test-results/` and
   `.claude/worktrees/`.
10. Add `"Bash(npm install *)"` and `"Bash(npm i *)"` to the deny list in `.claude/settings.json`, so no later step
    installs packages.
11. Write the README: what the site is, `npm ci`, `npm run dev`, `npm run check`, and a pointer to this plan.

Done when:

- `npm run check` and `npm run e2e` pass locally.
- `npm run golden:check` passes (the goldens shipped in the kit reproduce exactly).
- `npm run shots -- --step 0 --only map-1440` writes one PNG.
- After merge, the empty site is live at `https://<user>.github.io/methane-ledger/`.

---

## Step 1: mine data pipeline (workbook and map to JSON)

**Model: Sonnet 5.5 · Effort: high · Wave 1 (overnight)**
Branch: `step/1-data`.
Owns: `scripts/data/**`, `src/generated/**`, `tests/data/**`.
Reads: Appendix A and Appendix D, `scripts/reference/build_map_mock.py`, `data/raw/README.md`.

Goal: one Python script turns the raw files into two small JSON files the site imports. Run it once. The generated
JSON is committed, so the site build never needs Python.

1. Write `scripts/data/build_data.py`, ported from `scripts/reference/build_map_mock.py` (keep its projection, coalfield
   clusters, keyword rules and md5 jitter exactly), with these changes:
   - **Source of operating mines.** Use sheet `Mine Closure Timeline` of
     `data/raw/CIL_Mine_Closure_Timeline_v5.xlsx` (rows 7 to 317, header row 6). Load it with
     `openpyxl.load_workbook(..., data_only=True)`; the cached formula values are present. If a needed cached value
     is `None` where a formula exists, fail with: "Open the workbook in Excel, recalculate, save, and rerun."
   - **Columns** (0-based index): 0 ID, 1 Company, 2 Mine name, 3 State, 4 Type, 5 Reserve 31 Mar 2024, 6 Output
     FY23-24, 7 Output FY24-25, 8 Output FY25-26, 9 Target FY26-27, 10 Output FY26-27 to 10 Oct, 11 Reserve left
     31 Mar 2026, 12 Reserve left 10 Oct 2026, 13 Output rate used, 14 Years left, 15 Run-out date, 16 Year (int or
     "After 2225"), 17 Closure window, 18 Status, 19 Year at FY26-27 target, 20 EC capacity, 21 Year at EC capacity,
     22 Output as share of EC, 23 Portal units, 24 Note.
   - **ID** is the slug of `company + " " + name`: lower case, each run of non-alphanumerics becomes `-`, trimmed.
     Moonidih must come out as `bccl-moonidih`. Fail on duplicate IDs.
   - **Band** from Appendix A, computed from column 16 and Status. Do not use column 17 (it has different windows).
   - **Positions**: coalfield centroid plus jitter, as the mock does. Moonidih is pinned at 23.735°N, 86.335°E.
   - **Closed mines**: the CIL rows of Annexure II in `data/raw/LokSabha_AU4259_annexures.txt` (the mock's regex,
     which is already correct).
   - **Geography**: read `data/geo/india_outline.geojson` and `data/geo/coal_states.geojson` (already simplified).
     Simplify again at tolerance 0.02° and drop rings under 0.02 square degrees. Write SVG path strings with one
     decimal place.
   - Add cities and the lens settings from `docs/DESIGN.md` › Map.
2. Outputs, schemas in Appendix D:
   - `src/generated/mines_map.json` (target under 150 kB)
   - `src/generated/closure_timeline.json`
   Both carry `generatedAt`, `sources` and `note` ("Positions approximate; placed by coalfield. Closure year = reserve
   run-out at FY2025-26 output.").
3. Add `tests/data/test_build_data.py`, using `unittest` (nothing to install). Run it with
   `.venv/bin/python -m unittest discover -s tests/data`. Checks:
   - 311 operating mines, all IDs unique.
   - Band counts exactly: `by2031` 55, `by2036` 25, `by2050` 44, `after2050` 142, `nodate` 45.
   - 315 closed mines.
   - Moonidih: run-out 2034, band `by2036`, year at FY26-27 target 2030, x 561.0 ± 0.5, y 444.3 ± 0.5.
   - Every x in 0 to 906 and every y in 0 to 1016. Tikak Colliery carries its data-quality note.
4. Add `tests/data/generated.test.ts` (Vitest), which checks the same counts from the JSON, so CI checks it without
   Python.
5. Wire `npm run data`. Run it once and commit the outputs.

Done when: both test files pass, the JSON sizes are reported in the PR, and `npm run data` is idempotent (a second run
gives no git diff apart from `generatedAt`; leave `generatedAt` out of the diff check).

---

## Step 2: core model port to TypeScript, with golden tests

**Model: Opus 5.5 · Effort: high · Wave 1 (overnight)**
Branch: `step/2-model`.
Owns: `src/model/**` (except: add-only changes to `types.ts`), `tests/model/**`.
Reads: Appendix B (sections B1 to B6), Appendix C, `reference/cmm_model.py`, `reference/ref_v1.py` (only `irr`,
`moonidih_case`, `flows`, `breakeven`), and `tests/golden/{moonidih_v1,moonidih_wb2034,sensitivities_v1,archetypes_v1,physics_v1}.json`.
Optional: SPEC_V1 §1 to §9, for wording only.

Goal: a pure TypeScript model that reproduces the Python reference.

1. Files in `src/model/`:
   - `constants.ts`: density, LHV, combustion CO2, GWP options, each with a source comment.
   - `timeline.ts`: active and post years, production series.
   - `liberation.ts`: drained, VAM and AMM series.
   - `technology.ts`: the selection rule, sizing and warnings.
   - `streams.ts`: `buildStreams(mine, settings, tech)` returns a `StreamInput[]`.
   - `cashflow.ts`: per-stream capex and annual rows, mirroring `stream_cashflows`.
   - `finance.ts`: `pv`, `npv`, `irr` (the B5 algorithm), `payback`, the break-even closed form (B4), and stream
     break-evens.
   - `evaluate.ts`: `evaluate(mine, settings, tech, constants): Result`.
   - `index.ts`: re-exports.
   No React, DOM or `window` anywhere in `src/model`. Everything must run in Node.
2. Implement Appendix B exactly, including:
   - price escalation and the grant share
   - crediting periods of 10 or 15 years
   - AMM flooding and the `q0BasisMm3` override
   - the VAM "needs enrichment" rule
   - the 5% to 15% explosive-range safety warning
   - the "destruction mandated" rule (zero reductions, costs kept)
   - the reference behaviour where drainage opex continues after closure (B3 note)
3. Add `src/model/fixtures.ts` with the model inputs (plain `MineInput`, not wrapped) for `moonidih_v1`,
   `moonidih_wb2034` and the five archetypes, as in Appendix B6. Step 3 builds the same inputs from JSON, and a later
   test checks the two agree.
4. Tests in `tests/model/`:
   - `golden.test.ts` loads every JSON in `tests/golden/` that this step reads and compares every number it names.
     Tolerance: pass if |actual − expected| ≤ max(0.5% × |expected|, abs), where abs is $0.01 for $/t, $1,000 for USD,
     1 for tCO2e and 0.0005 for IRR. Payback index must match exactly. `null` must match `null`.
   - `physics.test.ts`: all of Appendix B7.
   - `rules.test.ts`: the technology rule table, warnings, and mandated destruction.
   - `perf.test.ts`: `evaluate` for Moonidih runs 1,000 times in under 500 ms in Node (1 ms per run on average). This
     keeps sliders instant.

Done when: every golden value and physics check passes, `npm run golden:check` passes, and coverage of `src/model` is
at least 95% of lines (`npx vitest run --coverage tests/model` if coverage is available; otherwise list the uncovered
branches).

---

## Step 3: data layer (schemas and data files)

**Model: Sonnet 5.5 · Effort: high · Wave 1 (overnight)**
Branch: `step/3-datalayer`.
Owns: `src/data/**`, `data/*.json` (not `data/raw`, not `data/geo`), `tests/datalayer/**`.
Reads: Appendix B6, Appendix C, Appendix E, SPEC_V1 "Data model", "Price scenarios" and §11 (targeted reads only).

1. Zod schemas in `src/data/schemas.ts` for:
   - the field wrapper `{ value, unit, source, quality }`
   - `MineRecord` (wrapped)
   - `TechLibrary`, `PriceScenario[]`, `Constants`, `Settings`
   - the two generated files from Step 1 (Appendix D)
   Export inferred types and make sure they are assignable to the contract in `src/model/types.ts` (add a
   compile-time `satisfies` check in `src/data/contract.check.ts`).
2. Data files, every value with unit, source and quality:
   - `data/mines.json`: Moonidih plus the five archetypes, values from Appendix B6. Moonidih's `closureYear` defaults
     to the workbook year 2034 (quality `estimated`, source "CIL_Mine_Closure_Timeline_v5.xlsx, FY2025-26 output
     basis"). Its `closureAlternatives` lists 2030 at the FY2026-27 target.
   - `data/technologies.json`: SPEC §5.
   - `data/prices.json`: the eight scenarios in Appendix E, with badges and dates.
   - `data/constants.json` and `data/settings.default.json`: SPEC §11 plus `priceEscalation` 0 and `grantShare` 0.
3. Loaders in `src/data/load.ts`:
   - Import the JSON statically so Vite bundles it.
   - Validate once at startup.
   - Expose `getMine(id)`, `listMines()`, `getTech()`, `getPrices()`, `getSettings()` and `getMapData()` (from
     `src/generated/mines_map.json`).
   - `unwrapMine(record, timeline): MineInput` fills the closure year from `closure_timeline.json` when the record
     says `"closureYear": {"from": "timeline"}`.
   - Until Step 1 merges, the generated files are Step 0's placeholders. Write the loaders against the Appendix D
     shapes, not against the placeholder counts.
4. Errors: a malformed file fails at build and in tests with a readable message giving file, path and expected type.
5. Tests in `tests/datalayer/`:
   - every file validates
   - a malformed fixture fails with a readable message
   - `unwrapMine(moonidih)` with the closure year forced to 2030 deep-equals the `moonidih_v1` fixture input from
     Appendix B6. Compare to the JSON shape in Appendix B6, not to Step 2's file, to stay independent.
   - every quality value is one of the four allowed

Done when: tests pass, the `satisfies` check compiles, and the PR lists every DUMMY value with its file and path.

---

## Step 4: design system and app shell

**Model: Sonnet 5.5 · Effort: high · Wave 1 (overnight)**
Branch: `step/4-ui`.
Owns: `src/styles/**`, `src/ui/**`, `src/lib/**`, `src/app/**`, `index.html`, `tests/ui/**`.
Reads: `docs/DESIGN.md`, `design/Style.dc.html`, and the header and footer parts of `design/Main.dc.html` (use `rg -n`
to find them; do not read the map SVG paths).

1. `src/styles/tokens.css` with every token in DESIGN.md, plus `global.css`: body ground, font stacks, focus ring
   (2px ink, 2px offset), `.num` for tabular figures, and the reduced-motion rules. Add the Google Fonts link in
   `index.html` with preconnect. Set `<html lang="en">` and a title per route.
2. Components in `src/ui/`, each a small typed React component using only tokens:
   - `Button` (primary, secondary, link; renders an `<a>` when given `href`)
   - `Chip` (toggle, `aria-pressed`)
   - `Segmented` (group of buttons with `aria-pressed`, label via `aria-labelledby`)
   - `Slider` (label, value text, native `<input type=range>`, styled as in Style.dc.html)
   - `MetricTile`, `MetricGrid`
   - `Tag` (quality: measured, estimated, literature, dummy; plus "Illustrative inputs")
   - `VerdictPill` (ok or short)
   - `Card`, `LegendRow`, `Eyebrow`
   - `Header` (wordmark, "Research preview" tag, nav: Map, Method, Sources, with the current page marked by
     `aria-current`)
   - `Footer` (sources line, "Nicholas Institute, Duke University · Draft for the Ranchi workshop, January 2027",
     and the line "Indicative, pre-feasibility results. Not investment advice.")
   - `PageLayout`
   Press feedback, hover and transitions follow DESIGN.md › Motion.
3. `src/lib/format.ts`:
   - `usdPerT(x)` → `$8.33`
   - `usdM(x)` → `$8.6M`, with U+2212 for negatives (`−$4.3M`)
   - `tonnes(x)` → `385k t` or `1.82 Mt`
   - `pct(x, d)`
   - `inr(x, fx)` for the INR toggle
   Unit tests cover negative, zero and positive for each.
4. `src/app/router.ts`: a small hash router, no library. Routes:
   - `#/` → MapPage
   - `#/mine/:id` → MinePage
   - `#/compare`, `#/method`, `#/assumptions`, `#/sources`, `#/data`
   - `#/ui` → component gallery; dev builds only, or a hidden link
   Query strings are preserved. Unknown routes show a plain "Page not found" with a link to the map. Scroll to the
   top on route change, and move focus to the H1.
5. `src/app/App.tsx` wires `PageLayout` and the routes to the page stubs from Step 0. Do not edit the page folders.
6. The `#/ui` gallery page lives in `src/app/UiGallery.tsx` and shows every component in every state. It is the
   screenshot target for this step.
7. Tests in `tests/ui/`: router (routes, query preserved, 404), the format functions, and that `Chip` and
   `Segmented` toggle `aria-pressed` and work by keyboard.

Screenshots: `ui-1440` and one 390px gallery shot (add `ui-390` to the shots config).
Done when: tests pass, and the gallery matches `design/Style.dc.html` in colour, type and spacing (say in the PR
where it differs and why).

---

## Step 5: map landing page

**Model: Opus 5.5 · Effort: high · Wave 2 (overnight)**
Branch: `step/5-map`.
Owns: `src/pages/MapPage/**`, `src/components/map/**`, `e2e/map.spec.ts`.
Reads: `docs/DESIGN.md` › Map and Copy rules; the hero, legend and method parts of `design/Main.dc.html` and
`design/Landing-Mobile.dc.html` (skip the SVG path data with `rg -n` plus offsets); Appendix A; Appendix D.

1. Build the page as in the artboards:
   - **Hero.**
     - Eyebrow "Coal India · mine methane".
     - H1 "Which closing mines can pay for their own methane?"
     - Lede as in the artboard.
     - Primary button "Open Moonidih" → `#/mine/bccl-moonidih`, plus the link "How the model works" → `#/method`.
   - **Legend** ("Expected closure"). Rows: By 2031, 2032 to 2036, 2037 to 2050, After 2050, No date, Already closed.
     Counts come from `bands` in `mines_map.json`. Add the note on estimated closure periods and approximate
     positions.
   - **Map** `<svg>`, drawn from `mines_map.json`: land, coal states, edge, cities, then dots in the DESIGN.md draw
     order, then the lens. Use `role="img"` with an `aria-label` built from the counts.
   - **Moonidih pin**: a real `<a href="#/mine/bccl-moonidih">`, positioned in percent from its x and y, with:
     - the pulse
     - a dot in Moonidih's own band colour (this is now `by2036`, orange; the artboard showed red only because it
       used a placeholder band)
     - the "Start here" card: Moonidih, "BCCL · underground · open the model"
     On phones the card sits below the map, as in Landing-Mobile.
   - **"One mine at a time"** three-step section and the footer, as in the artboard.
2. Other mines are not linked. On pointer hover or keyboard focus they show a small tooltip with:
   - name and subsidiary
   - type
   - run-out year (or "After 2225" / "No date")
   - "Model not built for this mine yet"
   Make each dot focusable only through the list below, not as 626 tab stops.
3. Below the map, add a "Browse all mines" disclosure (closed by default). It holds a table of the 311 operating mines:
   - columns: name, subsidiary, state, type, run-out year, band
   - sortable by run-out year
   - filter chips by band
   - Moonidih's row links to its page
   This is the keyboard and screen-reader path for the map. Wrap the table in an `overflow-x: auto` box on phones.
4. Performance: render the SVG once (memoised). Do not re-render on hover; move the tooltip with transform. The page's
   own JS outside the shared bundle stays under 60 kB gzipped (report the number from the build output).
5. `e2e/map.spec.ts`:
   - the H1 shows
   - the legend counts equal the JSON
   - clicking the pin goes to `#/mine/bccl-moonidih`
   - pressing Tab reaches the pin
   - the table opens and sorts
   - no console errors
   - no horizontal overflow at 390px

Screenshots (at most 4): `map-1440`, `map-390`, one with the tooltip open, one with the table open.
Done when: the e2e spec passes and the screenshots match the approved artboards, apart from the pin colour.

---

## Step 6: mine page (Moonidih model view)

**Model: Opus 5.5 · Effort: high · Wave 2 (overnight)**
Branch: `step/6-mine`.
Owns: `src/pages/MinePage/**`, `src/components/inputs/**`, `src/components/charts/{PriceRuler,ReductionsByYear,NpvVsPrice}.tsx`,
`src/state/**`, `e2e/mine.spec.ts`.
Reads: the whole of `design/Moonidih.dc.html` (it holds the approved layout and a working JS prototype of the
controls; port its structure, not its runtime); Appendix B4; Appendix E; Appendix F.

1. **Layout** as in the artboard:
   - **Title block**: "All mines" back link, mine name, meta line, band chip, reserve chip.
   - **Tags**: "Illustrative inputs" whenever any input that feeds the headline has quality `dummy`.
   - **Left panel** "Assumptions":
     - Credit price: slider $0 to $40 plus a number input up to $200. Chips for the scenarios in Appendix E marked
       `chip: true`. The note "No public price exists yet for coal mine methane credits."
     - The mine:
       - drained gas slider, 5 to 80 Mm³ a year
       - last year of mining: a segmented control for basis (At current output · At 2026-27 target · Custom), plus a
         slider from the start year to startYear + creditingYears − 1. The basis buttons come from the mine's
         `closureAlternatives` and are hidden when missing.
       - methane in ventilation air: 0.1%, 0.3%, 0.6%
     - The project: drained gas use (Make power · Flare it); grant (None · 15% · 30%).
     - Accounting: discount rate (8% · 10% · 12%); GWP (21 · 28 · 29.8); crediting period (10 · 15 years).
     - "Reset to Moonidih defaults".
   - **Right column**:
     - Result card: "Break-even credit price" big number, verdict pill, the sentence (Appendix F), and the price
       ruler with scenario ticks and your-price marker.
     - Metric grid: NPV, IRR, Pays back by, Build cost, Credits in the first year, Credits over the period.
     - Two charts: credits each year by stream with a closure line; net present value by credit price, with a dot at
       your price.
     - Stream table: stream, how it is destroyed, credits, break-even. Show "Too dilute to destroy" and "n/a" for
       needs-enrichment streams, and a safety warning row when a stream is in the 5% to 15% range.
   - Below that, a placeholder card "Who could pay for it", filled in Step 8. It shows the five structure names with
     the tag "Described, not yet modelled".
2. **State**: `src/state/url.ts` keeps every control in the hash query (`#/mine/bccl-moonidih?p=15&close=2034&...`).
   Use short keys, write with `history.replaceState`, and debounce 150 ms. A link reproduces the view exactly.
   `src/state/session.ts` is a small store for session overrides; Steps 9 and 10 use it. Its API is
   `getOverrides()`, `setOverride(path, value)` and `reset()`. Wrap any `localStorage` use in try/catch; the URL is the
   source of truth.
3. **Compute**: call `evaluate` from `src/model` with `unwrapMine(...)` plus overrides, memoised on inputs. Never
   recompute inside render loops. The NPV curve uses 41 points ($0 to $40). Under 16 ms per slider move on a laptop:
   measure with `performance.now()` in a dev-only console line, and report the number.
4. **Charts** are D3 scales and shapes rendered as React SVG, with tokens for colours, no animation library and 200ms
   CSS transitions. Each chart has a visually hidden data table (`<table class="sr-only">`) and an `aria-label`.
5. `e2e/mine.spec.ts`:
   - The default view shows the break-even from `tests/golden/moonidih_wb2034.json`, formatted.
   - Choosing "At 2026-27 target" shows $8.33.
   - Price $5 at 2030 shows a negative NPV.
   - The URL round-trips: load a copied URL and see the same numbers.
   - Keyboard: Tab through the controls; arrow keys move the sliders.
   - No console errors; no overflow at 390px.

Screenshots (at most 5): `mine-1440`, `mine-390`, 1440 with the 2030 basis, 1440 with VAM at 0.1%, the tablet width
1024.
Done when: the e2e spec passes and every number on the page traces to `evaluate` (list the bindings in the PR).

---

## Step 7: financing structures, waterfall and tornado (model only)

**Model: Sonnet 5.5 · Effort: high · Wave 2 (overnight)**
Branch: `step/7-finance`.
Owns: `src/model/{financing,waterfall,tornado,explain}.ts`, `tests/model/{financing,waterfall,tornado,explain}.test.ts`.
Reads: Appendix B4, B5 and B8; `reference/ref_v1.py` (`financing`, `waterfall`, `tornado`, `with_tech`);
`tests/golden/{financing_v1,tornado_v1,moonidih_v1}.json`.

1. `financing.ts`: `financing(mine, settings, tech, constants, params = FIN_DEFAULTS)` returns structures A to E as in
   B8. Each structure has Coal India's cash flow and its NPV, IRR and break-even. B also has the developer's cash flow,
   IRR, `developerDeclines`, `maxRoyalty` and `breakevenForDeveloper`. C has the prepayment and its share of capex. D
   has the premium, plus `floorCoversAtZero`.
2. `waterfall.ts`: the break-even split into capex, opex, MRV (monitoring, reporting and verification), fees and
   energy (negative), summing to P\* (B4).
3. `tornado.ts`: the ten perturbations in B8, generic over any `MineInput` (closure ± 2 years is clamped to the
   window). It returns the rows sorted by swing and the top six.
4. `explain.ts`: returns the break-even formula as data. Each term carries a label, value and unit, plus the result,
   so Step 8 can render "Explain this number" without maths in JSX.
5. Tests against `financing_v1.json` (at $15, at $5, and the 2034 case), `tornado_v1.json` (both cases; the order of
   `top6` must match) and `moonidih_v1.waterfall`. Same tolerances as Step 2.

Done when: all of these tests pass and the existing model tests still pass.

---

## Step 8: mine page, finance switch, more charts, explain, export

**Model: Opus 5.5 · Effort: high · Wave 3 (overnight)**
Branch: `step/8-mine-plus`.
Owns: `src/pages/MinePage/**` (extend), `src/components/charts/{CashFlow,Waterfall,Tornado}.tsx`,
`src/lib/export.ts`, `e2e/mine-plus.spec.ts`.
Reads: Appendix B8 and F; the "Who could pay" block of `design/Moonidih.dc.html`; SPEC_V1 "Website" › Mine detail.

1. **"Who could pay for it"** becomes a radio group of five cards (A to E) as in the artboard. Choosing one:
   - redraws the metric grid, the cash-flow chart and the verdict from Coal India's point of view (`financing()`)
   - shows the structure's one-paragraph description (Appendix F)
   - for B, shows the developer's IRR beside Coal India's royalty. When `developerDeclines`, it shows "No developer
     would take this at $X a tonne. They would need about $Y." (Y = `breakevenForDeveloper`)
   - for E, links the grant control
   Remove the "not yet modelled" tag.
2. **New charts**, in a second row under the existing two:
   - cash flow by year: bars, plus a cumulative line, with the payback year marked
   - break-even waterfall: capex, opex, MRV and fees up, energy down, ending at the break-even
   - tornado: top six rows, low and high cases on either side of the base break-even, labels from `tornado()`
3. **"Explain this number"**: a disclosure under the big number that renders `explain()` as a formula with this
   mine's values. Use plain HTML with `<sub>`, not a maths library.
4. **Units**: a USD/INR toggle in the header of the result card (rate from settings, labelled "at ₹{usdToInr} per $";
   the default is 95 and Step 13b makes it editable) and a tCO2e/tCH4 toggle for tonnes. Both live in the URL state.
5. **Export**: "Download CSV" (the annual table: year, each stream's credits, credit revenue, power revenue, opex,
   MRV, cash, cumulative) and "Save chart as PNG" (serialise the chart SVG to a canvas at 2×; no new dependency).
6. `e2e/mine-plus.spec.ts`:
   - Structure E at 2030 shows $2.73.
   - Structure B at $5 shows the developer-declines message.
   - The CSV row count equals the crediting period.
   - The tornado's first row label equals `tornado_v1` `top6[0]` for the current case.

Screenshots (at most 4): 1440 for structure B, 1440 for structure E, the second chart row, and 390 with the explain
panel open.
Done when: the e2e spec passes and the Step 6 spec still passes.

---

## Step 9: Method, Assumptions and Sources pages

**Model: Sonnet 5.5 · Effort: medium · Wave 3 (overnight)**
Branch: `step/9-method`.
Owns: `src/pages/{MethodPage,AssumptionsPage,SourcesPage}/**`, `tests/ui/pages-text.test.tsx`.
Reads: SPEC_V1 "Core concepts", §1 to §9, "Assumptions and open questions" and "Sources" (targeted reads only);
`data/raw/README.md`; `docs/DESIGN.md` › Copy rules.

1. **Method**: a plain-language page, under 900 words above the fold-out, written for a mine planner. Sections:
   - What the model does
   - The three gas streams
   - From gas to credits: the ER formula, with numbers from the Moonidih fixture computed at render
   - Costs and revenue
   - The break-even price
   - What counts for credits: regulatory surplus, ACM0008 (Verra's coal mine methane methodology), CCTS (India's
     Carbon Credit Trading Scheme)
   - What v1 leaves out
   - How closure years were estimated (the workbook method, in five lines)
   - Positions on the map are approximate
   Technical detail goes inside one closed `<details>`.
2. **Assumptions**: read-only tables of the technology library, constants, settings and price scenarios, each row
   with its value, unit, source and quality tag. "Change for this session" opens inline number inputs that write to
   `session.ts` overrides. Show a "Reset all" button and a banner whenever overrides are active.
3. **Sources**:
   - data provenance: the workbook (with its portal and Lok Sabha sources), the geography (DataMeet), the GMI
     Moonidih profile, prices
   - the research sources list from SPEC_V1
   - a "How to cite" line
   - a data-request contact line (mailto `aashish.yadav@duke.edu`)
4. Test that each page renders its H1 and that no text contains an em dash or "LCOA".

Screenshots (at most 3): `method-1440`, assumptions-1440, `method-390`.
Done when: tests pass and the word count is in the PR.

---

## Step 10: Compare (supply curve) and Data upload pages

**Model: Sonnet 5.5 · Effort: high · Wave 3 (overnight)**
Branch: `step/10-compare-data`.
Owns: `src/pages/{ComparePage,DataPage}/**`, `src/components/charts/SupplyCurve.tsx`, `public/templates/**`,
`e2e/compare-data.spec.ts`, `tests/ui/upload.test.ts`.
Reads: SPEC_V1 "Website" › Pages (Home supply curve, Compare, Data) and "Upload template"; Appendix C.

1. **Compare**: an abatement supply curve of Moonidih (current URL settings) and the abatable archetypes.
   - Bar width is credits over the period; height is the break-even. Bars are sorted by break-even.
   - The chosen price is drawn as a line, with scenario lines and their badges. Bars below the line are "pays" (ink);
     the rest use `--line-strong`.
   - Non-abatable archetypes are listed under the chart with the reason.
   - Headline: "At $X a tonne, N of M mines and archetypes break even, cutting Z MtCO2e over the period." Values are
     computed.
   - A compare table of two or three selected entries side by side.
2. **Data upload**:
   - Templates: `public/templates/mine_inputs_template.csv` (one row per mine; a second header row of units) and
     `mine_series_template.csv` (`mine_id, year, production_mt, drained_mm3, vam_mm3`). Pre-fill both with
     Moonidih's dummy values.
   - Upload with Papa Parse, validate each row with the Step 3 schemas, and list errors by row and column.
   - Valid rows merge into `session.ts` overrides. Show "Uploaded data is used only in this browser session."
3. Tests:
   - Uploading the unmodified template reproduces Moonidih's numbers exactly (unit test through the loader plus
     `evaluate`).
   - A bad row gives a readable row error.
   - e2e: Compare renders; moving the price changes the headline count; the Data page upload works.

Screenshots (at most 3): `compare-1440`, `data-1440`, `compare-390`.
Done when: the tests pass. At $15 with each mine's own default closure year, the paying set is Moonidih, Degree III
and Degree III closing in 4 years; Degree II sits just above break-even ($15.28).

---

## Step 11: QA, accessibility, performance and release

**Model: Sonnet 5.5 · Effort: high · Run with you watching**
Branch: `step/11-qa`.
Owns: fixes anywhere, but only fixes; no new features.

1. Run `npm run check`, `npm run e2e` and `npm run golden:check`; all must be green.
2. **Accessibility**:
   - keyboard walk of every page
   - visible focus that is never hidden
   - names for every control and chart
   - 4.5:1 text contrast
   - 200% zoom
   - 320px and 390px widths
   - reduced motion
   Run Lighthouse in Chrome DevTools once on the map and the mine page (accessibility 95 or more, performance 90 or
   more on desktop) and paste the scores.
3. **Copy**: search for em dashes, "LCOA", "perfect", unexpanded acronyms on first use per page (CCTS, VAM, AMM, MRV,
   GWP, NPV, IRR, EC, DGMS), and any number typed into JSX.
4. **Links**: every internal route resolves, mailto links are correct, and Pages serves the `/methane-ledger/` base
   correctly on a hard reload of a deep link.
5. **Content check**:
   - Moonidih defaults show the workbook year and its break-even.
   - The 2030 basis shows $8.33.
   - The "Illustrative inputs" tag shows while any dummy drives a headline.
6. **Screenshots** (at most 8): every page at 1440, plus map and mine at 390.
7. After I merge: confirm the deploy and paste the live URL.

Done when: the QA report in the PR lists every check with pass or fix.

---

## Step 13a: cost build-up in the model (run before Step 12)

**Model: Sonnet 5.5 · Effort: high · Wave 4 (overnight, in parallel with 13b)**
Branch: `step/13a-costs-model`.
Owns: `src/model/**` (add-only changes to `types.ts`, as in Appendix G), `src/data/**`, `data/costs.json`,
`data/settings.default.json`, `tests/model/costs.test.ts`, `tests/datalayer/**`, and the `golden` script in
`package.json`.
Reads: Appendix G, `reference/ref_v1_1.py`, and the keys of `tests/golden/costs_v1_1.json` (use `jq 'keys'`).

Goal: replace v1's all-in unit costs with a cost build-up that shows equipment, materials, installation labour, civil
works and staff, and that responds to Indian cost factors and the rupee rate. With `costModel: "v1"` the model must
still reproduce every v1 golden exactly.

1. Add `src/model/costs.ts` implementing Appendix G:
   - capex split by item and category, with the India factors, owner's costs, contingency, grid connection and
     monitoring
   - opex by type: non-labour O&M, engine overhauls, staff, insurance, fan power, decommissioning
   Mirror `reference/ref_v1_1.py` `flows_buildup` line by line, including its two v1 quirks: flare and oxidiser O&M
   are a share of the whole stream capex including drainage, and drainage O&M uses the base cost with no contingency.
2. Route everything through one function: `projectFlows(mine, settings, tech, constants, costs)`. `evaluate`,
   `financing`, `waterfall`, `tornado` and `explain` must all call it, so the cost basis flows through every result.
   Add the waterfall parts from Appendix G.
3. Add `data/costs.json` with `COST_DEFAULT` from Appendix G, every value with unit, source and quality `dummy`. Set
   `usdToInr` to 95 and `costModel` to `"buildup"` in `data/settings.default.json`, and add the Zod schemas for both.
4. Change the `golden` script to run `python3 reference/ref_v1.py && python3 reference/ref_v1_1.py`.
5. Tests in `tests/model/costs.test.ts`:
   - every case in `costs_v1_1.json`: break-even, capex, capex by category and by item, year-1 opex by type, NPV, IRR
     and payback, with Step 2's tolerances
   - neutral parameters give the same results as every v1 golden
   - the capex categories sum to total capex, and the opex types sum to total opex, within $1
   - a higher rupee rate lowers staff cost in USD; a higher local factor raises capex
   All existing tests must still pass. They run with `costModel: "v1"`, so set that explicitly in their fixtures.

Done when: all tests pass, `npm run golden:check` passes, and the PR lists the five largest cost lines for Moonidih at
the defaults.

---

## Step 13b: "All assumptions" panel and cost tables on the mine page

**Model: Opus 5.5 · Effort: high · Wave 4 (overnight, in parallel with 13a)**
Branch: `step/13b-advanced-ui`.
Owns: `src/pages/MinePage/**`, `src/components/advanced/**`, `src/data/registry.ts`, `src/state/url.ts`,
`src/lib/format.ts` (add-only), `e2e/advanced.spec.ts`, and the expectations in `e2e/mine.spec.ts` and
`e2e/mine-plus.spec.ts`.
Reads: Appendix G (parameter names and the registry shape), `docs/DESIGN.md`. Code against the Appendix G names; Step
13a builds the model side in parallel.

1. **Variable registry** in `src/data/registry.ts`: one entry per adjustable variable. The shape is in Appendix G.
   It covers:
   - every setting
   - every technology value
   - every cost parameter, including each split share, imported share and headcount
   - every input on the mine record (with its quality from `data/mines.json`)
   - the financing parameters
   - the price of each scenario
   The registry is the only list. The panel and the Assumptions page both render from it. Leave a one-line note in
   the PR for Step 9's page to switch over later.
2. **"All assumptions" button** under the left panel's Reset button, labelled "All assumptions ({count})". It opens a
   side sheet: from the right, 480px wide on desktop; a full-height bottom sheet on phones. It slides in from the
   button's side with the 200ms DESIGN.md ease, closes on Esc or a click on the scrim, and returns focus to the
   button.
   - **Header:**
     - a search box that filters by label
     - group tabs: Market, Mine and gas, Technology, Costs, Finance, Accounting
     - "N changed" and "Reset all"
   - **Each row:**
     - label and unit
     - a number input with min, max and step from the registry (percentages entered as %)
     - the default value shown faintly
     - a quality tag and the source (in a tooltip)
     - a reset button that appears once the value has changed
     - a changed dot
   - **Cost basis switch** at the top of the Costs group: "India build-up" (default) or "v1 all-in unit costs".
   - **The rupee rate** sits in Market as "Rupees per US dollar" (default 95). The USD/INR toggle and every rupee
     figure use it.
   - **Validation:** out-of-range values show an inline message and are not applied. Changes apply live, debounced
     150 ms.
3. **URL state:** the existing short keys stay. Every other change is stored as `x=` (base64url of a JSON object of
   path to value, holding only the values that differ from the defaults). Add `cm=v1` for the v1 cost basis. A copied
   URL must reproduce the view, including every panel change.
4. **"What it costs" card**, under the stream table:
   - a capex table, with rows for engines, drainage, ventilation-air oxidiser, after-closure engines, grid
     connection and monitoring, and columns for equipment, materials, installation labour, civil works and total
   - the note "Includes owner's costs ({owners}%) and contingency ({contingency}%)"
   - an opex table: each type for the first year and for the whole period, plus staff headcount × cost per person in
     rupees
   Both tables follow the currency toggle. Rupee totals over ₹1 crore show in crore (add `inrCr` to `format.ts`).
   Add the new waterfall parts to the waterfall chart, and add the cost columns to the CSV export.
5. **Tests:**
   - Update the old expectations: in `e2e/mine.spec.ts` and `e2e/mine-plus.spec.ts`, the $8.33 and $2.73 checks now
     run with `cm=v1`. Add default-basis checks from `costs_v1_1.json`: 2030 gives $11.54, 2034 gives $3.37, and 2030
     with a 30% grant gives $4.94.
   - `e2e/advanced.spec.ts`:
     - The sheet opens and closes by keyboard.
     - Changing the rupee rate to 85 at 2030 shows $11.64.
     - Setting the local factor to 1.0 shows $14.10.
     - Reset all restores the default.
     - The URL round-trips with panel changes.
     - The capex categories add up to the total shown.

Screenshots (at most 4): the sheet at 1440 on the Costs group, the sheet at 390, the cost card at 1440, and the cost
card in INR.
Done when: the e2e specs pass. Merge 13a first, then rebase 13b and run `npm run check` once more.

---

## Step 12: real data (when CMPDI or Coal India data arrives)

**Model: Opus 5.5 · Effort: high · When the data arrives**
Branch: `step/12-real-data`.

1. Put the files I give you in `data/raw/cmpdi/` and write `data/raw/cmpdi/README.md` (what, from whom, date).
2. Fill `data/costs.json` with any real costs (labour rates, quotes) at quality `measured`, and regenerate the
   `costs_v1_1` goldens as `costs_real` (ask first).
3. Map them to mine records:
   - Moonidih first, then any other Degree II or III underground mine closing by 2036. There are 14 underground mines
     in the 2031 and 2036 bands; list them in the PR.
   - Fields: quality `measured` or `estimated`, source = the file and sheet.
4. Keep `tests/golden/*` as the "v1 dummy" regression set (fixtures stay). Add `tests/golden_real/` with the new
   expected values, generated by extending `reference/ref_v1.py` (ask me before changing anything in `reference/`).
5. Make the newly modelled mines clickable on the map, with their own "Open the model" tooltip action.

---

## Appendix A: closure bands (one rule, used by the pipeline, the legend and the map)

Inputs per mine: `year` (column 16: an integer, the text "After 2225", or empty) and `status` (column 18).

| Band key | Label | Rule | Colour token |
|---|---|---|---|
| `by2031` | By 2031 | status is "Past reported reserve", or year ≤ 2031 | `--band-2031` |
| `by2036` | 2032 to 2036 | 2032 ≤ year ≤ 2036 | `--band-2036` |
| `by2050` | 2037 to 2050 | 2037 ≤ year ≤ 2050 | `--band-2050` |
| `after2050` | After 2050 | year > 2050, or "After 2225" | `--band-after` |
| `nodate` | No date | no year: "Not producing" or "No reserve reported" | `--band-nodate` (hollow) |
| `closed` | Already closed | rows from Lok Sabha Annexure II | `--band-closed` |

Expected counts from v5:

| Band | Count |
|---|---|
| `by2031` | 55 |
| `by2036` | 25 |
| `by2050` | 44 |
| `after2050` | 142 |
| `nodate` | 45 |
| `closed` | 315 |

The 311 operating mines are 168 opencast, 130 underground and 13 mixed. Only 14 underground mines fall in the 2031 and
2036 bands, which is the likely target list for methane work. "Past reported reserve" means output since April 2024
already exceeds the 2024 reserve, so the reserve was probably revised; the tooltip says "Past reported reserve".

## Appendix B: model equations (everything Step 2 and Step 7 need)

All money is in real USD and all gas volumes are in Mm³ of pure CH4 a year. Year index t = 1 to N, where N is the
crediting period (10 or 15) and t = 1 is `startYear` (2027). Cash index 0 is the build year (2026).

**B1. Timeline and gas**

- activeYears = clamp(closureYear − startYear + 1, 0, N); postYears = N − activeYears.
- Production P_t (Mt a year): a number held flat over the active years, or a per-year array; 0 after closure.
- Liberated gas L_t = P_t × SE, where SE is the specific emission in m³ per tonne (Mt × m³/t = Mm³).
- Drained_t = measured drained volume if given (number or array), else L_t × drainedShare.
  VAM_t = measured VAM if given, else L_t × (1 − drainedShare). Measured beats derived. Both are 0 after closure.
- AMM (abandoned mine methane) after closure:
  - q0 = fAmm × B, where B = `amm.q0BasisMm3` if given, else Drained + VAM in the last active year. Default fAmm is
    0.30.
  - q(k) = q0 / (1 + b·D·k)^(1/b) for k = 1 … postYears. Defaults: D = 0.25 a year, b = 1.
  - Flooding: from `floodingYear` on, multiply by `floodingFactor` (default 0.5).
  - No AMM stream when postYears = 0 or the mine has no `amm` object.
  - For a mine already closed before startYear, the user gives q0 and the years since closure, and k starts at
    yearsSinceClosure + 1. This is a v1 input path; there are no goldens for it.

**B2. Technology rule per stream** (the user can override it, but never break a minimum)

| Stream | Rule | If no option fits |
|---|---|---|
| Drained, AMM | conc ≥ 0.30 and `powerOfftake` → power; else conc ≥ 0.25 → flare | status `needs_enrichment`, no capex, no reductions |
| VAM | conc ≥ 0.002 → RTO (regenerative thermal oxidiser) | status `needs_enrichment` (shown as "Too dilute to destroy") |
| Any | 0.05 ≤ conc ≤ 0.15 | add the warning `unsafe_range`: "Explosive range. Never transport or use this gas." |

Defaults: capture efficiency is 1.0 for drained, 0.85 for VAM and 0.70 for AMM. Drainage capex applies to the drained
stream when `hasDrainageSystem` is false.

**B3. Per-stream capex and annual rows** (mirrors `stream_cashflows`; TECH values from `data/technologies.json`)

- capMm3 = max(volumes) × captureEff. mass(V) = V × 670 t (density 0.67 kg/m³).
- Capex:
  - power: kW = mass(capMm3) × 50 × 0.38 / 3.6 × 1000 / (8760 × 0.90), and capex = kW × $1,300
  - flare: capMm3 × $40,000
  - RTO: airflow (m³/s) = capMm3 × 10⁶ / conc / 31,536,000, and capex = airflow × $60,000
  - drainage, if needed: add capMm3 × $250,000
  - then multiply everything by (1 + contingency 0.15)
- Each year:
  - captured = mass(V_t × captureEff); destroyed = captured × DE (destruction efficiency: power 0.995, flare 0.98,
    RTO 0.97)
  - ER_t = destroyed × (GWP − 44/16), or 0 if destruction is mandated
- Power: MWh = captured × 50 × 0.38 / 3.6. Energy revenue = MWh × power price. Opex = MWh × $15.
- Flare: opex = capex × 0.05. RTO: opex = capex × 0.06 + airflow_t × 60,000 kWh / 1000 × power price.
- Drainage opex each year: max(volumes) × $250,000 × 0.04. Note the reference keeps charging this after closure.
  Keep it so goldens match, and say so on the Method page.
- Project capex = Σ stream capex + monitoring $250,000 (no contingency on monitoring), all × (1 − grantShare).

**B4. Revenue, cash and the break-even**

- Price_t = P × (1 + escalation)^(t−1).
- Credit revenue_t = ER_t × (Price_t × (1 − b) − fee), with broker share b = 0.05 and issuance fee $0.20 a credit.
- MRV_t = $50,000 verification each year, plus $80,000 validation in t = 1.
- Cash_0 = −capex. Cash_t = credit revenue_t + energy revenue_t − opex_t − MRV_t.
- PV(x) = Σ x_t / (1 + r)^t; NPV = Σ_{i=0..N} Cash_i / (1 + r)^i.
- Break-even P\* (closed form, because NPV is linear in P):
  P\* = [capex + PV(opex + MRV − energy) + fee × PV(ER)] / [(1 − b) × PV(ER_t × (1 + e)^(t−1))]
- Waterfall: the same numerator split into capex, PV(opex), PV(MRV), fee × PV(ER) and −PV(energy), each divided by
  the denominator. The parts sum to P\*.
- Stream break-even (as in the reference): (stream capex + PV(stream opex − stream energy)) / PV(stream ER). It
  excludes monitoring, MRV and fees and is not grossed up. Negative means the stream pays for itself.
- `abatable` is false when no stream has status ok. The page then shows "Not abatable with v1 technologies" and the
  reason.

**B5. IRR and payback**

- IRR: scan r from 10.00 down to −0.90 in steps of 0.01, find the first (highest) step where NPV(r_hi) ≤ 0 < NPV(r_lo),
  then bisect 200 times. If there is no sign change, IRR is `null` and shows as "–".
- Payback index = the first i ≥ 1 where the cumulative cash reaches 0 or more, else `null`. Payback year =
  startYear − 1 + index.

**B6. Golden inputs** (`MineInput`, plain numbers)

- **moonidih_v1**:
  - window: startYear 2027, N 10, closureYear 2030
  - production 0.6 Mt a year
  - drained: measured 20 Mm³ a year, conc 0.50, capture 1.0, `hasDrainageSystem` false
  - VAM: measured 3.45 Mm³ a year, conc 0.003, capture 0.85
  - AMM: fAmm 0.30, D 0.25, b 1, capture 0.70, conc 0.60, no flooding
  - `powerOfftake` true; nothing mandated
- **moonidih_wb2034**: the same, with closureYear 2034.
- Sensitivity cases are in `tests/golden/sensitivities_v1.json`. The keys say what changed:
  - `flare_only` sets tech to flare on drained and AMM
  - `gmi_scale_78` uses drained 78 with `q0BasisMm3` 23.45
  - `closure_YYYY` sets the closure year
  - `grant_30`, `escalation_3pct`, `crediting_15`, `vam_0_1pct_not_abatable` and so on
- **Archetypes**:

| Archetype | Production (Mt/yr) | SE (m³/t) | Drained share | Drained conc | VAM conc | Closure year |
|---|---|---|---|---|---|---|
| Degree I underground | 0.5 | 0.8 | 0 | n/a | 0.0005 | 2036 |
| Degree II underground | 0.5 | 5 | 0.30 | 0.35 | 0.002 | 2036 |
| Degree III underground | 0.5 | 15 | 0.50 | 0.50 | 0.004 | 2036 |
| Degree III, closing in 4 years | 0.5 | 15 | 0.50 | 0.50 | 0.004 | 2030 (with AMM, as Moonidih but conc 0.60) |
| Opencast | 5.0 | 0.3 | 0 | n/a | 0 | 2036 |

  All archetypes have drainage capex (no existing system), power offtake true, and VAM capture 0.85.

**B7. Physics checks** (`tests/golden/physics_v1.json`)

- 1 Mm³ CH4 = 670 t. Destroying it fully at GWP 28 gives 16,917.5 tCO2e.
- 78 Mm³ at GWP 21 with no combustion deduction gives 1,097,460 tCO2e, against GMI's 1.109 Mt.
- NPV at P\* = 0 ± $1,000.
- The break-even falls when the power price, GWP or grant rises, and rises when the discount rate rises or closure
  moves earlier.
- AMM is strictly decreasing, and flooding cuts it from the flooding year.
- A mandated stream has costs but no reductions.
- VAM below 0.2% gives `needs_enrichment`; 5% to 15% gives `unsafe_range`.

**B8. Financing structures** (`FIN_DEFAULTS` from `reference/ref_v1.py`: royalty 0.10, hurdle 0.15, k 3, forward
discount 0.30, floor $10, premium $0.50, floor years 5, grant 0.30)

- **A. Coal India funds it.** Coal India's cash = project cash. Break-even = P\*.
- **B. A developer builds and runs it.**
  - royalty_t = 0.10 × (credit revenue_t + energy revenue_t)
  - developer cash = project cash minus royalty; Coal India's cash = [0, royalty…]
  - `developerDeclines` when the developer's IRR is `null` or below 0.15
  - maxRoyalty = max(0, NPV₁₅(project cash) / PV₁₅(gross revenue))
  - breakevenForDeveloper = the price where the developer's NPV at 15% = 0 (linear in P: solve from P = 0 and P = 1)
- **C. A buyer pays in advance.**
  - prepayment at t0 = Σ_{t≤k} ER_t × (Price_t × (1 − 0.30) × (1 − b) − fee)
  - Coal India's Cash_0 = −capex + prepayment; credit revenue is 0 for t ≤ k
- **D. A price floor.**
  - realised price_t = max(Price_t, $10) for t ≤ 5
  - premium = $0.50 × Σ_{t≤5} ER_t, paid at t0
  - break-even = the lowest market P with NPV ≥ 0, found by bisection in [0, 500]; it is 0 when the floor alone
    covers the project (`floorCoversAtZero`)
- **E. A grant or gap funding.** Capex × (1 − 0.30). Break-even from B4 with the grant.

Tornado rows (low case / high case, everything else at base):

| Row | Low / high |
|---|---|
| Power value | $40 / $120 per MWh |
| Engine capex | $910 / $1,690 per kW |
| RTO capex | $42,000 / $78,000 per m³/s |
| Drained gas | 10 / 30 Mm³ a year |
| Closure | 2 years earlier / later |
| Discount rate | 8% / 12% |
| GWP | 21 / 29.8 |
| Gas after closure (fAmm) | 0.15 / 0.45 |
| Ventilation methane | 0.2% / 0.6% |
| Contingency | 0% / 40% |

Sort by |high − low|. `top6` is the first six keys.

## Appendix C: the contract (`src/model/types.ts`, written verbatim in Step 0)

```ts
export type Quality = 'measured' | 'estimated' | 'literature' | 'dummy';
export interface Field<T = number> { value: T; unit: string; source: string; quality: Quality }

export type Tech = 'power' | 'flare' | 'rto';
export type StreamKind = 'drained' | 'vam' | 'amm';
export type StreamStatus = 'ok' | 'needs_enrichment' | 'no_gas';
export type Warning = 'unsafe_range' | 'needs_enrichment' | 'closure_outside_window';

export interface Constants {
  rhoTPerThousandM3: number;   // 0.67
  lhvGjPerT: number;           // 50
  co2PerCh4: number;           // 44/16
  gwpOptions: number[];        // [21, 28, 29.8]
}

export interface TechLibrary {
  power: { minConc: number; destructionEff: number; electricalEff: number; capexUsdPerKw: number; opexUsdPerMwh: number; availability: number };
  flare: { minConc: number; destructionEff: number; capexUsdPerMm3Yr: number; opexFracOfCapex: number };
  rto: { minConc: number; destructionEff: number; capexUsdPerM3s: number; opexFracOfCapex: number; fanKwhPerM3sYr: number };
  drainage: { capexUsdPerMm3Yr: number; opexFracOfCapex: number };
  monitoring: { capexUsd: number };
}

export interface Settings {
  startYear: number;              // 2027
  creditingYears: 10 | 15;
  creditPriceUsdPerT: number;     // 15
  priceEscalation: number;        // 0 = flat; 0.03 = +3% a year
  discountRate: number;           // 0.10 real
  gwp: number;                    // 28
  brokerShare: number;            // 0.05
  issuanceFeeUsdPerT: number;     // 0.20
  powerPriceUsdPerMwh: number;    // 80
  validationCostUsd: number;      // 80000, year 1
  verificationCostUsdPerYr: number; // 50000
  contingency: number;            // 0.15
  grantShare: number;             // 0
  usdToInr: number;               // 95, editable (Step 13)
}

export interface MineInput {
  id: string;
  name: string;
  closureYear: number;
  productionMtPerYr: number | number[];
  specificEmissionM3PerT?: number;
  drainedMm3PerYr?: number | number[];
  drainedShare?: number;
  drainedConc: number;
  vamMm3PerYr?: number | number[];
  vamConc: number;
  vamAirflowM3s?: number;          // if given, RTO is sized on it
  hasDrainageSystem: boolean;
  powerOfftake: boolean;
  captureEff: { drained: number; vam: number; amm: number };
  amm?: { fAmm: number; declineD: number; hyperbolicB: number; conc: number; q0BasisMm3?: number; floodingYear?: number; floodingFactor: number; q0Mm3?: number; yearsSinceClosure?: number };
  destructionMandated: { drained: boolean; vam: boolean; amm: boolean };
  techOverride?: Partial<Record<StreamKind, Tech>>;
}

export interface StreamInput {
  kind: StreamKind; label: string; concFraction: number; ch4Mm3ByYear: number[];
  tech: Tech | null; status: StreamStatus; captureEff: number;
  needsDrainageCapex: boolean; destructionMandated: boolean; warnings: Warning[];
}

export interface YearRow {
  year: number; erTco2e: number; ch4CapturedT: number; priceUsdPerT: number;
  creditRevUsd: number; energyRevUsd: number; opexUsd: number; mrvUsd: number; cashUsd: number; cumCashUsd: number;
  byStream: Record<StreamKind, { erTco2e: number; ch4Mm3: number }>;
}

export interface StreamResult {
  kind: StreamKind; label: string; tech: Tech | null; status: StreamStatus;
  capexUsd: number; erTotalTco2e: number; breakevenUsdPerT: number | null; warnings: Warning[];
}

export interface Result {
  abatable: boolean; activeYears: number; postYears: number;
  capexUsd: number; cashUsd: number[]; years: YearRow[];
  erTotalTco2e: number; erYear1Tco2e: number;
  breakevenUsdPerT: number | null; npvUsd: number; irr: number | null;
  paybackIndex: number | null; paybackYear: number | null;
  streams: StreamResult[]; warnings: Warning[];
}
```

## Appendix D: generated file shapes (Step 1 writes them, Step 3 validates them)

`src/generated/mines_map.json`:

```json
{
  "generatedAt": "ISO time", "sources": ["..."], "note": "...",
  "viewBox": [0, 0, 906, 1016],
  "projection": { "lat0": 22, "k": 33, "lonMin": 68, "latMax": 37.2 },
  "outline": "M...Z", "coalStates": [{ "name": "Jharkhand", "d": "M...Z" }],
  "cities": [{ "name": "Ranchi", "x": 529.6, "y": 457.4, "side": "w" }],
  "lens": { "window": [548, 435.5, 26, 19], "box": [612, 596, 232] },
  "bands": { "by2031": 55, "by2036": 25, "by2050": 44, "after2050": 142, "nodate": 45, "closed": 315 },
  "mines": [{ "id": "bccl-moonidih", "wbId": "111", "name": "Moonidih", "company": "BCCL", "state": "Jharkhand",
              "type": "UG", "band": "by2036", "runoutYear": 2034, "runoutLabel": "2034", "status": "Producing",
              "field": "jharia", "x": 561.0, "y": 444.3, "modelled": true }],
  "closed": [{ "name": "...", "company": "ECL", "field": "raniganj", "x": 0, "y": 0 }]
}
```

`modelled` is true only for mines with a record in `data/mines.json` (Moonidih in v1). Step 1 reads the IDs from
`data/mines.json` if it exists; otherwise it uses the hardcoded list `["bccl-moonidih"]`.

`src/generated/closure_timeline.json`: an object keyed by mine ID:

```json
{ "bccl-moonidih": { "wbId": "111", "reserve2024Mt": 4.21, "reserveLeft2026Mt": 3.33, "outputMt": { "fy2324": 0.48,
  "fy2425": 0.49, "fy2526": 0.39 }, "targetFy2627Mt": 0.85, "rateUsedMtPerYr": 0.39, "yearsLeft": 8.54,
  "runoutYear": 2034, "runoutLabel": "2034", "status": "Producing", "yearAtTarget": 2030, "ecCapacityMtPerYr": null,
  "yearAtEc": null, "note": null } }
```

## Appendix E: price scenarios (`data/prices.json`; dates August to October 2026)

| id | Label | USD/t | Badge | Chip | Note |
|---|---|---|---|---|---|
| `vcm_low` | Voluntary average | 7 | Sellable now (Verra) | yes | All credit types, Q3 2026 |
| `ccts_floor` | CCTS floor (our estimate) | 11 | Sellable later (CCTS) | yes | Mid-point of $10 to 12 |
| `ccp_premium` | High-integrity CMM credit (our estimate) | 15 | Sellable now (Verra) | yes (default) | Between the voluntary average and California offsets |
| `ca_offset` | California offset, out-of-state | 18.25 | Benchmark only | yes | US projects only |
| `ccts_ceiling` | CCTS ceiling (our estimate) | 30 | Sellable later (CCTS) | yes | Mid-point of $25 to 35 |
| `ca_allowance` | California allowance | 33.40 | Benchmark only | no (ruler tick) | Compliance price, not an offset |
| `eu_ets` | EU allowance (via CBAM) | 95 | Benchmark only | no | €82.32 at 1.15; off the ruler, noted as text |
| `custom` | Custom | user | none | no | Slider and number input |

The chips show the short form, for example "CCTS floor est. $11". The ruler ticks show `vcm_low`, `ccts_floor`,
`ca_offset`, `ccts_ceiling` and `ca_allowance`, staggered on two rows so the labels never overlap.

## Appendix F: copy for the mine page (values from `evaluate`; braces are bindings)

- **Sentence:**
  - when NPV ≥ 0: "At {price} a tonne, the project earns {npv} more than it costs in today's money, and pays back
    its {capex} build cost by {paybackYear}."
  - when NPV < 0: "At {price} a tonne, the project falls {−npv} short in today's money{, and does not pay back
    within N years}."
- **Verdict:** "Covered at {price}" (ok) or "Short by {P\* − price} a tonne" (short). For non-abatable mines,
  "Not abatable with v1 technologies".
- **Financing descriptions** (structures A to E, as in `design/Moonidih.dc.html`):
  - A: "Coal India pays the build cost from its own capital and keeps all credit and power revenue. Simplest to set
    up, but it competes with Coal India's other spending."
  - B: "A specialist developer pays for and operates the plant, sells the credits, and pays Coal India a royalty on
    gas revenue. Coal India puts up no capital and shares the upside."
  - C: "A credit buyer pays now for the first three years of credits at a discount, and that payment helps fund the
    build. The buyer takes on delivery risk, so the price is lower."
  - D: "A public facility guarantees a minimum price for the first five years of credits, as the World Bank's Pilot
    Auction Facility did for methane. Lenders can then count on that revenue."
  - E: "Public money covers part of the build cost. Move the grant control to see how much it lowers the
    break-even price."
- **Closure basis buttons:** "At current output ({runoutYear})", "At 2026-27 target ({yearAtTarget})", "Custom".
- **Footnote:** "Inputs are illustrative, scaled from the Global Methane Initiative profile of Moonidih and published
  cost ranges, until measured gas data arrives from CMPDI (Central Mine Planning and Design Institute) and Coal
  India. Closure year: reserve run-out from the closure timeline workbook."

## Appendix G: cost build-up (Step 13; reference `reference/ref_v1_1.py`, goldens `tests/golden/costs_v1_1.json`)

**Why.** v1 uses all-in unit costs from US, Chinese and global projects ($1,300 per kW for engines, and so on). They
include labour and materials but hide them, and they are not Indian. The build-up splits each item, applies Indian
factors, and adds the costs v1 leaves out. Every default below is DUMMY until Coal India or CMPDI costs arrive.

**Capex.** For each item, the base cost B is the v1 formula: engines kW × $/kW, flare Mm³ × $/Mm³, oxidiser m³/s ×
$/m³/s, drainage Mm³ × $/Mm³.

item = B × [ e × (m × (1 + importMarkup) + (1 − m)) + materials + (labour + civil) × localFactor ] × (1 + ownersCost) × (1 + contingency)

Here e, materials, labour and civil are the item's split shares (they sum to 1), and m is the item's imported share.
Then:

- project capex = Σ items + grid connection (only if a stream makes power) + monitoring
- the result is multiplied by (1 − grantShare)
- the reported categories (equipment, materials, labour, civil) carry their items' owner's-cost and contingency
  shares; grid connection counts as civil and monitoring as equipment

**Opex**, in years when the stream runs (volume > 0):

- **Engines:** MWh × non-labour O&M $/MWh, plus overhauls (overhaulUsdPerKw × MWh × 1000 / overhaulHours).
- **Flare:** stream capex × flareFrac. **Oxidiser:** stream capex × rtoFrac, plus fan power (as v1).
- **Drainage:** max volume × $250,000 × drainageFrac. This applies in every year, as in v1.
- **Staff:** headcount[tech] (plus headcount.drainage when the stream has drainage) × staffCostInr / usdToInr in years
  the stream runs, plus headcount.monitoring every year.
- **Insurance:** insurance × project capex, every year.
- **Decommissioning:** decommissioning × project capex, in the last year of the period.

The break-even uses the B4 closed form with this opex. Waterfall parts: capex, O&M, overhauls, staff, insurance, fan
power, decommissioning, MRV, fees, minus energy.

**Parameters** (`data/costs.json`; TypeScript names in brackets):

| Parameter | Default | Neutral (= v1) |
|---|---|---|
| Rupees per US dollar (`usdToInr`, in Settings) | 95 | any |
| Local factor for Indian labour and civil works (`localFactor`) | 0.60 | 1.0 |
| Import markup: duty, freight, insurance (`importMarkup`) | 0.15 | 0 |
| Owner's costs: engineering, permits, PM (`ownersCost`) | 0.10 | 0 |
| Grid connection (`gridConnectionUsd`) | $800,000 | 0 |
| Decommissioning, share of capex (`decommissioning`) | 0.05 | 0 |
| Insurance, share of capex a year (`insurance`) | 0.01 | 0 |
| Staff cost per person-year (`staffCostInr`) | ₹900,000 (₹9 lakh) | 0 |
| Headcount (`headcount`) | power 12, flare 2, RTO 4, drainage 6, monitoring 1 | any |
| Split equipment/materials/labour/civil (`split`) | power 0.65/0.10/0.15/0.10; flare and RTO 0.60/0.15/0.15/0.10; drainage 0.30/0.30/0.25/0.15 | any |
| Imported share of equipment (`imported`) | power 1.0, flare 0.5, RTO 1.0, drainage 0.3 | any |
| Non-labour O&M (`nonlabourOm`) | engines $9/MWh, flare 3%, RTO 3.5%, drainage 2.5% | $15/MWh, 5%, 6%, 4% |
| Engine overhaul (`overhaulUsdPerKw`, `overhaulHours`) | $250 per kW every 60,000 h | $0 |

**Contract additions** (add-only, in `src/model/types.ts`):

```ts
export type CostModel = 'v1' | 'buildup';
export type CostCategory = 'equipment' | 'materials' | 'labour' | 'civil';
export type CostItem = 'power' | 'flare' | 'rto' | 'drainage' | 'grid_connection' | 'monitoring';
export type OpexType = 'om' | 'overhaul' | 'staff' | 'insurance' | 'fan_power' | 'decommissioning';
export interface CostParams {
  localFactor: number; importMarkup: number; ownersCost: number; gridConnectionUsd: number;
  decommissioning: number; insurance: number; staffCostInr: number;
  headcount: Record<'power' | 'flare' | 'rto' | 'drainage' | 'monitoring', number>;
  split: Record<'power' | 'flare' | 'rto' | 'drainage', [number, number, number, number]>;
  imported: Record<'power' | 'flare' | 'rto' | 'drainage', number>;
  nonlabourOm: { powerPerMwh: number; flareFrac: number; rtoFrac: number; drainageFrac: number };
  overhaulUsdPerKw: number; overhaulHours: number;
}
// Settings gains: costModel?: CostModel  (missing = 'v1', so v1 fixtures keep working)
// Result gains:
//   costs?: { capexItems: { stream: StreamKind | 'site'; item: CostItem; category: CostCategory; usd: number }[];
//             capexByCategory: Record<CostCategory, number>;
//             opexByType: Record<OpexType, number[]> }
```

**Registry entry shape** (`src/data/registry.ts`, Step 13b):

```ts
{ path: 'costs.localFactor', label: 'Local factor for Indian labour and civil works', group: 'Costs',
  unit: '×', kind: 'number', min: 0.2, max: 1.5, step: 0.05, format: 'factor', source: '...', quality: 'dummy' }
```

`format` is one of `usd`, `usdPerT`, `inr`, `pct`, `factor`, `int` or `year`. Paths start with `settings.`, `tech.`,
`costs.`, `mine.`, `finance.` or `prices.`.

**Golden results**, Moonidih at the defaults:

| Case | Break-even | Capex | Opex in year 1 | NPV at $15 |
|---|---|---|---|---|
| Closure 2030 | $11.54 | $26.39M | $1.77M | $4.48M |
| Closure 2034 | $3.37 | $26.39M | $1.77M | $23.22M |
| 2030, ₹85 per $ | $11.64 | | | |
| 2030, local factor 1.0 | $14.10 | | | |
| 2030, no import markup | $9.83 | | | |
| 2030, staff cost ×2 | $12.36 | | | |
| 2030, flare instead of engines | $10.89 | | | |
| 2030, 30% grant | $4.94 | | | |

At 2030, capex by category is equipment $17.06M, materials $4.02M, labour $2.75M and civil $2.57M. Year-1 opex is
O&M $843k, overhauls $295k, insurance $264k, staff $218k and fan power $149k.

## Backlog (after Ranchi)

- v1.1:
  - equipment reuse from drained gas to AMM
  - gas sales and CNG
  - a grid-electricity credit toggle
  - tax and depreciation
  - stopping drainage opex at closure (this changes the goldens; regenerate them as `v1_1`)
  - a one-page PDF summary per mine
- v2:
  - every closing underground mine with gas screens
  - opencast pre-drainage
  - Monte Carlo ranges
  - a CCTS methodology mode once BEE (Bureau of Energy Efficiency) publishes one

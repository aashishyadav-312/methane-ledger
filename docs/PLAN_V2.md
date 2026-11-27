# Methane Ledger v2 build plan

v2 turns the site into a map-first app for every Coal India mine:

- Search for any mine, or zoom the map to find it.
- A live smog rises from the mines.
- Choosing a mine flies the map to it, slides in an inputs panel pre-filled with that mine's estimated data, and runs the model.
- Scrolling lifts the results over the map, while the map docks as a small card at top right with the mine's plume still rising.

v1 stays live and untouched at `https://aashishyadav-312.github.io/methane-ledger/`. v2 is built on a long-lived
`v2` branch and goes live at `https://aashishyadav-312.github.io/methane-ledger/v2/` as each step merges. You merge
`v2` into `main` yourself when you are happy; this plan never touches `main` except for one deploy-workflow PR in
Step 0.

## How to run it (two starts in total)

1. **Before Step 0, about 5 minutes, by hand:**
   1. Download Global Energy Monitor's Global Coal Mine Tracker (latest release, Excel). It is free, through the
      form on globalenergymonitor.org. Save it as `data/raw/gem/Global-Coal-Mine-Tracker.xlsx` in your local repo.
   2. Read its licence (GEM's terms page) and paste the licence line into `data/raw/gem/README.md`. If you skip the
      file, v2 still builds and every mine keeps its approximate coalfield position.
2. **Step 0, with you watching, about 25 minutes.** In the repo on `main`, unzip the v2 add-on, then open Claude Code
   (Sonnet 5.5, effort medium) and paste: `Read docs/PLAN_V2.md: the Global rules, then Step 0. Do Step 0 only.`
   You merge one small PR into `main` at the end (the deploy workflow).
3. **Autopilot, overnight.** Open Claude Code on branch `v2` (Sonnet 5.5, effort medium) and paste the conductor prompt
   below. It runs waves 1, 2 and 3 and merges each step into `v2`. The site at `/v2/` updates after every merge.
   Keep the laptop awake (`caffeinate -dimsu` on a Mac, or set Windows power to "never sleep" while plugged in).

```text
Read docs/PLAN_V2.md: the Global rules and the section "Conductor". You are the conductor. Run waves 1, 2 and 3 to
the end without asking me anything, following the Conductor rules exactly. Report only at the end.
```

| Step | What | Model | Effort | Wave |
|---|---|---|---|---|
| 0 | `v2` branch, deploy at /v2/, autopilot permissions, dependencies | Sonnet 5.5 | medium | 0 (with you) |
| 1 | Mine data v2: GEM coordinates and methane, search index | Sonnet 5.5 | high | 1 |
| 2 | Estimated inputs for every mine, closure-year curve (model) | Sonnet 5.5 | high | 1 |
| 3 | Zoomable map engine: zoom, fly-to, dots, labels, docking | Opus 5.5 | high | 1 |
| 4 | Smog and motion engine (canvas, huashu-art-motion) | Opus 5.5 | high | 1 |
| 5 | Shell: nav with About menu, routes, search component, tokens | Sonnet 5.5 | high | 1 |
| 6 | Home flow: select, panel, run, scroll choreography, phone | Opus 5.5 | high | 2 |
| 7 | Results dashboard: five charts and the reveal | Opus 5.5 | high | 2 |
| 8 | About pages, Compare for all mines, Data page | Sonnet 5.5 | high | 2 |
| 9 | QA, performance, accessibility, motion polish, release | Sonnet 5.5 | high | 3 |
| Review | Independent review of each wave's merged diff, run by the conductor | Opus 5.5 | medium | after each wave |
| Conductor | Runs waves, merges into `v2`, fixes CI | Sonnet 5.5 | medium | runs everything |

Each wave's steps touch different files, so they run in parallel in separate git worktrees. Waves run in order:

- Wave 2 needs wave 1 merged.
- Wave 3 needs wave 2 merged.

Expected wall time is roughly 3 to 5 hours for wave 1, 3 to 4 hours for wave 2, and 1 to 2 hours for wave 3, so start
in the evening.

**If you would rather start each wave yourself** (Option B), from the repo root on an up-to-date `v2` branch run:

```bash
git switch v2 && git pull
P='Read docs/PLAN_V2.md: the Global rules, then Step'
claude --bg -w v2-step-1 -n v2-step-1 --model sonnet --effort high --permission-mode auto "$P 1. Do Step 1 only."
claude --bg -w v2-step-2 -n v2-step-2 --model sonnet --effort high --permission-mode auto "$P 2. Do Step 2 only."
claude --bg -w v2-step-3 -n v2-step-3 --model opus   --effort high --permission-mode auto "$P 3. Do Step 3 only."
claude --bg -w v2-step-4 -n v2-step-4 --model opus   --effort high --permission-mode auto "$P 4. Do Step 4 only."
claude --bg -w v2-step-5 -n v2-step-5 --model sonnet --effort high --permission-mode auto "$P 5. Do Step 5 only."
```

Then merge with `bash scripts/v2/merge-step.sh <PR number>` in step order. Wave 2 is Steps 6 and 7 (opus) and 8
(sonnet); wave 3 is Step 9 (sonnet).

---

## Conductor

The conductor is one Claude Code session on branch `v2`. It does no feature work itself: it starts the steps, waits, reviews, merges and moves on.

1. **Before wave 1:**
   - Run `git switch v2 && git pull`.
   - Check that Step 0 is merged: `docs/PLAN_V2.md`, `scripts/v2/merge-step.sh` and the v2 dependencies exist.
   - If anything is missing, stop and report.
2. **Each wave:**
   - **Start the wave's steps in parallel**, one subagent per step, using the Agent tool with `isolation: "worktree"`, `run_in_background: true`, and the step's model and effort from the table.
   - **Give each subagent exactly this prompt:** `Read docs/PLAN_V2.md: the Global rules, then Step N. Do Step N only. Base branch: v2. End by opening a PR into v2 and printing its number.`
   - **If the Agent tool can't set the model or effort**, launch the step with the Option B command for it instead.
3. **When a step finishes:**
   1. Read its final report (at most 15 lines) and its PR number.
   2. Do not read its diff yourself; the review below does that.
   3. Run `bash scripts/v2/merge-step.sh <PR>`, which waits for CI and squash-merges into `v2`.
   4. Merge in step-number order inside the wave. If a later PR then conflicts, run the Fix-up procedure on it before merging.
4. **Fix-up** (conflict or red CI), at most 2 attempts per PR:
   - Start a subagent (Sonnet 5.5, effort medium, worktree on the PR's branch) with: `Rebase <branch> onto origin/v2, resolve conflicts keeping both sides' intent, run npm run check and the e2e specs the failing job names, push. Do not change tests/golden or reference.`
   - If it is still red after 2 attempts, leave the PR open, label it `blocked`, and go on with the rest. Never merge a red PR.
5. **After each wave's merges:**
   - Start one Review subagent (Opus 5.5, effort medium, fresh context) with: `Review the diff of the last wave on v2 (git log for the wave's merge commits; read the diff only, not the whole repo) against docs/PLAN_V2.md Global rules and docs/DESIGN_V2.md. List real defects only (correctness, accessibility, performance, rule breaks), most severe first, max 10. Fix the top ones on a branch v2/review-wN and open a PR into v2.`
   - Merge that PR with the merge script.
6. **Next wave**: only when every step of the current wave is merged or labelled `blocked`. If a `blocked` step is
   needed by the next wave (see the dependency line), stop and report.
7. **End:**
   - Confirm the Pages deploy run for the last merge is green (`gh run list --workflow Deploy -L 1`).
   - Open `https://aashishyadav-312.github.io/methane-ledger/v2/` with `curl -sI` and expect a 200.
   - Print a final report (at most 25 lines) with: each step's PR and status, anything blocked and why, the live URL, and what is left for you.
8. **Budget:**
   - The conductor never takes screenshots and never runs the full e2e suite; CI does.
   - Keep your own context small: no reading of step diffs or long logs (`| tail -30` at most).

---

## Global rules (every step)

**Scope and reading**

1. `CLAUDE.md` loads automatically. Read only the Global rules, your own step, and the appendices your step names.
   Read `docs/DESIGN_V2.md` sections only when your step names them. Never read PLAN_V1.md or SPEC_V1.md in full;
   use `rg -n` and read the lines you need.
2. Never open `data/raw/**` except in Step 1. Never print generated JSON in full; use `jq 'keys'`, `jq length` or
   `head -c 600`.
3. Do not spawn subagents (only the conductor does). Do not search the web. If a fact is missing, write it under "Open
   questions" in the PR and carry on with the stated default.

**Branches and ownership**

4. Start: `git fetch origin && git switch -c v2/step-N-<slug> origin/v2`. In a worktree, rename the worktree's branch
   to that name. Every PR targets `v2`, never `main`.
5. Edit only the paths your step owns (each step lists them). New files inside your own folders are fine. Anything
   else goes under "Needs from other steps" in the PR.
6. No new dependencies after Step 0. The v2 set is listed in Step 0.
7. `src/model/types.ts` is the contract. Only Step 2 may edit it, and only by adding optional fields or new types.
   `src/v2/contracts.ts` (written in Step 0, Appendix I) is the contract between v2 UI steps: do not change existing
   signatures; add only.

**Correctness**

8. Never change `tests/golden/**` or `reference/**` to make a test pass.
9. Units in names. No hidden constants: every number comes from `data/`, `src/model/constants.ts`, or the DESIGN_V2
   tables (motion and smog numbers live in `src/v2/motion/tokens.ts`, written in Step 4).
10. No hardcoded result numbers in JSX or copy. Sentences with numbers are built from computed values.
11. Copy follows DESIGN.md and DESIGN_V2.md copy rules: sentence case, no em dashes, no all-caps labels, no "→".

**Speed and cost**

12. While working, run only the tests you touched (`npx vitest run <path>`). Before the PR, run `npm run check` once.
13. Playwright: only your own spec file (`npx playwright test e2e/v2/<file>`), and only in Steps 3, 4, 6, 7, 8 and 9.
14. **Screenshots: at most 6 images per step (8 in Step 9).**
    - Take them in one batched run at the end: `npm run shots -- --step v2-N --only <names>`.
    - Animation goes on a contact sheet: `npm run shots -- --step v2-N --frames <name>@0,1.5,4` renders frames at
      those seconds (frozen clock) into ONE image. Use contact sheets instead of several stills.
    - Re-shoot at most once, and only the views you fixed. Device scale 1.
15. Never leave a dev server or watcher running. `npm run shots` builds, serves and stops by itself.
16. **Long commands:**
    - Wrap anything that could run long in `timeout 300`.
    - Never run `npm run data` (v1 pipeline) or the full e2e suite locally.
    - If the same failure survives 3 fix attempts, stop and write it up in the PR as "Blocked".
17. Commit in small steps (`feat(v2-map): ...`). Keep console output short (`| tail -20`).

**Finish**

18. Push, then `gh pr create --base v2 --fill`. The PR body has these sections:
    - what changed
    - "Done when" checks with pass or fail
    - test counts
    - screenshot paths
    - "Needs from other steps"
    - open questions
19. Your final message is at most 15 lines and ends with `PR: <number>`. Do not merge (the conductor does).

**Animation rule (Steps 3, 4, 6, 7, 9)**

20. Motion follows DESIGN_V2 "Motion" and the skills apple-design, emil-design-eng and huashu-art-motion:
    - transform and opacity only
    - interruptible
    - every timing from `src/v2/motion/tokens.ts`
    - reduced motion handled in the same component, not later
    - each animated view has a frozen-clock state for tests (`?freeze=<seconds>`)

---

## Step 0: v2 branch, deploy at /v2/, autopilot permissions, dependencies

**Model: Sonnet 5.5 · Effort: medium · With you watching (about 25 minutes)**
Branch: `v2` (created here), plus one PR into `main` for the deploy workflow.

1. **Create the branch.** `git switch main && git pull && git switch -c v2`. Commit the add-on files that are already in the
   working tree:
   - `docs/PLAN_V2.md`, `docs/DESIGN_V2.md`
   - `reference/ref_v2.py`
   - `tests/golden/estimation_v2.json`
   - `design/v2/*.dc.html`
   - `scripts/v2/merge-step.sh`
   - `data/raw/gem/README.md`, and the GEM workbook if present
2. **Build path.** In `vite.config.ts`, set `base: process.env.BASE_PATH ?? '/methane-ledger/'`. In
   `scripts/shots.mjs`, read the same variable for its base URL. Add `"build:v2": "BASE_PATH=/methane-ledger/v2/ vite build"`
   to package.json (use `cross-env` only if you are on Windows: check `node -p process.platform`. If it prints `win32`,
   write a tiny `scripts/v2/build-v2.mjs` that sets the variable and runs vite, instead of adding a dependency).
3. **Deploy.** Replace `.github/workflows/deploy.yml` with Appendix H (it builds `main` at the root and `v2` at
   `/v2/` on a push to either branch).
   - Commit it on `v2`.
   - Open a PR into `main` containing only that workflow file (`ci/deploy-v1-and-v2`), and tell me to merge it. This is the only `main` change in the whole plan.
   - Then allow Pages deploys from `v2`: `gh api -X POST repos/aashishyadav-312/methane-ledger/environments/github-pages/deployment-branch-policies -f name=v2`. If it errors, tell me to add `v2` under Settings › Environments › github-pages › Deployment branches.
4. **CI.** In `.github/workflows/ci.yml`, keep `on: pull_request` (it already covers PRs into `v2`). Add a job step
   `npm run golden:check` that also runs `python3 reference/ref_v2.py` (extend the `golden` script). Make e2e run only
   `e2e/v2/**` on PRs into `v2`, using `if: github.base_ref == 'v2'` to choose the path. That keeps CI under 8 minutes.
5. **Dependencies.** Install the v2 set pinned exact, in one command:
   - `npm install --save-exact motion d3-zoom d3-selection d3-interpolate d3-transition`
   - `npm install --save-exact -D @types/d3-zoom @types/d3-selection @types/d3-interpolate @types/d3-transition`
   - Add `rapidfuzz` to `scripts/requirements.txt` and run `npm run py:setup`.
6. **Skills.** Run `npx skills add alchaincyf/huashu-art-motion` and report where its SKILL.md landed.
   - If that fails, copy `SKILL.md` and `references/{02-机制.md,03-一帧先行四条路线.md,04-纯代码绘制.md,色板.md}` from `C:\Data\9. Duke\Assistantship\Coal India\Paper\huashu-art-motion-main` into `.claude/skills/huashu-art-motion/` (MIT licence; keep the LICENSE file).
   - Record the path in CLAUDE.md.
7. **Autopilot permissions.** Edit `.claude/settings.json`:
   - Add to allow:
     - `Bash(bash scripts/v2/merge-step.sh *)`
     - `Bash(git push -u origin v2/*)`, `Bash(git push origin v2/*)`, `Bash(git push origin v2)`
     - `Bash(git rebase origin/v2)`, `Bash(git switch v2)`, `Bash(git pull *)`
     - `Bash(gh pr checks *)`, `Bash(gh run list *)`, `Bash(gh pr edit *)`
     - `Bash(python3 reference/ref_v2.py)`, `Bash(npm run build:v2)`
     - `Bash(curl -sI https://aashishyadav-312.github.io/*)`
   - Keep every deny, including `gh pr merge *` (merging only happens through the script, which refuses any PR not based on `v2`) and `git push origin main *`.
   - Re-add the npm install denies after step 5.
8. **CLAUDE.md.** Add a v2 section:
   - The plan is PLAN_V2.md on branch v2.
   - The design is DESIGN_V2.md plus design/v2.
   - All v2 UI code lives in `src/v2/**`.
   - PRs go into v2.
   - v1 code under `src/pages/**` stays working.
   - Give the huashu skill path.
9. **Skeleton** (so parallel steps never collide):
   - `src/v2/contracts.ts` (Appendix I, verbatim)
   - empty folders, each with an `index.ts` stub: `src/v2/{map,smog,motion,shell,search,home,panel,results,pages}/`
   - `e2e/v2/smoke.spec.ts` (loads `#/`, sees the H1)
   - shots config entries `v2-home-1440`, `v2-home-390`, `v2-mine-1440`, `v2-results-1440`, `v2-results-390`, `v2-about-1440`, `v2-compare-1440`, pointing at the v2 build
   - the `--frames` contact-sheet option in `scripts/shots.mjs` (Rule 14): load `?freeze=<t>` per frame, screenshot each, then render one HTML grid page of the PNGs and screenshot it once
10. Push `v2`. Run `npm run check` and `npm run build:v2` once. After you merge the main PR, confirm that
    `https://aashishyadav-312.github.io/methane-ledger/v2/` returns 200 (it shows the v1 app for now) and that the root
    still shows v1.

Done when: the main PR is open, `v2` is pushed with the skeleton, `/v2/` serves, `npm run check` is green on `v2`, and
the conductor prompt can start.

---

## Step 1: mine data v2 (GEM coordinates and methane, search index)

**Model: Sonnet 5.5 · Effort: high · Wave 1**
Owns: `scripts/data/v2/**`, `src/generated/v2/**`, `data/gem_overrides.csv`, `tests/data/v2/**`.
Reads: Appendix A, Appendix G, `data/raw/gem/README.md`, the headers of the GEM workbook (`openpyxl`, first 3 rows of
each sheet only).

1. Write `scripts/data/v2/build_v2.py`. It reads `src/generated/mines_map.json` and `closure_timeline.json` (v1 outputs),
   plus the GEM workbook if present. It writes:
   - `src/generated/v2/mines_v2.json`: per mine, v1 fields plus `lat`, `lon`, `x`, `y`, `positionQuality`
     (`"gem"` or `"coalfield"`), `gemId`, `gemMethaneMm3` (null if none), `degreeEstimate` and `searchKey` (Appendix G
     normalisation). Also `closedMines` with positions. Keep the v1 projection (Appendix A).
   - `src/generated/v2/gem_match_report.csv`: one row per CIL mine, with the matched GEM name, score, rule and
     state check.
   - The India outline and coal-state paths again, but with the outline as its own path, for the ink boundary.
2. **GEM matching:**
   - Find the sheet with mine rows (columns for name, country, coordinates).
   - Filter country = India and owner or parent containing Coal India or the subsidiary name.
   - Match on normalised name with `rapidfuzz.fuzz.token_set_ratio` ≥ 88, the same state, and a GEM point within 60 km of the coalfield centroid. Take the best score; ties go to the nearest point.
   - `data/gem_overrides.csv` (`mine_id, gem_id_or_none`) wins over everything. Create it with a header only.
   - Report the matched count in the PR. Expect a majority of the 311; list the 20 largest unmatched mines by output.
3. **The methane column.** Find GEM's coal mine methane estimate column (`rg -i 'methane'` on the headers). Store it as `gemMethaneMm3` in million m³ a year (convert if the unit says otherwise; state the unit in the PR). If there is no such column, store null and say so.
4. **No GEM file:** every mine gets `positionQuality: "coalfield"` and the build still succeeds; the PR says so.
5. **Tests**, in `tests/data/v2/test_build_v2.py` (unittest) and `tests/data/v2/mines_v2.test.ts`:
   - 311 mines and 315 closed mines.
   - IDs equal the v1 IDs.
   - Every x in 0 to 906 and y in 0 to 1016.
   - If GEM is present, Moonidih is at 23.7409 ± 0.002, 86.3525 ± 0.002.
   - Band counts unchanged from v1 (55, 25, 44, 142, 45).

Done when: the tests pass, the output JSON is under 220 kB, and the match report is committed.

---

## Step 2: estimated inputs for every mine, and the closure-year curve (model)

**Model: Sonnet 5.5 · Effort: high · Wave 1**
Owns: `src/model/estimate.ts`, `src/model/closureCurve.ts`, `src/model/types.ts` (add-only), `data/estimation.json`,
`src/data/estimation.ts`, `tests/model/estimation.test.ts`, `tests/model/closureCurve.test.ts`.
Reads: Appendix B, Appendix C, `reference/ref_v2.py`, the keys of `tests/golden/estimation_v2.json`.

1. `data/estimation.json` holds the Appendix B parameters, each with unit, source and quality `estimated`. Add Zod
   schemas in `src/data/estimation.ts` (your own file; do not edit `schemas.ts`), plus a loader.
2. `src/model/estimate.ts`: `estimateMineInput(mine, timeline, params, settings) → { input: MineInput | null,
   status: 'ok' | 'not_abatable' | 'no_output', reason?: string, degree, specificEmission, totalMm3, warnings }`.
   - Port `reference/ref_v2.py` `estimate()` exactly.
   - If `data/mines.json` has a record for the mine (Moonidih), the record wins: `pickMineInput(id)` returns the record's input and `source: 'record'`.
   - Overrides (degree, output, total methane, closure year) come in through an `overrides` argument, so the panel can change any of them.
3. `src/model/closureCurve.ts`: `closureCurve(input, settings, tech, constants, costs) → { years, power[], flare[],
   crossoverYear }`. It calls the existing `evaluate` path for each closure year in the window with power and with flare (Appendix C).
4. **Tests:**
   - Every case in `estimation_v2.json` `cases`: status, degree, totalMm3, closureYear, and for ok cases breakeven, capex, NPV at $15, IRR and payback, with v1 tolerances.
   - `summary` counts exactly: ok 58, not abatable 211, no output 42, paying at $15: 4, at $7: 1.
   - The `closure_curve` arrays for the Moonidih record and the AMP Colliery estimate, and both crossover years (2031 and 2032).
   - `evaluate` 311 times (every mine) in under 400 ms in Node.

Done when: the tests pass and `npm run golden:check` is green.

---

## Step 3: zoomable map engine

**Model: Opus 5.5 · Effort: high · Wave 1**
Owns: `src/v2/map/**`, `e2e/v2/map.spec.ts`.
Reads: DESIGN_V2 "Map", "Motion" (rows: hover, select, scroll), Appendix E, Appendix F, Appendix I (`MapApi`),
`design/v2/V2-Home.dc.html` and `V2-Mine-Open.dc.html` (use `rg -n` to skip SVG path data).

1. `<MineMapV2>` renders the SVG map from `src/generated/v2/mines_v2.json`. Until Step 1 merges, read the v1
   `mines_map.json` through an adapter in `src/v2/map/data.ts` that fills lat/lon as null and positionQuality
   `"coalfield"`.
   - Layers: land and coal states, then the ink boundary (non-scaling stroke), then a `smogSlot` (a positioned div the smog canvas mounts into, Step 4), then the dots, then labels.
   - It exposes `MapApi` (Appendix I) through a ref: `flyTo(id, {offsetRight})`, `reset()`, `zoomBy(f)`, `getScreenPoint(id)`, `getTransform()`, and `onTransform(cb)` for the smog layer.
2. **Zoom:** d3-zoom on a `<g>`, scale 1 to 24, translate extent India plus 10%. Wheel, pinch and double-click work. Keyboard on the focused map: + / − / 0 and the arrow keys. Zoom buttons go in `src/v2/map/ZoomControls.tsx`.
3. **Fly-to:** Appendix F (`d3.interpolateZoom`, duration by distance). Interruptible: a new fly-to or a user drag cancels the old one from its current transform.
4. **Dots:** radius r / sqrt(k), band colours, hover scale 1.5, tooltip (name, company, type, run-out year, "Approximate position" when the position comes from the coalfield). The selected state has an ink ring and an italic label. Other dots go to 45% opacity when a mine is selected. Labels for the 12 largest mines in view at k ≥ 4, with greedy collision avoidance.
5. **Docking:** `dockProgress` (0 to 1) as a prop. Apply Appendix E with transforms on the map's outer wrapper only (no re-render per scroll frame: use a motion value or a ref style write).
6. **Accessibility:** the map is `role="application"` with a label. Dots are not tab stops; the search and the list are the keyboard path. The selected mine is announced in a polite live region.
7. **Performance:** render the static SVG once (memoised by data). Zoom writes one transform attribute. Measure a 60-frame wheel-zoom in the e2e spec and assert under 20 ms per frame (median).
8. **e2e:**
   - Zoom in and out with the buttons.
   - `flyTo('bccl-moonidih')` ends with Moonidih inside the left area.
   - Reduced motion jumps instead of flying.
   - No console errors.

Screenshots (at most 4): `v2-home-1440`, the zoomed Jharia view, a `--frames` contact sheet of the fly-to at 0,
0.3, 0.6, 0.9 seconds, and `v2-home-390`.
Done when: the e2e spec passes and fly-to feels continuous on the contact sheet (no jump between frames).

---

## Step 4: smog and motion engine

**Model: Opus 5.5 · Effort: high · Wave 1**
Owns: `src/v2/smog/**`, `src/v2/motion/**`, `e2e/v2/smog.spec.ts`, `tests/ui/v2/smog.test.ts`.
Reads: DESIGN_V2 "Motion" and "The smog" in full, Appendix D, Appendix I (`SmogApi`). Load the huashu-art-motion skill and
read only its SKILL.md and `references/04-纯代码绘制.md` (drawing in code) and `02-机制.md` (mechanisms). Use its rules:
one still frame first, a living picture, one palette, no blue-purple, judge by stills. Do not use its video pipeline:
no ffmpeg, no renders.

1. `src/v2/motion/tokens.ts` holds every timing, easing and spring from DESIGN_V2 (exported constants), plus `useReducedMotion()` and `useFrozenClock()` (reads `?freeze=`).
2. `src/v2/smog/engine.ts` is a framework-free canvas particle system implementing Appendix D:
   - a sprite cache
   - a seeded RNG (mulberry32)
   - 2D simplex noise (your own, about 60 lines) for curl drift
   - an emitter list
   - modes `overview`, `focus(id)` and `docked(id)`, with 600 ms eased transitions between them
   - the budget and auto-throttle
   - pause when hidden or off screen
   - `setClock` and a `renderStill(t)` for reduced motion and tests
3. `src/v2/smog/SmogLayer.tsx` mounts the canvas into the map's `smogSlot`, sized to it with DPR ≤ 1.5. It follows `MapApi.onTransform` so particles stay over their mines while zooming. Emitter positions are in map units; the transform converts them to screen space each frame.
4. **Design first, as the huashu rule says:** before tuning motion, render `renderStill(8)` for overview and focus and look at those two stills once (they count toward the 6). Adjust density and alpha until the coal belt reads as a thin warm haze and the focused plume as a small, clear column. Then check motion with one contact sheet.
5. **Tests:**
   - Unit tests: the seeded engine gives identical particle counts at t = 8s across runs; the particle cap holds; focus raises the selected emitter's share above 50% of live particles within 2s; reduced motion draws one frame and schedules no animation frames.
   - e2e: the canvas exists; on frozen t = 8 the centre of Jharia is darker than a point in Rajasthan (pixel sample).

Screenshots (at most 5): the overview still, the focus still, a docked still, one contact sheet (overview at 0, 2, 4
seconds), and `v2-home-390`.
Done when: the tests pass and the stills match DESIGN_V2: thin warm haze, no blue, a clear focused plume.

---

## Step 5: shell (nav with About menu, routes, search component, tokens)

**Model: Sonnet 5.5 · Effort: high · Wave 1**
Owns: `src/v2/shell/**`, `src/v2/search/**`, `src/app/router.ts`, `src/app/App.tsx`, `src/styles/tokens.css`
(add-only), `tests/ui/v2/search.test.ts`, `tests/ui/v2/nav.test.tsx`.
Reads: DESIGN_V2 "New tokens", "Search", "Copy"; Appendix G; `design/v2/V2-Nav-About.dc.html`;
the header part of `design/v2/V2-Home.dc.html`.

1. Add the DESIGN_V2 tokens to `tokens.css`.
2. `HeaderV2`: the wordmark, the "Research preview" pill, and nav links Map, Data and About. About is a menu button (Compare, Method, Assumptions, Sources, each with its one-line description, then "Version 1 site", linking to `/methane-ledger/`).
   - Menu behaviour: opens on click and Enter, arrow keys move, Esc closes and returns focus, click outside closes. It scales from 0.97 at its top-right origin, 150 ms.
   - The active section is marked with `aria-current`.
3. **Routes** (hash router, as v1):
   - `#/` → Home v2.
   - `#/mine/:id` → Home v2 with that mine selected.
   - `#/compare`, `#/method`, `#/assumptions`, `#/sources`, `#/data` → the existing pages wrapped in the v2 shell (Step 8 restyles them).
   - Unknown routes show the existing NotFound.
4. `src/v2/search/`:
   - `rank.ts` implements Appendix G (pure, tested).
   - `<MineSearch>` is a combobox (ARIA 1.2 pattern) with the top 8 results, keyboard support, "/" to focus, the "N of 311" count and the no-match message, styled as the mockup.
   - It calls `onSelect(id)`. It reads the v2 mines JSON through the Step 3 adapter.
5. **Tests:**
   - `rank("mo")` returns Moonidih first.
   - Accents and punctuation are ignored.
   - "colliery" is stripped.
   - A typo of one letter for names of 5 or more characters still matches.
   - The menu works by keyboard.
   - The routes resolve.

Screenshots (at most 2): the About menu open at 1440, and search with "mo" typed.
Done when: the tests pass, and the v1 pages still render inside the new shell.

---

## Step 6: home flow (select, panel, run, scroll choreography, phone)

**Model: Opus 5.5 · Effort: high · Wave 2**
Owns: `src/v2/home/**`, `src/v2/panel/**`, `e2e/v2/home.spec.ts`.
Reads: all of `design/v2/V2-Home.dc.html`, `V2-Mine-Open.dc.html` and `V2-Phone.dc.html` (skip SVG paths); DESIGN_V2
"Motion"; Appendix E; Appendix I. Reuse the v1 `AssumptionsPanel` (All assumptions sheet) and `useMineModel`
rather than rewriting them.

1. **Home** composes `HeaderV2`, `<MineMapV2>` (full viewport under the header), `SmogLayer`, the headline and lede, `<MineSearch>`, the compact legend card (counts from data) and the zoom controls, as in V2-Home. The load sequence follows DESIGN_V2 exactly.
2. **Selecting a mine** (search, map click or the `#/mine/:id` route):
   - `MapApi.flyTo(id, {offsetRight: panelWidth})`
   - smog `focus(id)`
   - the ripple
   - the URL updates
   - the panel slides in (V2-Mine-Open)
3. **Panel content**, prefilled from `pickMineInput` (Step 2):
   - the mine's facts and chips (band, type and gassiness grade, data tag "Estimated inputs" or "Illustrative inputs")
   - inputs: last year of mining (with basis buttons when the timeline has them), coal output, gassiness grade (I, II, III), drained gas, methane in ventilation air, power or flare, grant, and credit price chips
   - when `gemMethaneMm3` exists, a line "Global Coal Mine Tracker estimate: X Mm³ a year" with a "Use this" button that sets the total methane override
   - "Every assumption, all 103" opens the v1 sheet
   - "Run the model"
   For not-abatable and no-output mines, the panel shows the reason (from `estimate`) and the one input that would change it (for example "Set the gassiness grade or enter measured drained gas").
4. **Run** computes with `evaluate` and shows the result peek in the panel plus the scroll cue pill. The results section (Step 7's `<ResultsV2>`) mounts below the map. Input changes after the first run recompute live (debounced 150 ms); the URL keeps every input (reuse the v1 `url.ts` keys plus `m=<id>`).
5. **Scroll choreography:** Appendix E with `useScroll` and `useTransform` from motion. The map wrapper docks into the mini-map card, the smog switches to `docked(id)` at p ≥ 0.98 and back below 0.95 (hysteresis), and the card links back to the map (scrolls to top). Fully reversible.
6. **Close** (× or Esc): the reverse path, `reset()` to the previous transform, smog `overview`.
7. **Phone** (< 768px) follows V2-Phone:
   - search on top
   - a bottom sheet instead of the side panel, with three snap points: peek 180px, half, full; drag with velocity projection and rubber-banding, per apple-design
   - results below the sheet
   - docking scaled to an 120px card
8. **e2e:**
   - Type "moo" and press Enter: the panel opens, the URL has the mine, and Run shows a break-even equal to the golden for the Moonidih record (3.37).
   - Choose AMP Colliery: it shows the estimate's break-even (4.49).
   - Choose an opencast mine: it shows "not abatable".
   - Scroll to the results: the mini map is visible at top right.
   - Scroll up: the mini map is gone and the map is full.
   - Esc closes.
   - With reduced motion: no fly-to, and docking is a crossfade.

Screenshots (at most 6): `v2-home-1440`, `v2-mine-1440`, a contact sheet of the docking at p = 0, 0.5 and 1,
`v2-results-1440` (top only), `v2-home-390`, and the phone with the sheet at half.
Done when: the e2e spec passes and the screens match the mockups (say where they differ and why).

---

## Step 7: results dashboard

**Model: Opus 5.5 · Effort: high · Wave 2**
Owns: `src/v2/results/**`, `e2e/v2/results.spec.ts`.
Reads: all of `design/v2/V2-Results.dc.html`; DESIGN_V2 "Motion" (chart rows); Appendix C; Appendix I
(`ResultsProps`). Reuse the v1 chart maths (`src/components/charts/*`, waterfall, tornado, financing) and restyle them;
do not rewrite the model.

1. `<ResultsV2 {...ResultsProps}>` renders, in order:
   1. the sticky summary bar (name, input chips, "Edit inputs", which scrolls back up and focuses the panel)
   2. the headline (break-even, verdict, sentence)
   3. the price ruler
   4. five metric tiles
   5. **the closure-year chart** (new, Appendix C): break-even by last year of mining, engines against flare, with the crossover shaded and labelled, market reference lines at $7 and $11, the mine's own point ringed, and off-scale values noted
   6. credits each year
   7. what the break-even is made of
   8. who could pay (the five structures as break-even bars against your price)
   9. what moves it most
   10. the footnote
   Desktop is a two-column grid as in the mockup. Below 900px it is one column.
2. **Reveal:** charts draw once when 40% visible, with numbers counting up once (DESIGN_V2). A re-run morphs values in 200 ms. Each chart has a hidden data table and an aria-label.
3. **Leave room for the docked mini map:** the first 220px from the right of the top 240px stay clear.
4. **e2e** (render `ResultsV2` with the Moonidih record, through a test route `#/__results?m=bccl-moonidih` that exists only in dev and test builds):
   - The closure chart's crossover label reads 2031.
   - The five structures show A $3.37, B $8.21, C $3.65, D $0.00 and E (30%) −$0.91 at the defaults.
   - Reduced motion shows final values immediately.

Screenshots (at most 4): `v2-results-1440` (full page), `v2-results-390`, a contact sheet of the reveal at 0, 0.4 and 0.8
seconds, and the closure chart alone at 2x for a crispness check.
Done when: the e2e spec passes and the numbers trace to `evaluate` and `closureCurve` (list the bindings in the PR).

---

## Step 8: About pages, Compare for all mines, Data page

**Model: Sonnet 5.5 · Effort: high · Wave 2**
Owns: `src/v2/pages/**`, `e2e/v2/pages.spec.ts`. You may edit the existing `src/pages/{ComparePage,MethodPage,
AssumptionsPage,SourcesPage,DataPage}/**` only to wrap or restyle them for v2.
Reads: Appendix B, DESIGN_V2 "Copy", `design/v2/V2-Nav-About.dc.html`.

1. **Compare** (under About): the supply curve now covers every modelled mine (58 estimated ok mines, with Moonidih
   from its record) plus the five archetypes as an optional toggle.
   - Bar labels for the 10 cheapest.
   - Hover shows the mine.
   - Clicking a bar opens `#/mine/:id`.
   - A filter by subsidiary.
   - The headline sentence is computed (at $15: the paying count and Mt cut).
   - A side-by-side comparison of up to 3 mines, as in v1.
2. **Method:** add a section "How every mine gets inputs" in plain language (Appendix B in five bullets: output and closure year are real; gassiness from the coalfield until DGMS data; methane = output × emission per tonne; Global Coal Mine Tracker comparison; why opencast and Degree I are not abatable). Add a section "Mine positions" (GEM coordinates where matched, coalfield otherwise, the match count from Step 1's report).
3. **Assumptions:** add the estimation parameters table (`data/estimation.json`) with sources and quality tags.
4. **Sources:** add the Global Energy Monitor Global Coal Mine Tracker (with its licence line from `data/raw/gem/README.md`) and the estimation note.
5. **Data:** the upload templates gain the optional columns `degree` and `methane_mm3`. Uploaded values override the estimate for that mine in this session.
6. **e2e:**
   - Every About route renders inside the v2 shell.
   - Compare shows 4 paying mines at $15 and 1 at $7.
   - Clicking the cheapest bar opens AMP Colliery.
   - No em dashes or all-caps labels in the new copy (text scan).

Screenshots (at most 3): `v2-about-1440` (Method), `v2-compare-1440`, Compare at 390.
Done when: the e2e spec passes.

---

## Step 9: QA, performance, accessibility, motion polish, release

**Model: Sonnet 5.5 · Effort: high · Wave 3**
Owns: fixes anywhere in `src/v2/**` and `e2e/v2/**`; no new features.

1. Run `npm run check`, `npx playwright test e2e/v2` and `npm run golden:check`; all must be green.
2. **Performance**, on the production build (`npm run build:v2 && npx vite preview --base /methane-ledger/v2/`) with Lighthouse once on home and once with a mine selected:
   - desktop performance ≥ 90, accessibility ≥ 95
   - main bundle ≤ 220 kB gzipped (report it)
   - the smog under 4 ms per frame median over 300 frames (use `performance.now()` around the engine tick through `?perf=1`)
3. **Accessibility:**
   - The keyboard path: "/" to search, select, the panel, Run, results, Esc.
   - Focus is always visible.
   - The screen reader hears the selected mine and the result.
   - 4.5:1 contrast on glass controls over the darkest smog.
   - 200% zoom.
   - Reduced motion and reduced transparency.
4. **Motion polish:**
   - One contact sheet each for load, fly-to, docking and chart reveal.
   - Check against DESIGN_V2: no jumps, no scale-from-zero, nothing faster than its token, no simultaneous competing animations on load.
5. **Links:**
   - `/v2/#/mine/bccl-moonidih` works on a hard reload.
   - The About menu's "Version 1 site" opens the root.
   - The v1 site at the root is untouched (curl the root and the `#/` HTML title).
6. **Screenshots** (at most 8): the four contact sheets, plus `v2-home-1440`, `v2-results-1440`, `v2-home-390` and `v2-compare-1440`.
7. Open the PR into `v2` with a QA table (check, result, fix). The conductor merges it; the deploy publishes `/v2/`.

Done when: every check in the QA table passes or has a fix, and `/v2/` is live.

---

## When you are ready to replace v1 (by hand, later)

1. Open a PR from `v2` into `main`.
2. In `vite.config.ts` on `v2`, the default base is already `/methane-ledger/`, so the root build serves v2. Remove the
   v2 job from `deploy.yml` in that PR, or keep it so `/v2/` mirrors the root.
3. Merge it. Keep the tag `v1-final` on the old `main` commit (`git tag v1-final <sha> && git push origin v1-final`) so
   v1 can be rebuilt any time.

---

## Appendix A: positions and projection

- Projection (same as v1): x = (lon − 68) × cos(22°) × 33, y = (37.2 − lat) × 33, viewBox 0 0 906 1016.
- GEM coordinates are WGS84 decimal degrees. Moonidih in GEM: 23.740882, 86.352473 (exact), which projects to
  x ≈ 561.4, y ≈ 444.2. Its v1 coalfield placement is 561.0, 444.3, so expect small shifts for matched mines.
- Unmatched mines keep the v1 coalfield placement (centroid plus md5 jitter) and `positionQuality: "coalfield"`.

## Appendix B: estimated inputs for every mine (`reference/ref_v2.py`; goldens `tests/golden/estimation_v2.json`)

The rule is **measured beats estimated**: a record in `data/mines.json` (Moonidih) always wins over the estimate.

| Input | Estimate | Source |
|---|---|---|
| Coal output P | FY2025-26 output (`rateUsedMtPerYr`), held flat to closure | Closure workbook v5 (real) |
| Last year of mining | Run-out year; "After 2225" runs past the window | Closure workbook v5 (real) |
| Underground share | UG 100%, Mixed 50%, OC 0 | Estimated |
| Gassiness grade | Jharia 3; Raniganj, East Bokaro, West Bokaro and Mugma 2; every other coalfield 1 | Estimated, until a mine-wise DGMS list |
| Methane per tonne (SE) | Grade I 0.8, II 5, III 15 m³/t; opencast 0.3 | v1 archetypes |
| Drained share / CH4 share | I 0 / –; II 0.30 / 35%; III 0.50 / 50% | v1 archetypes |
| Ventilation-air CH4 share | I 0.05%; II 0.2%; III 0.4%; opencast 0 | v1 archetypes |
| After closure | q0 = 0.30 × total; 60% CH4; 70% captured; decline as v1 | v1 |
| Capture | drained 100%, ventilation 85% | v1 |

Equations:

- total methane (Mm³ a year) = P × underground share × SE
- drained = total × drained share
- ventilation methane = total × (1 − drained share)
- active years = clamp(closure − 2027 + 1, 0, N)
- streams: as v1 archetypes, with drained gas going to power when its CH4 share is ≥ 30%, otherwise to a flare

Status rules:

- **no_output**: P is 0 or missing. Reason: "No recent output. Enter coal output to model this mine."
- **not_abatable**: no stream qualifies. That is opencast, or Degree I (ventilation air 0.05% < 0.2% and no drained gas). Each has a reason string.
- **closure_uncertain warning**: status "Past reported reserve", or a run-out before 2027. The closure is then set to 2027.
- Everything else is **ok**.

Golden summary (all 311 mines, default settings, India cost build-up):

| Measure | Value |
|---|---|
| ok / not abatable / no output | 58 / 211 / 42 |
| Paying at $15 / at $7 | 4 / 1 |
| Cheapest | AMP Colliery $4.49 (estimate; Mixed, Jharia, closes 2072), then NAKC $8.51, Moonidih (estimate) $11.77, Jhanjra $14.94 |
| Moonidih | Estimate $11.77, but its record (used in the app) $3.37. The record's placeholder drained gas (20 Mm³) is far above the estimate (2.9 Mm³), which is exactly why measured data matters. |
| Small mines | Very small mines (0.05 Mt a year) break even above $100: fixed costs (monitoring, verification, grid) dominate. |

## Appendix C: closure-year curve

- For each closure year y from 2027 to 2027 + N − 1: break-even with drained and after-closure gas to power, and with
  them to a flare. Everything else stays at the current settings.
- The crossover year is the first y where power ≤ flare.
- Goldens (Moonidih record, India costs):
  - power: 43.31, 24.96, 16.44, 11.54, 8.38, 6.19, 4.58, 3.37, 2.44, 0.32
  - flare: 24.44, 16.61, 12.98, 10.89, 9.55, 8.61, 7.93, 7.41, 7.01, 6.59
  - crossover 2031
  - AMP Colliery estimate crossover: 2032
- Chart: y axis capped at $30 with an "off the scale" note; the mine's actual closure point is ringed.

## Appendix D: smog maths (DESIGN_V2 "The smog" gives the look)

- **Emitter strength:** s_i = log10(1 + methane_i) / max over mines of log10(1 + methane), with a floor of 0.08
  (opencast and Degree I) and 0.05 for closed mines.
- **Spawn:**
  - Overview: Poisson with rate λ_i = 0.6 × s_i particles a second.
  - Focus: λ_sel × 5, λ_other × 0.3.
  - Docked: only the selected mine, λ = 1.2.
  - Mode changes ease the multipliers over 600 ms (`--ease-out`).
- **Particle state:** position p (map units), age a, life L ∈ [4, 9] s, seed.
  - Velocity v = wind (3 px/s toward east-north-east, so (2.8, −1.0) in screen space) + rise (0, −r), r ∈ [8, 14] px/s.
  - Curl noise: curl(simplex(p × 0.004, t × 0.15)) × 6 px/s.
  - Speed is clamped to 20 px/s.
- **Look:** size(a) = 4 + 18 × easeOut(a / L) px (docked: 2 + 6 ×). Alpha(a) = maxAlpha × sin(π a / L), with maxAlpha = 0.04 + 0.06 × s_i (focus 1.3×, capped at 0.10). Colour rgba(110, 101, 86, alpha). Draw with `globalCompositeOperation = 'multiply'` on the paper.
- **Budget:** 700 live particles (220 below 768px). If over budget, skip spawns, lowest strength first.
- **Throttle:** three frames over 20 ms in a row halves all λ until 60 frames under 12 ms.
- **Still frame:** simulate deterministically from t = 0 to t = 8 at a fixed dt of 1/30 with the seed, then draw.

## Appendix E: scroll docking

- **Progress:** p = clamp((scrollY − (resultsTop − viewportH)) / viewportH, 0, 1), smoothed by a spring (stiffness 300, damping 40, mass 1).
- **Map wrapper:**
  - scale s(p) = lerp(1, miniW / mapW, e(p)), with e = easeInOut cubic-bezier(.77, 0, .175, 1)
  - translate so that its top-right corner lerps from its rest position to (viewportW − 24, 16)
  - `transform-origin: top right`
  - corner radius lerps 0 to 16px (on an inner clip), the shadow fades in after p > 0.9
- **The results sheet** scrolls naturally above the map (higher z), with 24px top radius and the shadow
  `0 -24px 60px rgba(26,25,22,.12)`.
- **Docked:** at p ≥ 0.98 the wrapper is `position: fixed` in its final place and becomes a link back to the top. Below 0.95 it is in flow again (hysteresis).
- **Phone:** miniW is 120px, and the dock target is (viewportW − 12, 12).
- **Reduced motion:** no transform; at p ≥ 0.5 the full map fades out and the mini card fades in (150 ms).

## Appendix F: fly-to

- **Target:** k = 6, the mine at the centre of the visible map area, x_c = (viewportW − panelW) / 2, y_c = headerH + (viewportH − headerH) / 2. On phones, y_c sits above the sheet's peek.
- **Path:** `d3.interpolateZoom([x0, y0, w0], [x1, y1, w1])` with `.rho(1.2)`. Duration = clamp(interp.duration × 0.6, 500, 900) ms. Easing is the path's own (van Wijk); add no extra easing.
- **Interrupt:** any wheel, drag or new fly-to cancels it at the current transform.
- **Reduced motion:** set the transform directly, with a 150 ms crossfade of the dots layer.

## Appendix G: search normalisation and ranking

- **Normalise:**
  - lower-case
  - strip accents (NFKD) and punctuation
  - collapse spaces
  - remove the tokens colliery, project, mine, mines, ug, oc, ocp, ocm, incline, pit, expn and expansion, except when the query itself contains them
- **Fields:** name (weight 1.0), company (0.6), state (0.5), coalfield name (0.5).
- **Score per field:** exact 100, prefix 80, word-prefix 60, substring 40, Damerau-Levenshtein distance 1 for queries ≥ 5 characters 25. The total is the best field score × its weight.
- **Ties:** first the closing-soonest band, then the shorter name, then alphabetical.
- **Show** the top 8. "N of 311" counts all matches.

## Appendix H: `.github/workflows/deploy.yml` (on `main` and on `v2`)

```yaml
name: Deploy
on:
  push:
    branches: [main, v2]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: main, path: v1 }
      - uses: actions/setup-node@v4
        with: { node-version-file: v1/.nvmrc }
      - run: npm ci && npm run build
        working-directory: v1
      - id: hasv2
        working-directory: v1
        run: |
          if git ls-remote --exit-code --heads origin v2 >/dev/null; then echo "yes=true" >> "$GITHUB_OUTPUT"; else echo "yes=false" >> "$GITHUB_OUTPUT"; fi
      - if: steps.hasv2.outputs.yes == 'true'
        uses: actions/checkout@v4
        with: { ref: v2, path: v2 }
      - if: steps.hasv2.outputs.yes == 'true'
        run: npm ci && npm run build
        working-directory: v2
        env: { BASE_PATH: /methane-ledger/v2/ }
      - run: |
          mkdir -p site && cp -r v1/dist/. site/
          if [ -d v2/dist ]; then mkdir -p site/v2 && cp -r v2/dist/. site/v2/; fi
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Appendix I: `src/v2/contracts.ts` (Step 0 writes it verbatim)

```ts
import type { Result, MineInput } from '../model/types';

export type MineId = string;
export type PositionQuality = 'gem' | 'coalfield';
export interface MineV2 {
  id: MineId; name: string; company: string; state: string; type: 'UG' | 'OC' | 'Mixed'; field: string;
  band: 'by2031' | 'by2036' | 'by2050' | 'after2050' | 'nodate'; runoutYear: number | null; runoutLabel: string;
  x: number; y: number; lat: number | null; lon: number | null; positionQuality: PositionQuality;
  gemMethaneMm3: number | null; searchKey: string;
}
export interface MapTransform { k: number; x: number; y: number }
export interface MapApi {
  flyTo(id: MineId, opts?: { offsetRight?: number; offsetBottom?: number }): Promise<void>;
  reset(): Promise<void>;
  zoomBy(factor: number): void;
  getScreenPoint(id: MineId): { x: number; y: number } | null;
  getTransform(): MapTransform;
  onTransform(cb: (t: MapTransform) => void): () => void;
}
export type SmogMode = { kind: 'overview' } | { kind: 'focus'; id: MineId } | { kind: 'docked'; id: MineId };
export interface SmogApi {
  setMode(mode: SmogMode): void;
  setClock(now: () => number): void;
  renderStill(tSeconds: number): void;
  destroy(): void;
}
export interface ResultsProps {
  mine: MineV2; input: MineInput; result: Result; source: 'record' | 'estimate';
  priceUsdPerT: number; onEditInputs(): void;
}
export interface SelectionState { id: MineId | null; ran: boolean }
```

## Appendix J: what you get at the end

- `/methane-ledger/` shows v1, unchanged.
- `/methane-ledger/v2/` shows the map-first app:
  - every Coal India mine searchable
  - 58 mines modelled on estimated inputs, plus Moonidih from its record
  - the live smog from the mines
  - fly-to, the inputs panel and the results with the closure-year chart
  - the docked mini map
  - About (Compare, Method, Assumptions, Sources), and Data
- A final report from the conductor, with any `blocked` items and what they need.

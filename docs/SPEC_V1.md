# Coal Mine Methane Credit Tool: Build Specification

Nov 8, 2026 · @Aashish Yadav

## Purpose

The tool answers one question for each Coal India mine: **what carbon credit price makes methane abatement here break even?** On the dummy inputs in this spec, Moonidih breaks even at about **$8.3 per tCO2e**. It earns an NPV of about $8.7M at $15/t and stays positive down to about $10/t.

It is a scenario model in the spirit of [Chargeline](https://aashishyadav-312.github.io/ercot-battery-backtester/): a static website where a user picks a mine, adjusts assumptions and sees the answer change. Unlike Chargeline it does not replay market data. It projects 10 to 15 years of cash flows from gas, technology, cost and price assumptions.

**Who uses it and for what**

| User | Decision it supports |
| --- | --- |
| Coal India and CMPDI planners | Which mines to put forward for a pilot, and with which technology |
| BCCL and other subsidiary teams | Whether a specific mine pays back, and under which financing structure |
| Buyers, developers, World Bank | What price or price floor makes a Coal India project bankable |
| Duke team (Sandeep, Brian, Aashish) | What to show and recommend at the Ranchi workshop on 22 January 2027 |

**What v1 must deliver before 22 January 2027**

- Moonidih as a fully worked case, with every assumption visible and editable.
- Five mine archetypes (Degree I, II, III underground, a closing Degree III mine, opencast) ranked on an abatement supply curve.
- Break-even price, NPV, IRR, payback and tonnes, by gas stream and for the whole mine.
- Price scenarios labelled by whether Coal India can actually sell there.
- Five financing structures, so the numbers show what Coal India itself earns.
- A CSV upload so CMPDI data can replace dummies without code changes.

Every number marked **DUMMY** in this spec is a placeholder. The figures are internally consistent: they come from a Python reference model (Section "Model specification") whose outputs are the golden test values for the website.

## Core concepts and units

The model treats a mine as up to three gas streams, each with its own technology and economics. Everything else in the tool follows from that split.

**The three gas streams**

| Stream | What it is | Typical CH4 share | Technology in the model | Revenue besides credits |
| --- | --- | --- | --- | --- |
| Drained gas | Gas pulled from seams or goaf through boreholes and a vacuum pump, before or during mining | 30 to 90% | Gas engines for power (if 30% or more), else enclosed flare | Electricity, or gas sales |
| Ventilation air methane (VAM) | Methane carried out in the main mine ventilation air | 0.1 to 1% | Regenerative thermal oxidiser (RTO) if 0.2% or more; otherwise not abatable in v1 | None in v1 |
| Abandoned mine methane (AMM) | Gas that keeps seeping from sealed workings after closure, declining each year | 30 to 80% | Gas engines, else flare | Electricity |

**Definitions the code must use**

- **DGMS degree of gassiness** (underground mines): Degree I under 1 m3 CH4 per tonne of coal; Degree II 1 to 10; Degree III over 10. The unit is cubic metres per tonne, not tonnes per tonne.
- **Specific emission (SE)**: m3 of CH4 liberated per tonne of coal mined. Note: Mt of coal × m3/t = million m3 (Mm3) of CH4.
- **Methane density**: 0.67 kg/m3 at 20°C and 1 atm, the ACM0008 convention. So 1 Mm3 CH4 = 670 t CH4.
- **Energy content**: 50 GJ per t CH4 (lower heating value).
- **Combustion CO2**: burning 1 t CH4 makes 44/16 = 2.75 t CO2. This is subtracted from credited reductions.
- **GWP100**: default 28 (IPCC AR5). Switchable to 29.8 (AR6, fossil methane) and 21 (legacy CDM, for comparing with old studies). Verra and CCTS rules set which one applies; keep it a setting.
- **Net reduction per tonne destroyed**: GWP − 2.75. At GWP 28 that is 25.25 tCO2e per t CH4.
- **Rule of thumb for checks**: 1 Mm3 CH4 destroyed ≈ 670 × 25.25 ≈ 16,900 tCO2e.
- **Degree III scale check**: 10 m3/t × 0.67 kg/m3 = 6.7 kg CH4 per tonne of coal ≈ 0.19 tCO2e per tonne. A 1 Mt/yr Degree III mine liberates at least about 190,000 tCO2e a year.
- **Crediting period**: CCTS allows 10 years fixed or 5 years renewable twice (15 years). Verra non-forestry projects use 10 years fixed or 7 years renewable twice. The tool defaults to 10 years.
- **Regulatory surplus**: a reduction the law already requires cannot earn credits. Drainage is mandated for safety in Degree II and III mines; destroying or using the drained gas is not. Each stream carries a "destruction mandated" flag that sets its credits to zero.
- **Break-even credit price (levelised cost of abatement)**: the credit price at which NPV = 0. Negative means the project pays for itself on energy revenue alone.

## How the model works

&#91;embedded content: model flow · inputs to three gas streams to one break-even price\]

Each stream is costed and credited on its own, then summed. The closure year decides which years have drained gas and VAM, and which have only abandoned mine methane. The financing choice changes who carries the cost, not how many tonnes are cut.

## Model specification

The model is a pure function: `evaluate(mine, settings) → results`. It runs year by year over the crediting window. All money is in real US dollars with an INR display toggle; all volumes are Mm3 of pure CH4.

### 1. Mine timeline

- `start_year` (default 2027) is year 1 of crediting. `crediting_years` = 10 (or 15).
- `closure_year` comes from the reserve-exhaustion workbook (CIL\_Mine\_Closure\_Timeline\_v5.xlsx), overridable by the user. Years up to closure are **active**; years after are **post-closure**.
- `active_years = min(closure_year − start_year + 1, crediting_years)`; `post_years = crediting_years − active_years`.

### 2. Gas liberated per year (active years)

- Total liberated: `L = P × SE`, where P is coal production (Mt/yr) and SE is specific emission (m3/t). Result in Mm3 CH4/yr.
- Drained: `L_d = L × d`, where d is the drainage share (0 to 1). Ventilated: `L_v = L × (1 − d)`.
- A mine record can instead give `L_d` and `L_v` directly (measured data beats derived data). If both are given, measured wins.
- Production can be a year-by-year series; if only one number is given, hold it flat until closure.

### 3. Post-closure abandoned mine methane

Hyperbolic decline, the standard form used in US EPA abandoned-mine work:

```latex
q(t) = \frac{q_0}{(1 + b D t)^{1/b}}, \quad t = 1, 2, \ldots \text{ years after closure}
```

- `q0 = f_amm × L_last`, where `L_last` is total liberation in the last active year. Defaults (DUMMY): `f_amm = 0.30`, `D = 0.25 /yr`, `b = 1`.
- A flooding toggle multiplies `q(t)` by a flooding factor (DUMMY 0.5) from a user-set year. Flooded mines emit less and are harder to capture.
- For mines already closed before `start_year`, the user enters `q0` directly and years since closure.

### 4. Technology choice per stream

Default rule, user-overridable per stream:

1. Drained or AMM gas with concentration ≥ 30% and an offtake available → **power** (gas engines).
2. Drained or AMM gas ≥ 25% without offtake, or user choice → **enclosed flare**.
3. VAM with concentration ≥ 0.2% → **RTO**. Below 0.2% → not abatable in v1 (shown as "needs enrichment").
4. Gas between 5% and 15% is in the explosive range: the tool must never offer to transport or use it; flag it as a safety warning.

Capture efficiency (share of the stream actually collected) is per stream. Defaults (DUMMY): drained 1.0, VAM 0.85 (some shafts not connected), AMM 0.70.

### 5. Technology library (all DUMMY, to be replaced with vendor quotes)

| Technology | Destruction efficiency | Capex basis | Opex basis | Other |
| --- | --- | --- | --- | --- |
| Gas engines (power) | 99.5% | $1,300 per kW installed | $15 per MWh generated | Electrical efficiency 38%, availability 90% |
| Enclosed flare | 98% (CDM conservative default is 90%; let the user pick) | $40,000 per Mm3/yr of capacity | 5% of capex per year | — |
| RTO for VAM | 97% | $60,000 per m3/s of ventilation air treated | 6% of capex per year + fan power 60 MWh per m3/s per year | Minimum 0.2% CH4 |
| Drainage system | — | $250,000 per Mm3/yr of drained capacity | 4% of capex per year | Only if the mine has no drainage today |
| Monitoring kit | — | $250,000 per project | — | Flow meters, CH4 analysers |

Sizing rules:

- Power capacity (kW) = peak captured CH4 (t) × 50 GJ/t × 0.38 ÷ 3.6 (GJ per MWh) × 1,000 ÷ (8,760 × availability).
- RTO airflow (m3/s) = peak captured VAM (m3 CH4/yr) ÷ VAM concentration ÷ 31,536,000 s.
- Capex is sized on the peak year and gets a contingency of 15% (DUMMY).
- **Equipment reuse (v1.1)**: engines installed for drained gas can be redeployed to AMM after closure. v1 costs them separately; v1.1 adds a toggle that charges only the extra capacity.

### 6. Emission reductions

For each stream and year:

```latex
ER_{s,t} = V_{s,t} \times c_s \times 670 \times DE_s \times (GWP - 2.75)
```

where V is liberated CH4 (Mm3), c is capture efficiency, 670 converts Mm3 to t, and DE is destruction efficiency. If the stream's "destruction mandated" flag is on, ER = 0.

- v1 credits methane destruction only. ACM0008 also allows credit for grid electricity displaced; add it in v1.1 as a toggle (`grid_ef` in tCO2/MWh), off by default because the high-integrity label is stricter.
- Project electricity use (RTO fans) is a cost in v1; v1.1 also deducts its emissions.

### 7. Revenues

- **Credits**: `credit_rev_t = ER_t × (price_t × (1 − broker_share) − issuance_fee)`. Defaults (DUMMY): broker share 5%, issuance fee $0.20 per credit. `price_t` comes from the price scenario, flat or escalating at a set % per year.
- **Electricity**: `MWh_t = captured t × 50 × 0.38 ÷ 3.6`; revenue = MWh × power price (DUMMY $80/MWh, the avoided cost of grid power at the mine).
- **Gas sales (v1.1)**: MMBtu × gas price (DUMMY $7/MMBtu), for pipeline or CNG offtake instead of power.

### 8. Costs

- Capex in year 0: stream capex + monitoring kit, all with contingency.
- Opex each year: per technology (Section 5) + drainage opex.
- MRV each year: verification $50,000; validation $80,000 once in year 1 (DUMMY).
- v1 is pre-tax. v1.1 adds corporate tax (25.17% for Indian companies under the new regime) and straight-line depreciation; confirm the rate with Coal India's finance team.

### 9. Financial metrics

- Cash flow: `CF_0 = −capex`; `CF_t = credit_rev_t + energy_rev_t − opex_t − MRV_t` for t = 1 to N.
- **NPV** at the real discount rate r (DUMMY 10%). **IRR** by bisection. **Payback** = first year cumulative cash turns positive.
- **Break-even credit price** (the headline):

```latex
P^{*} = \frac{\dfrac{\text{Capex} + \sum_t \dfrac{\text{Opex}_t + \text{MRV}_t - \text{EnergyRev}_t}{(1+r)^t}}{\sum_t \dfrac{ER_t}{(1+r)^t}} + \text{fee}}{1 - \text{broker share}}
```

- Report P\* for the whole project and for each stream on its own (stream P\* excludes shared monitoring and MRV costs). Streams with negative P\* pay for themselves.

### 10. Financing structures (who pays, who earns)

Each structure transforms the project cash flow into Coal India's cash flow. The tool shows both views.

| Structure | Coal India pays | Coal India receives | Parameters (DUMMY) |
| --- | --- | --- | --- |
| A. Self-funded | All capex and opex | All revenue | — |
| B. Developer builds, owns, operates | Nothing | Royalty = share of gross revenue | Royalty 10%; developer's own hurdle IRR 15% shown separately |
| C. Forward sale (prepayment) | All capex and opex | Upfront cash for the first k years of credits at a discount | k = 3 years, discount 30% to the scenario price |
| D. Price floor (World Bank-style put) | All capex and opex, plus option premium | max(market price, floor) on covered volume | Floor $10/t, premium $0.50/t, covers 100% of first 5 years |
| E. Grant or viability gap funding | Capex net of grant, and opex | All revenue | Grant 30% of capex |

Rule: structure B is evaluated from the developer's side first. If the developer's IRR is below its hurdle at the chosen price, the tool says "no developer would take this at this price" instead of showing a royalty.

### 11. Settings with defaults

| Setting | Default | Range in UI |
| --- | --- | --- |
| Credit price | $15/t | $0 to $60 |
| Price escalation | 0% per year | −5% to +10% |
| Real discount rate | 10% | 4% to 16% |
| GWP100 | 28 | 21, 28, 29.8 |
| Crediting period | 10 years | 10 or 15 |
| Power price | $80/MWh | $40 to $140 |
| USD to INR | 85 (DUMMY; update at build) | free |
| Contingency | 15% | 0 to 40% |

### 12. Reference implementation

The Python file `cmm_model.py` (in the Appendix, and to be committed under `/reference` in the repo) implements Sections 1 to 9 for drained, VAM and AMM streams with power, flare and RTO. Claude Code ports it to TypeScript and must reproduce its outputs to within 0.5% (the golden tests in "Validation and test plan"). Financing structures (Section 10), gas sales, taxes and equipment reuse are new in the TypeScript build.

## Price scenarios

The price picker shows every benchmark, but each one carries a badge saying whether Coal India can sell there. Only Verra is sellable today; CCTS is the likely second market; the rest are benchmarks. Prices below are from our research doc (August to October 2026) and must be refreshed at build time.

| Scenario id | Label in UI | Price used (USD/tCO2e) | Badge | Note |
| --- | --- | --- | --- | --- |
| `vcm_low` | Voluntary market average | 7 | Sellable now (Verra) | All credit types, Q3 2026; a floor for a weak sale |
| `ccts_floor` | CCTS floor (our estimate) | 11 | Sellable later (CCTS) | Mid-point of our $10 to 12 estimate |
| `ca_offset` | California offsets, out-of-state | 18.25 | Benchmark only | US projects only |
| `ccp_premium` | High-integrity CMM credit (our estimate) | 15 | Sellable now (Verra) | **Default.** Between the voluntary average and California offsets |
| `ca_allowance` | California allowances | 33.40 | Benchmark only | Compliance price, not an offset price |
| `ccts_ceiling` | CCTS forbearance (our estimate) | 30 | Sellable later (CCTS) | Mid-point of our $25 to 35 estimate |
| `eu_ets` | EU allowance (via CBAM price) | 95 (€82.32 at 1.15) | Benchmark only | EU ETS does not accept international offsets |
| `custom` | Custom | user input | — | Slider $0 to $60 |

The chart for each mine marks the break-even price against these scenario lines, so a user sees at a glance which markets would make the mine pay.

## Mine archetypes

On dummy inputs, a Degree III mine with ten years left breaks even at about $3.6/t, but the same mine closing in four years needs about $12.2/t. Degree I and opencast mines have no stream the model can abate. Archetypes stand in for real mines until CMPDI data arrives.

**Inputs (all DUMMY)**

| Archetype | Coal (Mt/yr) | SE (m3/t) | Drained share | Drained CH4 % | VAM CH4 % | Active years in 10-yr window |
| --- | --- | --- | --- | --- | --- | --- |
| Degree I underground | 0.5 | 0.8 | 0 | — | 0.05 | 10 |
| Degree II underground | 0.5 | 5 | 0.30 | 35 | 0.20 | 10 |
| Degree III underground | 0.5 | 15 | 0.50 | 50 | 0.40 | 10 |
| Degree III, closing in 4 years | 0.5 | 15 | 0.50 | 50 | 0.40 | 4 (then AMM) |
| Opencast | 5.0 | 0.3 | 0 | — | — | 10 |

**Outputs from the reference model** (price $15/t, 10% discount, GWP 28)

| Archetype | Capex ($M) | Year-1 reductions (tCO2e) | 10-yr reductions (tCO2e) | Break-even ($/t) | NPV at $15 ($M) | Stream break-evens ($/t) |
| --- | --- | --- | --- | --- | --- | --- |
| Degree III underground | 5.59 | 115,430 | 1,154,302 | 3.61 | 7.68 | drained −3.80; VAM 9.74 |
| Degree III, closing in 4 years | 6.43 | 115,430 | 551,398 | 12.23 | 1.08 | drained 5.45; VAM 16.71; AMM 4.64 |
| Degree II underground | 2.60 | 37,035 | 370,345 | 15.28 | −0.06 | drained −3.80; VAM 19.49 |
| Degree I underground | — | — | — | not abatable | — | VAM below 0.2% |
| Opencast | — | — | — | not abatable | — | no captured stream |

What this shows the tool must handle:

- **Closure timing dominates.** The closing Degree III mine has the same gas but half the credited tonnes, so its break-even rises from $3.6 to $12.2. This is why the closure date from the reserve workbook is a core input.
- **Drained gas used for power pays for itself** in a mine that runs the full window (−$3.80/t). VAM costs more per tonne and needs credits.
- **Degree II sits on the edge** at $15/t. Small changes in VAM concentration or capex flip it.
- **Opencast and Degree I mines drop out.** Our closure analysis found most mines reaching end of reserve by 2030 are opencast, so the tool will likely recommend a small set of gassy underground mines. That targeting is the point, not a flaw.

The opencast and Degree I results reflect v1's technology list. Opencast methane is diffuse and hard to capture; a v2 could add surface pre-drainage wells ahead of the highwall, which Verra's ACM0008 revisions allow.

## Moonidih worked case

On dummy inputs, Moonidih needs $24.2M of capex, cuts about 1.82 MtCO2e over ten years and breaks even at **$8.33/t**. Its IRR at $15/t is 23.7%. It is the right first case: it is a known Degree III mine, has been studied before, and its small remaining reserve makes it both an active-mine and a closing-mine story.

### What we know (sourced)

- BCCL's Moonidih underground mine in Jharia coalfield, started 1965, deeper than 600 m, **Degree III gassy**, longwall with caving, 67 sealed-off goaf areas ([Prusty, Patra and Harpalani, GMI](https://development.globalmethane.org/expo-docs/canada13/coal_24_Prusty_Presentation.pdf)).
- The GMI project profile describes a 12 km2 CMM block with 950 Mt of coal resource, 7.8 bcm of gas resource and average gas content above 10 m3/t. It projected ventilation emissions of 6.32 Mm3/yr at 1.1 Mt/yr of coal, drainage recovery ramping to 78 Mm3/yr, about 1.109 MtCO2e a year of reductions and about $20M of capex ([GMI Moonidih profile](https://development.globalmethane.org/expo-docs/posters/CoalMines/CM_IN_Project_Moonidih-from-ARI_FINAL.pdf)).
- A demonstration project nearby used gas from 2 vertical wells in a 500 kW generator (same source).
- The Lok Sabha reply of March 2025 lists Moonidih's extractable reserve at 4.21 Mt on 31 March 2024. At a few hundred thousand tonnes a year, the mine reaches end of reserve around the end of this decade.
- The 78 Mm3/yr drainage figure targets deeper virgin seams. Gas from virgin seams may count as coal bed methane, whose rights sit with the Directorate General of Hydrocarbons. The tool keeps that volume as a separate "GMI scale" scenario.

### Dummy inputs (golden test case `moonidih_v1`)

| Input | Value | Basis |
| --- | --- | --- |
| Crediting window | 2027 to 2036 (10 years) | Default |
| Active years | 2027 to 2030; closure end of 2030 | DUMMY; replace with reserve workbook date |
| Coal production | 0.6 Mt/yr | DUMMY |
| VAM liberated | 3.45 Mm3/yr (0.6 Mt × 5.75 m3/t, the GMI ventilation ratio) | DUMMY |
| VAM concentration, capture | 0.3%, 85% | DUMMY |
| Drained gas | 20 Mm3/yr at 50% CH4, all captured; new drainage system needed | DUMMY (a quarter of GMI's plateau) |
| AMM after closure | q0 = 30% of last-year liberation (7.04 Mm3), D = 0.25, b = 1, 70% capture, 60% CH4 | DUMMY |
| Technologies | Drained → engines; VAM → RTO; AMM → engines (separate set in v1) | Rule in Section 4 |
| Price, discount, GWP | $15/t, 10% real, 28 | Defaults |

### Step by step (year 2027)

1. **Drained gas.** 20 Mm3 × 670 = 13,400 t CH4. Destroyed at 99.5% = 13,333 t. × 25.25 = **336,664 tCO2e**.
2. **Power.** 13,400 t × 50 GJ × 0.38 ÷ 3.6 = 70,722 MWh, worth $5.66M at $80/MWh. Engines sized at 8.97 MW.
3. **VAM.** 3.45 × 0.85 = 2.93 Mm3 captured = 1,965 t CH4. × 0.97 × 25.25 = **48,117 tCO2e**. Air treated = 31.0 m3/s.
4. **Year-1 total: 384,781 tCO2e.**
5. **Capex.** Engines 8,970 kW × $1,300 = $11.66M; drainage 20 × $250k = $5.0M; RTO 31.0 × $60k = $1.86M; AMM engines (1.77 MW) $2.30M; all × 1.15 contingency, plus $0.25M monitoring = **$24.19M**.
6. **After closure (2031).** AMM flow = 7.04 ÷ 1.25 = 5.63 Mm3; captured 3.94 Mm3 = 2,640 t; **66,315 tCO2e**, falling to 33,157 by 2036.

### Results

| Metric | Value |
| --- | --- |
| Total capex | $24.19M |
| Reductions by year (tCO2e) | 384,781 × 4 (2027 to 2030); 66,315; 55,262; 47,368; 41,447; 36,842; 33,157 |
| Total reductions, 10 years | 1.820 MtCO2e (sum of unrounded years) |
| Break-even price, whole project | $8.33/t |
| Break-even by stream | Drained to power $5.45; VAM $22.28; AMM to power $4.64 |
| NPV at $15/t | $8.65M |
| IRR at $15/t | 23.7% |
| Payback | Year 3 (2029) |
| Cash flow ($M) | −24.19; 9.40; 9.48; 9.48; 9.48; 1.46; 1.15; 0.93; 0.77; 0.64; 0.54 |

### Sensitivities the tool must reproduce

| Change from base | Break-even ($/t) | Other result |
| --- | --- | --- |
| Base case | 8.33 | NPV at $5: −$4.31M; at $10: +$2.17M; at $20: +$15.13M; at $30: +$28.09M |
| Flare instead of engines (no power offtake) | 11.33 | Capex $9.24M; NPV at $15 $4.70M |
| Engines but power worth $0 | 23.67 | Shows how much power revenue carries the project |
| GWP 29.8 instead of 28 | 7.79 | Reductions 1.949 Mt |
| Discount rate 8% / 12% | 7.41 / 9.26 | — |
| Destruction of drained gas mandated by law | 37.49 | Regulatory surplus wipes out the cheapest tonnes |
| 30% capex grant | 2.73 | — |
| GMI scale: 78 Mm3/yr drained | 6.68 | Year-1 reductions 1.36 Mt; capex $79.8M |

Two things to tell Coal India from this case. First, the result rests on power revenue and on destruction staying voluntary; both are policy choices it can influence. Second, the post-closure AMM stream is cheap per tonne, so planning abatement before closure adds low-cost credits that otherwise disappear.

## Website

The site opens on the answer: a supply curve of Coal India mines ranked by break-even price, with the chosen credit price drawn across it. Every other page lets a user check or change how that answer was reached. Working name: **Methane Ledger** (to agree with Sandeep).

### Pages

1. **Home: "Which mines pay?"**
   - Headline: "At $15 per tonne, X of Y mines break even, cutting Z MtCO2e over 10 years." Numbers update live.
   - Abatement supply curve: x = cumulative tCO2e over the window, y = break-even $/t; one bar per mine or archetype, width = tonnes, height = break-even. Horizontal lines for the price scenarios with their sellable/benchmark badges. Bars below the chosen price line are coloured as "pays".
   - Price slider and scenario chips above the chart.
   - Below: a sortable table of mines (name, subsidiary, degree, closure year, break-even, NPV at chosen price, tonnes, data quality badge: measured / estimated / dummy).
2. **Mine detail** (Moonidih first)
   - Left column: input panel grouped as Mine, Gas streams, Technology, Costs, Market, Finance. Each field shows its unit, default, source and a reset button. Fields edited away from the source show a dot.
   - Right column, top: four stat tiles (break-even, NPV, IRR, payback) and tonnes per year.
   - Charts: (a) stacked bars of reductions by year and stream, with the closure year marked; (b) cash flow by year with cumulative line; (c) break-even waterfall: capex, opex, MRV, minus energy revenue, divided by tonnes; (d) NPV against credit price, crossing zero at the break-even; (e) tornado of the six biggest sensitivities.
   - A financing switch (A to E) that redraws all of the above from Coal India's point of view.
   - "Explain this number": a panel that shows the Section 9 formula filled with this mine's values.
3. **Compare**: two or three mines side by side, same charts, same settings.
4. **Assumptions**: the technology library, constants and price scenarios as editable tables, with sources. Edits apply to the whole site for the session and can be saved to a URL.
5. **Methodology**: plain-language explanation of each equation, the regulatory surplus rule, what ACM0008 credits, and what v1 leaves out.
6. **Data**: download the template CSV, upload filled CSVs, see validation errors row by row.

### Behaviour

- All computation in the browser; results under 50 ms per mine so sliders feel instant.
- State lives in the URL query string (mine, scenario, settings) so a link reproduces a view exactly. Same pattern as Chargeline.
- Export: current view as PNG, the mine's annual table as CSV, and a one-page PDF summary for a mine (v1.1).
- Units toggle USD/INR and tCO2e/tCH4. Default USD and tCO2e.
- Every DUMMY value shows a small amber tag on the page until replaced. The home page carries a banner while any dummy value drives a headline number.
- Accessible: keyboard-operable sliders, chart data tables available under each chart, colour never the only signal.

### Copy rules

- Write for a mine planner, not a carbon trader. Say "credit price needed to break even", not "LCOA".
- Never imply Coal India can sell into California or the EU; those scenarios always carry the "benchmark only" badge.
- State plainly that results are indicative, pre-feasibility level, and not investment advice.

## Data model

All data lives in versioned JSON files under `/data`, validated at build time and on upload with the same schemas (Zod). Every numeric field carries a value, a unit, a source and a quality flag, so the UI can show where each number came from.

### Files

| File | Holds | v1 content |
| --- | --- | --- |
| `mines.json` | One record per mine or archetype | Moonidih + 5 archetypes |
| `technologies.json` | The technology library (Section 5) | Power, flare, RTO, drainage, monitoring |
| `prices.json` | Price scenarios with badges and dates | The eight scenarios above |
| `constants.json` | Density, energy content, GWP options, combustion CO2 | Fixed constants |
| `settings.default.json` | Discount rate, crediting period, fees, FX, contingency | Defaults from Section 11 |
| `closure_timeline.json` | Mine id → closure year, remaining reserve, production | Exported from the v5 reserve workbook |

### Field wrapper

Every input is stored as `{ "value": 0.6, "unit": "Mt/yr", "source": "DUMMY", "quality": "dummy" }`. `quality` is one of `measured`, `estimated`, `literature`, `dummy`. The UI tag colour comes from `quality`.

### Mine record (`mines.json`)

| Field | Type and unit | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | e.g. `bccl-moonidih` |
| `name`, `subsidiary`, `coalfield`, `state` | string | yes | — |
| `mine_type` | `UG` / `OC` / `mixed` | yes | — |
| `dgms_degree` | 1 / 2 / 3 / null | UG only | — |
| `status` | `active` / `closing` / `closed` | yes | — |
| `closure_year` | integer | yes | From closure\_timeline unless overridden |
| `production` | number Mt/yr or array by year | active mines | — |
| `specific_emission` | m3/t | if no measured volumes | — |
| `drained_volume` | Mm3 CH4/yr or array | optional | Measured beats derived |
| `drained_share` | 0 to 1 | if no drained\_volume | — |
| `drained_conc` | 0 to 1 | if drained > 0 | — |
| `vam_volume` | Mm3 CH4/yr or array | optional | — |
| `vam_conc` | 0 to 1 | UG | — |
| `vam_airflow` | m3/s | optional | If given, used for RTO sizing instead of derived airflow |
| `has_drainage_system` | boolean | yes | False adds drainage capex |
| `amm` | object: q0, D, b, capture, conc, flooding\_year | optional | Defaults from Section 3 |
| `power_offtake` | boolean | yes | False forces flare for rich gas |
| `destruction_mandated` | per stream booleans | yes | Default false |
| `notes`, `sources` | text, list of URLs | — | Shown on the mine page |

### Upload template

`mine_inputs_template.csv` has one row per mine and one column per field above, with a second header row for units. Year-by-year series go in a second file, `mine_series_template.csv`, with columns `mine_id, year, production_mt, drained_mm3, vam_mm3`. The upload page validates both, lists errors by row, and merges valid rows over the defaults for that session.

### CMPDI data request

The items below are what most change the answer, in priority order. Ranges or rough estimates are fine; the tool tags them as estimated.

1. List of underground mines in the closure pipeline with DGMS degree and planned closure year.
2. For each gassy (Degree II and III) mine: ventilation airflow (m3/s) and methane concentration at each main fan, recent years.
3. Drained gas volumes and concentration where drainage exists; whether a drainage system exists at all.
4. Coal production by year, actual and planned to closure.
5. Gas content of seams (m3/t) and any sealed-area gas measurements (for AMM).
6. Whether power at the mine is bought from the grid and at what tariff (sets power value).
7. Any past cost estimates for drainage, gas engines or flares (for example the Moonidih demonstration and tender documents).

Ask for data in any format; the import step is ours to build.

## Tech stack and repo

A static site with no server: the model runs in the browser and the site deploys to GitHub Pages, as Chargeline does. If Chargeline already uses a different framework, reuse it and keep the rest of this section.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Model correctness; shared types for data and UI |
| Build | Vite | Fast, static output for Pages |
| UI | React | Input panels with many linked controls |
| Charts | D3 (scales, shapes) drawn as React SVG | Custom supply curve and waterfall; full control of styling |
| Validation | Zod | One schema for JSON files, CSV upload and URL state |
| CSV | Papa Parse | Client-side upload |
| Tests | Vitest (model), Playwright (pages) | Golden values and UI smoke tests |
| Deploy | GitHub Actions → GitHub Pages | Same as Chargeline |

### Repo layout

```
methane-ledger/
  reference/cmm_model.py        # the Python reference model in this spec
  data/                         # mines, technologies, prices, constants, settings, closure_timeline (JSON)
  data/templates/               # mine_inputs_template.csv, mine_series_template.csv
  src/model/
    constants.ts                # density, LHV, combustion CO2, GWP options
    types.ts                    # Mine, Stream, Technology, Settings, Results
    streams.ts                  # liberation, AMM decline, stream building
    technology.ts               # tech choice rules, sizing, capex/opex
    reductions.ts               # emission reductions per stream and year
    finance.ts                  # cash flows, NPV, IRR, payback, break-even
    financing.ts                # structures A to E
    sensitivity.ts              # tornado and NPV-vs-price curves
    evaluate.ts                 # evaluate(mine, settings) -> Results
  src/data/                     # loaders + Zod schemas
  src/state/                    # URL state, session overrides
  src/components/charts/        # SupplyCurve, ReductionsByYear, CashFlow, Waterfall, NpvVsPrice, Tornado
  src/components/inputs/        # grouped input panels, DUMMY tags
  src/pages/                    # Home, MineDetail, Compare, Assumptions, Methodology, Data
  tests/golden/                 # moonidih_v1.json, archetypes_v1.json (expected outputs)
  tests/model/                  # unit tests per model file
  tests/e2e/                    # Playwright smoke tests
  .github/workflows/deploy.yml
  CLAUDE.md                     # build rules for Claude Code (see Build plan)
```

### Rules for the code

- The model folder imports nothing from React or the browser. It must run in Node for tests.
- Units in variable names (`ch4Mm3`, `capexUsd`, `priceUsdPerT`) to avoid unit errors.
- No hidden constants: every number comes from `data/` or `constants.ts`.
- The model returns full annual tables, not just summary numbers, so every chart reads from one result object.

## Validation and test plan

The TypeScript model is correct when it reproduces the Python reference to within 0.5% on every golden value. Tests run on every commit; a failing golden test blocks deploy.

### Golden tests (from the reference model)

| Test | Expected |
| --- | --- |
| `moonidih_v1` year-1 reductions | 384,781 tCO2e |
| `moonidih_v1` 2031 reductions (first AMM year) | 66,315 tCO2e |
| `moonidih_v1` total capex | $24.19M |
| `moonidih_v1` break-even | $8.33/t |
| `moonidih_v1` NPV at $15 / IRR / payback | $8.65M / 23.7% / year 3 |
| `moonidih_v1` NPV at $5 and $30 | −$4.31M and $28.09M |
| Moonidih flare-only break-even | $11.33/t |
| Moonidih with drained destruction mandated | $37.49/t |
| Degree III archetype break-even | $3.61/t |
| Degree III closing in 4 years break-even | $12.23/t |
| Degree II archetype break-even | $15.28/t |
| Degree I and opencast | "not abatable" |

### Physics and accounting checks (unit tests)

- 1 Mm3 CH4 = 670 t; destroying it at 100% with GWP 28 = 16,918 tCO2e.
- **Cross-check against GMI:** 78 Mm3/yr at GWP 21 with no combustion deduction gives 1.097 MtCO2e, matching GMI's 1.109 Mt within 1.1%. This confirms the unit chain.
- NPV at the break-even price equals zero (±$1,000).
- Break-even falls when power price rises, GWP rises or a grant is added; rises when the discount rate rises or the closure year moves earlier.
- AMM flow is strictly decreasing; flooding cuts it from the flooding year.
- A stream with "destruction mandated" contributes costs but zero reductions.
- VAM below 0.2% produces no RTO and a "needs enrichment" flag; gas between 5% and 15% raises a safety warning.

### Sanity against literature

- Stream break-evens should land near IEEFA's India averages: drained gas use about −$11.9/t, VAM oxidation about $18.9/t. The dummy model gives −$3.80 and $9.74 to $22.28 depending on concentration and remaining life. Re-check once real capex quotes arrive.
- UNECE's finding that about $20/t for four to five years makes VAM oxidation investable should hold for a typical Degree III VAM stream.

### Page tests (Playwright)

- Home loads, supply curve renders, price slider changes the headline count.
- Moonidih page shows $8.33 break-even with default settings, and the URL reproduces the view.
- Uploading the template CSV with Moonidih's dummy values reproduces the same numbers.
- No page has console errors; Lighthouse accessibility score 90 or more.

## Build plan

Eight phases, each sized for one or two Claude Code sessions and ending in something testable. Target: v1 live by 10 January 2027, leaving ten days for real data and rehearsal before Ranchi. Each phase below is written so it can become one prompt: goal, what to build, what to give Claude Code, and when it is done.

**Standing instructions for every prompt** (put these in `CLAUDE.md` at Phase 0): read this spec first; never change a golden value to make a test pass; units in names; model code has no UI imports; every new number goes in `data/` with a source; run tests before declaring done.

1. **Phase 0: Scaffold** (week of 9 Nov)
   - Build: Vite + React + TypeScript repo with the layout in "Tech stack and repo", Vitest, Playwright, ESLint, Prettier, GitHub Actions deploy to Pages, `CLAUDE.md` with the standing instructions.
   - Give Claude Code: this spec's Tech stack section; `cmm_model.py` to commit under `/reference`.
   - Done when: an empty site deploys to GitHub Pages and `npm test` runs.
2. **Phase 1: Data layer** (week of 16 Nov)
   - Build: Zod schemas and the six JSON files from "Data model", with Moonidih and the five archetypes filled with this spec's dummy values; the field wrapper with quality flags.
   - Give Claude Code: Data model section, Mine archetypes inputs table, Moonidih inputs table, Price scenarios table, Section 5 and 11 tables.
   - Done when: all files validate; a malformed test file fails with a readable error.
3. **Phase 2: Core model** (weeks of 16 and 23 Nov)
   - Build: `src/model/*` porting the reference model: liberation, AMM decline, technology choice and sizing, reductions, cash flows, NPV, IRR, payback, break-even (project and per stream), sensitivities.
   - Give Claude Code: Model specification Sections 1 to 9, the reference Python, the golden test table.
   - Done when: every golden value and every physics check in "Validation and test plan" passes.
4. **Phase 3: Financing structures** (week of 30 Nov)
   - Build: `financing.ts` with structures A to E, including the developer-hurdle rule for B; Coal India's and the developer's cash flows side by side.
   - Give Claude Code: Section 10.
   - Done when: unit tests show a 30% grant cuts Moonidih's break-even to $2.73 (structure E), and B reports "no developer would take this" when developer IRR is below 15%.
5. **Phase 4: Mine detail page** (weeks of 7 and 14 Dec)
   - Build: input panel, stat tiles, the five charts, financing switch, "Explain this number", DUMMY tags, URL state.
   - Give Claude Code: Website section, Pages item 2 and Behaviour; ask it to load the frontend-design guidance and follow Chargeline's look.
   - Done when: Moonidih shows $8.33 by default; moving the price slider to $5 shows negative NPV; links reproduce views.
6. **Phase 5: Home, Compare, Assumptions** (week of 21 Dec)
   - Build: supply curve with scenario lines and badges, mines table, headline sentence, compare view, editable assumptions.
   - Done when: at $15, the headline counts Moonidih, Degree III and closing Degree III as paying; Degree II sits just below break-even.
7. **Phase 6: Data upload and methodology** (week of 28 Dec)
   - Build: CSV templates, upload with row-level validation, session merge; Methodology page in plain language.
   - Done when: uploading the template with Moonidih's dummy values reproduces its numbers exactly.
8. **Phase 7: Real data, QA and rehearsal** (4 Jan to 20 Jan)
   - Build: load CMPDI data and the closure timeline; replace dummies; re-run golden tests as "v1 dummy" regression and add a "v1 real" set; Lighthouse and accessibility pass; one-page PDF summary for Moonidih.
   - Done when: Sandeep has walked through the site end to end and the Moonidih page is ready to present.

### Later (after Ranchi)

- v1.1: equipment reuse from drained gas to AMM, gas sales and CNG, grid electricity credit toggle, tax and depreciation, Monte Carlo ranges instead of single values.
- v2: all closing mines from the reserve workbook with gas screens, a map of the coalfields, opencast pre-drainage, and a CCTS methodology mode once BEE publishes one.

## Assumptions and open questions

Five assumptions move Moonidih's break-even most: power revenue, whether destruction stays voluntary, drained gas volume, remaining mine life, and capex per kW. Those are the ones to replace with real data first.

**Assumptions to replace**

| Assumption | Dummy value | Effect on Moonidih break-even | Who can confirm |
| --- | --- | --- | --- |
| Power value at the mine | $80/MWh | $0/MWh raises it from $8.33 to $23.67 | BCCL finance (grid tariff paid) |
| Destruction of drained gas stays voluntary | yes | If mandated: $37.49 | BEE, DGMS, Ministry of Coal |
| Drained gas volume | 20 Mm3/yr | 78 Mm3/yr (GMI scale) gives $6.68 | CMPDI |
| Closure year | end of 2030 | Earlier closure raises it sharply (see archetypes) | Reserve workbook, BCCL |
| Gas engine capex | $1,300/kW | Not yet tested; add to the tornado | Vendor quotes, developers |
| RTO capex | $60,000 per m3/s | Drives VAM break-even ($22.28) | Vendor quotes |
| AMM decline (q0, D, b) | 30%, 0.25, 1 | Sets post-closure tonnes | UNECE and US EPA AMM guidance, sealed-area data |
| GWP | 28 | 29.8 gives $7.79 | Verra and CCTS rules |
| Discount rate | 10% real | 8% gives $7.41; 12% gives $9.26 | Coal India hurdle rate |

**Open questions**

- Which GWP does a CCP-labelled ACM0008 project issue against today, and which will CCTS use?
- Who owns gas from virgin seams under the Moonidih block: BCCL as coal mine methane, or a hydrocarbon licensee as coal bed methane?
- Does ACM0008's abandoned-mine route qualify for the CCP label? This decides whether the AMM stream earns premium or standard credits.
- Can engines and monitoring kit move from drained gas to AMM without a new crediting period?
- What tax treatment applies to credit revenue for a central public sector company?
- Should the default price be the high-integrity estimate ($15) or the CCTS floor ($11)? Agree with Sandeep before the workshop.

## Sources

- [GMI, Moonidih CMM project profile (Bharat Coking Coal, CMPDI)](https://development.globalmethane.org/expo-docs/posters/CoalMines/CM_IN_Project_Moonidih-from-ARI_FINAL.pdf)
- [Prusty, Patra and Harpalani, Assessment of sealed off areas at Moonidih mine (GMI)](https://development.globalmethane.org/expo-docs/canada13/coal_24_Prusty_Presentation.pdf)
- Lok Sabha Unstarred Question 4259 (26 March 2025), Annexure I: mine-wise extractable reserve on 31 March 2024 (project file)
- Our research doc: Carbon Markets for Methane Abatement at Coal India's Mines (prices, buyers, CCTS and Verra rules)
- [IEEFA, Methane abatement in India's coking coal push (July 2026)](https://ieefa.org/resources/methane-abatement-indias-coking-coal-push-opportunities-and-costs)
- [Ember, Global Coal Mine Methane Review 2026, chapter 4](https://ember-energy.org/latest-insights/global-coal-mine-methane-review-2026/cutting-cmm-this-decade-is-urgent-and-feasible)
- [Ember, Understanding India's coal mine methane landscape (May 2026)](https://ember-energy.org/latest-insights/understanding-indias-coal-mine-methane-landscape)
- [Verra, ACM0008 Abatement of methane from coal mines](https://verra.org/methodologies/acm0008-abatement-of-methane-from-coal-mines/)
- [BEE, Detailed Procedure for Offset Mechanism under CCTS (2025)](https://jmkresearch.com/wp-content/uploads/2025/04/Detailed-Procedure-for-Offset-Mechanism.pdf)
- [UNECE, Best practice guidance for methane recovery from abandoned coal mines](https://unece.org/fileadmin/DAM/energy/images/CMM/CMM_CE/Best_Practice_Guidance_for_Effective_Methane_Recovery_and_Use_from_Abandoned_Coal_Mines_FINAL__with_covers_.pdf)
- [Chargeline, ERCOT battery backtester](https://aashishyadav-312.github.io/ercot-battery-backtester/)

## Appendix: reference model (Python)

Run it with Python 3; its printed outputs are the golden values in this spec. Commit it to the repo's reference folder.

```python
"""Reference model for the Coal Mine Methane Credit Tool (dummy figures).
All numbers marked DUMMY are placeholders to be replaced with CMPDI / vendor data.
Units: volumes in million m3 of pure CH4 per year (Mm3), money in USD, real terms.
"""
from dataclasses import dataclass, field

# ---------- Constants ----------
RHO = 0.67            # t CH4 per 1,000 m3 (= kg/m3) at 20 C, 1 atm (ACM0008 convention)
LHV = 50.0            # GJ per t CH4
CO2_PER_CH4 = 44 / 16 # t CO2 from burning 1 t CH4 (2.75)

@dataclass
class Settings:
    gwp: float = 28.0              # AR5 GWP100; switchable to 29.8 (AR6 fossil) or 21 (legacy CDM)
    discount: float = 0.10         # real discount rate, DUMMY
    start_year: int = 2027
    crediting_years: int = 10
    credit_price: float = 15.0     # USD/tCO2e, DUMMY scenario
    credit_fee_share: float = 0.05 # broker/marketing share of credit revenue, DUMMY
    issuance_fee: float = 0.20     # USD per credit issued, DUMMY
    power_price: float = 80.0      # USD/MWh avoided purchase or sale, DUMMY
    gas_price: float = 7.0         # USD/MMBtu, DUMMY
    validation_cost: float = 80_000   # one-off, DUMMY
    verification_cost: float = 50_000 # per year, DUMMY
    monitoring_capex: float = 250_000 # meters, analysers, DUMMY
    contingency: float = 0.15      # on capex, DUMMY

# ---------- Technology library (all DUMMY) ----------
TECH = {
    # min_conc: minimum CH4 fraction in the stream to use this tech
    "power":  dict(min_conc=0.30, de=0.995, eff=0.38, capex_per_kw=1300, opex_per_mwh=15, avail=0.90),
    "flare":  dict(min_conc=0.25, de=0.98, capex_per_mm3=40_000, opex_frac=0.05),
    "rto":    dict(min_conc=0.002, de=0.97, capex_per_m3s=60_000, opex_frac=0.06, kwh_per_m3s_yr=60_000),
    "drainage_system": dict(capex_per_mm3=250_000, opex_frac=0.04),
}

def mass_t(mm3):           # Mm3 CH4 -> t CH4
    return mm3 * 1e6 * RHO / 1000

def er_per_t_destroyed(gwp):  # net tCO2e per t CH4 destroyed (minus combustion CO2)
    return gwp - CO2_PER_CH4

def amm_profile(q0, years, D=0.25, b=1.0):
    """Hyperbolic decline of abandoned-mine methane flow, year 1 = first year after closure."""
    return [q0 / (1 + b * D * t) ** (1 / b) for t in range(1, years + 1)]

@dataclass
class Stream:
    name: str
    kind: str          # 'drained' | 'vam' | 'amm'
    conc: float        # CH4 fraction in the gas stream
    volumes: list      # Mm3 CH4 per year, one per model year
    tech: str          # 'power' | 'flare' | 'rto'
    capture_eff: float = 1.0   # share of liberated CH4 the system actually collects
    needs_drainage_capex: bool = False
    mandated_destruction: bool = False  # regulatory surplus flag: True -> no credits

def stream_cashflows(s: Stream, st: Settings):
    t = TECH[s.tech]
    cap_mm3 = max(s.volumes) * s.capture_eff
    years = len(s.volumes)
    capex = 0.0
    if s.tech == "power":
        peak_mwh = mass_t(cap_mm3) * LHV * t["eff"] / 3.6
        kw = peak_mwh * 1000 / (8760 * t["avail"])
        capex = kw * t["capex_per_kw"]
    elif s.tech == "flare":
        capex = cap_mm3 * t["capex_per_mm3"]
    elif s.tech == "rto":
        airflow_m3s = cap_mm3 * 1e6 / s.conc / (8760 * 3600)
        capex = airflow_m3s * t["capex_per_m3s"]
    if s.needs_drainage_capex:
        capex += cap_mm3 * TECH["drainage_system"]["capex_per_mm3"]
    capex *= 1 + st.contingency
    rows = []
    for i, v in enumerate(s.volumes):
        captured = mass_t(v * s.capture_eff)
        destroyed = captured * t["de"]
        er = 0.0 if s.mandated_destruction else destroyed * er_per_t_destroyed(st.gwp)
        energy_rev = 0.0
        opex = 0.0
        if s.tech == "power":
            mwh = captured * LHV * t["eff"] / 3.6
            energy_rev = mwh * st.power_price
            opex = mwh * t["opex_per_mwh"]
        elif s.tech == "flare":
            opex = capex * t["opex_frac"]
        elif s.tech == "rto":
            airflow = v * s.capture_eff * 1e6 / s.conc / (8760 * 3600)
            opex = capex * t["opex_frac"] + airflow * t["kwh_per_m3s_yr"] / 1000 * st.power_price
        if s.needs_drainage_capex:
            opex += max(s.volumes) * TECH["drainage_system"]["capex_per_mm3"] * TECH["drainage_system"]["opex_frac"]
        rows.append(dict(year=st.start_year + i, ch4_t=captured, er=er, energy_rev=energy_rev, opex=opex))
    return capex, rows

def pv(values, r):
    return sum(v / (1 + r) ** (i + 1) for i, v in enumerate(values))

def evaluate(streams, st: Settings):
    total_capex = st.monitoring_capex
    n = st.crediting_years
    er = [0.0] * n; erev = [0.0] * n; opex = [0.0] * n
    per_stream = {}
    for s in streams:
        c, rows = stream_cashflows(s, st)
        total_capex += c
        s_er = [r["er"] for r in rows[:n]]
        s_cost = [r["opex"] - r["energy_rev"] for r in rows[:n]]
        be = (c + pv(s_cost, st.discount)) / pv(s_er, st.discount) if pv(s_er, st.discount) else float("nan")
        per_stream[s.name] = dict(capex=c, er_total=sum(s_er), breakeven=be)
        for i, r in enumerate(rows[:n]):
            er[i] += r["er"]; erev[i] += r["energy_rev"]; opex[i] += r["opex"]
    mrv = [st.verification_cost + (st.validation_cost if i == 0 else 0) for i in range(n)]
    net_cost = [opex[i] + mrv[i] - erev[i] for i in range(n)]
    pv_er = pv(er, st.discount)
    # break-even gross credit price, grossed up for broker share and issuance fee
    be_net = (total_capex + pv(net_cost, st.discount)) / pv_er
    breakeven = (be_net + st.issuance_fee) / (1 - st.credit_fee_share)
    credit_rev = [e * (st.credit_price * (1 - st.credit_fee_share) - st.issuance_fee) for e in er]
    cash = [-total_capex] + [credit_rev[i] - net_cost[i] for i in range(n)]
    npv = sum(c / (1 + st.discount) ** i for i, c in enumerate(cash))
    cum, payback = 0, None
    for i, c in enumerate(cash):
        cum += c
        if payback is None and cum >= 0 and i > 0:
            payback = i
    return dict(capex=total_capex, er_total=sum(er), er_year1=er[0], breakeven=breakeven,
                npv=npv, payback=payback, per_stream=per_stream, er=er, cash=cash)

# ---------- Moonidih dummy case ----------
def moonidih(st=Settings()):
    active = 4                     # 2027-2030 active; closes end-2030 (DUMMY, set from reserve workbook)
    post = st.crediting_years - active
    drained_active = [20.0] * active            # Mm3 CH4/yr, DUMMY (GMI 2013 projected 78 at plateau)
    vam_active = [3.45] * active                # 0.6 Mt/yr x 5.75 m3/t (GMI ratio), DUMMY production
    q0 = 0.30 * (drained_active[-1] + vam_active[-1])   # AMM starts at 30% of last-year liberation, DUMMY
    amm = amm_profile(q0, post)
    return [
        Stream("Drained gas to power", "drained", 0.50, drained_active + [0] * post, "power",
               capture_eff=1.0, needs_drainage_capex=True),
        Stream("Ventilation air methane", "vam", 0.003, vam_active + [0] * post, "rto", capture_eff=0.85),
        Stream("Post-closure AMM to power", "amm", 0.60, [0] * active + amm, "power", capture_eff=0.70),
    ]

ARCHETYPES = {
    # name: (production Mt/yr, specific emission m3/t, drained share, drained conc, VAM conc, years active in window)
    "Degree I underground":   (0.5, 0.8, 0.00, 0.0, 0.0005, 10),
    "Degree II underground":  (0.5, 5.0, 0.30, 0.35, 0.002, 10),
    "Degree III underground": (0.5, 15.0, 0.50, 0.50, 0.004, 10),
    "Degree III, closing in 4 yrs": (0.5, 15.0, 0.50, 0.50, 0.004, 4),
    "Opencast":               (5.0, 0.3, 0.00, 0.0, 0.0, 10),
}

def archetype_streams(name, st):
    P, se, dshare, dconc, vconc, yrs = ARCHETYPES[name]
    total = P * se            # Mm3 CH4/yr (Mt x m3/t = Mm3)
    n = st.crediting_years
    streams = []
    if dshare > 0:
        streams.append(Stream("drained", "drained", dconc, [total * dshare] * yrs + [0] * (n - yrs),
                              "power" if dconc >= 0.30 else "flare", needs_drainage_capex=True))
    if vconc >= TECH["rto"]["min_conc"]:
        streams.append(Stream("vam", "vam", vconc, [total * (1 - dshare)] * yrs + [0] * (n - yrs), "rto", capture_eff=0.85))
    if yrs < n and dshare > 0:
        q0 = 0.30 * total
        streams.append(Stream("amm", "amm", 0.60, [0] * yrs + amm_profile(q0, n - yrs), "power", capture_eff=0.70))
    return streams

if __name__ == "__main__":
    st = Settings()
    r = evaluate(moonidih(st), st)
    print("MOONIDIH")
    print(f" capex ${r['capex']/1e6:.2f}M | ER total {r['er_total']/1e6:.3f} MtCO2e | ER yr1 {r['er_year1']:,.0f}")
    print(f" break-even ${r['breakeven']:.2f}/t | NPV@${st.credit_price} ${r['npv']/1e6:.2f}M | payback yr {r['payback']}")
    for k, v in r["per_stream"].items():
        print(f"  {k}: capex ${v['capex']/1e6:.2f}M, ER {v['er_total']:,.0f}, BE ${v['breakeven']:.2f}/t")
    print(" ER by year:", [round(x) for x in r["er"]])
    print(" cash by year ($M):", [round(c/1e6, 2) for c in r["cash"]])
    for price in (5, 10, 15, 20, 30):
        s2 = Settings(credit_price=price)
        print(f"  NPV @ ${price}: ${evaluate(moonidih(s2), s2)['npv']/1e6:.2f}M")
    print("\nARCHETYPES")
    for name in ARCHETYPES:
        ss = archetype_streams(name, st)
        if not ss:
            print(f" {name}: no technically abatable stream"); continue
        a = evaluate(ss, st)
        print(f" {name}: capex ${a['capex']/1e6:.2f}M, ER/yr1 {a['er_year1']:,.0f}, ER10 {a['er_total']:,.0f}, BE ${a['breakeven']:.2f}/t, NPV@15 ${a['npv']/1e6:.2f}M")
        for k, v in a["per_stream"].items():
            print(f"    {k}: BE ${v['breakeven']:.2f}/t")
```

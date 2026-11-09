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

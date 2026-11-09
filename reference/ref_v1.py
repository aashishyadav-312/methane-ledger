"""Extended reference for Methane Ledger v1. Imports cmm_model.py unchanged and adds what the TypeScript
build needs golden values for: IRR, closure-year cases, price escalation, financing structures A to E,
the break-even waterfall and the tornado. Run: python3 reference/ref_v1.py  (writes tests/golden/*.json)."""
import copy, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cmm_model as M
from cmm_model import Settings, Stream, evaluate, amm_profile, pv, mass_t

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "tests", "golden")

# ---------- helpers ----------
def irr(cash):
    """Highest sign change of NPV(r): scan r from 1000% down to -90% in 1% steps, then bisect to 1e-9.
    Returns None when NPV never changes sign (for example a project that never pays back)."""
    f = lambda r: sum(c / (1 + r) ** i for i, c in enumerate(cash))
    hi = 10.0
    while hi > -0.9:
        lo = round(hi - 0.01, 10)
        if f(hi) <= 0 < f(lo) or f(hi) == 0:
            for _ in range(200):
                m = (lo + hi) / 2
                if f(m) > 0: lo = m
                else: hi = m
            return (lo + hi) / 2
        hi = lo
    return None

def npv(cash, r):
    return sum(c / (1 + r) ** i for i, c in enumerate(cash))

def payback(cash):
    cum = 0
    for i, c in enumerate(cash):
        cum += c
        if i > 0 and cum >= 0:
            return i
    return None

# ---------- Moonidih, parameterised (defaults reproduce cmm_model.moonidih exactly) ----------
def moonidih_case(st, active=4, drained=20.0, vam=3.45, vam_conc=0.003, tech="power",
                  drained_mandated=False, f_amm=0.30, amm_basis=None):
    """amm_basis: Mm3/yr of mine-workings gas that sets q0 (default drained + vam). Virgin-seam gas (GMI scale) is excluded."""
    n = st.crediting_years
    active = max(0, min(active, n)); post = n - active
    streams = [Stream("Drained gas to power", "drained", 0.50, [drained] * active + [0] * post, tech,
                      capture_eff=1.0, needs_drainage_capex=True, mandated_destruction=drained_mandated)]
    if vam_conc >= M.TECH["rto"]["min_conc"]:   # below 0.2% CH4: no RTO, 'needs enrichment'
        streams.append(Stream("Ventilation air methane", "vam", vam_conc, [vam] * active + [0] * post, "rto",
                              capture_eff=0.85))
    if post > 0:
        q0 = f_amm * (amm_basis if amm_basis is not None else drained + vam)
        streams.append(Stream("Post-closure AMM to power", "amm", 0.60, [0] * active + amm_profile(q0, post),
                              tech, capture_eff=0.70))
    return streams

# ---------- yearly components, with escalation and grant ----------
def flows(streams, st, price=None, escalation=0.0, grant=0.0, price_override=None):
    """Return per-year components. price_override(t, p) lets financing D change the realised price."""
    p0 = st.credit_price if price is None else price
    n = st.crediting_years
    capex = st.monitoring_capex
    er = [0.0] * n; erev = [0.0] * n; opex = [0.0] * n
    for s in streams:
        c, rows = M.stream_cashflows(s, st)
        capex += c
        for i, r in enumerate(rows[:n]):
            er[i] += r["er"]; erev[i] += r["energy_rev"]; opex[i] += r["opex"]
    capex *= (1 - grant)
    mrv = [st.verification_cost + (st.validation_cost if i == 0 else 0) for i in range(n)]
    price_t = [p0 * (1 + escalation) ** i for i in range(n)]
    if price_override:
        price_t = [price_override(i, p) for i, p in enumerate(price_t)]
    credit = [er[i] * (price_t[i] * (1 - st.credit_fee_share) - st.issuance_fee) for i in range(n)]
    cash = [-capex] + [credit[i] + erev[i] - opex[i] - mrv[i] for i in range(n)]
    return dict(capex=capex, er=er, energy=erev, opex=opex, mrv=mrv, credit=credit, price=price_t, cash=cash)

def breakeven(streams, st, escalation=0.0, grant=0.0):
    """Closed form: P* = (capex + PV(opex + mrv - energy) + fee*PV(ER)) / ((1 - b) * PV(ER * g_t))."""
    f = flows(streams, st, price=0.0, escalation=0.0, grant=grant)
    r = st.discount; n = st.crediting_years
    g = [(1 + escalation) ** i for i in range(n)]
    num = f["capex"] + pv([f["opex"][i] + f["mrv"][i] - f["energy"][i] for i in range(n)], r) \
        + st.issuance_fee * pv(f["er"], r)
    den = (1 - st.credit_fee_share) * pv([f["er"][i] * g[i] for i in range(n)], r)
    return num / den if den else None

def waterfall(streams, st):
    f = flows(streams, st, price=0.0)
    r = st.discount
    den = (1 - st.credit_fee_share) * pv(f["er"], r)
    parts = dict(capex=f["capex"] / den, opex=pv(f["opex"], r) / den, mrv=pv(f["mrv"], r) / den,
                 fees=st.issuance_fee * pv(f["er"], r) / den, energy=-pv(f["energy"], r) / den)
    parts["total"] = sum(parts.values())
    return parts

def summary(streams, st, **kw):
    f = flows(streams, st, **kw)
    return dict(capex=f["capex"], er=f["er"], er_total=sum(f["er"]), cash=f["cash"],
                npv=npv(f["cash"], st.discount), irr=irr(f["cash"]), payback=payback(f["cash"]))

# ---------- financing structures (SPEC_V1 Section 10; definitions in PLAN_V1 Appendix B) ----------
FIN = dict(royalty=0.10, hurdle=0.15, k=3, fwd_discount=0.30, floor=10.0, premium=0.50, floor_years=5, grant=0.30)

def financing(streams, st, price=None):
    P = st.credit_price if price is None else price
    r, b, fee, n = st.discount, st.credit_fee_share, st.issuance_fee, st.crediting_years
    base = flows(streams, st, price=P)
    out = {}
    # A self-funded
    out["A"] = dict(cil_cash=base["cash"], cil_npv=npv(base["cash"], r), cil_irr=irr(base["cash"]),
                    breakeven=breakeven(streams, st))
    # B developer builds, owns, operates; royalty on gross revenue (credits + power)
    gross = [base["credit"][i] + base["energy"][i] for i in range(n)]
    roy = [FIN["royalty"] * g for g in gross]
    dev = [base["cash"][0]] + [base["cash"][i + 1] - roy[i] for i in range(n)]
    dev_irr = irr(dev)
    cil = [0.0] + roy
    proj_npv_h = npv(base["cash"], FIN["hurdle"])
    pv_gross_h = sum(gross[i] / (1 + FIN["hurdle"]) ** (i + 1) for i in range(n))
    def dev_npv_h(p):
        f = flows(streams, st, price=p)
        g2 = [f["credit"][i] + f["energy"][i] for i in range(n)]
        d = [f["cash"][0]] + [f["cash"][i + 1] - FIN["royalty"] * g2[i] for i in range(n)]
        return npv(d, FIN["hurdle"])
    a0, a1 = dev_npv_h(0.0), dev_npv_h(1.0)        # linear in price
    be_dev = -a0 / (a1 - a0) if a1 != a0 else None
    out["B"] = dict(dev_cash=dev, dev_irr=dev_irr, developer_declines=(dev_irr is None or dev_irr < FIN["hurdle"]),
                    cil_cash=cil, cil_npv=npv(cil, r), max_royalty=max(0.0, proj_npv_h / pv_gross_h) if pv_gross_h else 0.0,
                    breakeven_for_developer=be_dev)
    # C forward sale: buyer prepays at t0 for years 1..k credits at (1 - d) x price, fees still apply
    k = min(FIN["k"], n)
    prepay = sum(base["er"][i] * (base["price"][i] * (1 - FIN["fwd_discount"]) * (1 - b) - fee) for i in range(k))
    c = [base["cash"][0] + prepay] + [base["cash"][i + 1] - (base["credit"][i] if i < k else 0) for i in range(n)]
    out["C"] = dict(prepayment=prepay, share_of_capex=prepay / base["capex"], cil_cash=c, cil_npv=npv(c, r), cil_irr=irr(c))
    # D price floor: realised price max(P, F) on 100% of years 1..floor_years; premium per covered credit paid at t0
    yrs = min(FIN["floor_years"], n)
    def d_cash(p):
        f = flows(streams, st, price=p, price_override=lambda i, q: max(q, FIN["floor"]) if i < yrs else q)
        prem = FIN["premium"] * sum(f["er"][:yrs])
        return [f["cash"][0] - prem] + f["cash"][1:], prem
    dc, prem = d_cash(P)
    lo, hi = 0.0, 500.0
    if npv(d_cash(lo)[0], r) >= 0:
        be_d = 0.0
    else:
        for _ in range(200):
            m = (lo + hi) / 2
            if npv(d_cash(m)[0], r) >= 0: hi = m
            else: lo = m
        be_d = (lo + hi) / 2
    out["D"] = dict(premium_paid=prem, cil_cash=dc, cil_npv=npv(dc, r), cil_irr=irr(dc), breakeven=be_d,
                    floor_covers_at_zero=be_d == 0.0)
    # E grant
    e = flows(streams, st, price=P, grant=FIN["grant"])
    out["E"] = dict(grant=base["capex"] * FIN["grant"], cil_cash=e["cash"], cil_npv=npv(e["cash"], r),
                    cil_irr=irr(e["cash"]), breakeven=breakeven(streams, st, grant=FIN["grant"]))
    return out

# ---------- tornado ----------
def with_tech(patch, fn):
    saved = copy.deepcopy(M.TECH)
    try:
        for k, v in patch.items(): M.TECH[k].update(v)
        return fn()
    finally:
        M.TECH.clear(); M.TECH.update(saved)

def tornado(case_kw=None):
    case_kw = dict(case_kw or {})
    def be(st=None, **kw):
        st = st or Settings()
        return breakeven(moonidih_case(st, **{**case_kw, **kw}), st)
    base_active = case_kw.get("active", 4)
    rows = [
        ("power_price", "Power value $40 / $120 per MWh", lambda: be(Settings(power_price=40)), lambda: be(Settings(power_price=120))),
        ("engine_capex", "Engine capex -30% / +30%", lambda: with_tech({"power": {"capex_per_kw": 910}}, be), lambda: with_tech({"power": {"capex_per_kw": 1690}}, be)),
        ("rto_capex", "RTO capex -30% / +30%", lambda: with_tech({"rto": {"capex_per_m3s": 42000}}, be), lambda: with_tech({"rto": {"capex_per_m3s": 78000}}, be)),
        ("drained", "Drained gas 10 / 30 Mm3 per year", lambda: be(drained=10.0), lambda: be(drained=30.0)),
        ("closure", "Closure 2 years earlier / later", lambda: be(active=base_active - 2), lambda: be(active=base_active + 2)),
        ("discount", "Discount rate 8% / 12%", lambda: be(Settings(discount=0.08)), lambda: be(Settings(discount=0.12))),
        ("gwp", "GWP 21 / 29.8", lambda: be(Settings(gwp=21)), lambda: be(Settings(gwp=29.8))),
        ("f_amm", "Gas after closure 15% / 45% of last year", lambda: be(f_amm=0.15), lambda: be(f_amm=0.45)),
        ("vam_conc", "Ventilation methane 0.2% / 0.6%", lambda: be(vam_conc=0.002), lambda: be(vam_conc=0.006)),
        ("contingency", "Contingency 0% / 40%", lambda: be(Settings(contingency=0.0)), lambda: be(Settings(contingency=0.40))),
    ]
    out = []
    for key, label, lo, hi in rows:
        a, z = lo(), hi()
        out.append(dict(key=key, label=label, low_case=a, high_case=z, swing=abs(z - a)))
    out.sort(key=lambda d: -d["swing"])
    return dict(base=be(), rows=out, top6=[d["key"] for d in out[:6]])

# ---------- golden sets ----------
def r6(x):
    if isinstance(x, float): return round(x, 6)
    if isinstance(x, list): return [r6(v) for v in x]
    if isinstance(x, dict): return {k: r6(v) for k, v in x.items()}
    return x

def main():
    os.makedirs(OUT, exist_ok=True)
    st = Settings()
    S = moonidih_case(st)
    ref = evaluate(M.moonidih(st), st)
    assert abs(ref["breakeven"] - breakeven(S, st)) < 1e-9 and abs(ref["npv"] - summary(S, st)["npv"]) < 1e-6
    base = summary(S, st)
    moon = dict(
        case="moonidih_v1 (closure end 2030, 10-year window from 2027, all DUMMY)",
        capex=base["capex"], er_by_year=base["er"], er_total=base["er_total"], cash=base["cash"],
        breakeven=breakeven(S, st), npv_at_15=base["npv"], irr_at_15=base["irr"], payback_index=base["payback"],
        per_stream={k: v for k, v in ref["per_stream"].items()},
        npv_by_price={str(p): summary(S, Settings(credit_price=p))["npv"] for p in (0, 5, 10, 15, 20, 30, 40, 60)},
        waterfall=waterfall(S, st),
    )
    sens = {}
    def case(name, st2=None, **kw):
        st2 = st2 or Settings()
        s2 = moonidih_case(st2, **kw)
        sm = summary(s2, st2)
        sens[name] = dict(breakeven=breakeven(s2, st2), capex=sm["capex"], npv_at_15=sm["npv"], irr_at_15=sm["irr"],
                          er_total=sm["er_total"], er_year1=sm["er"][0], payback_index=sm["payback"])
    case("flare_only", tech="flare")
    case("power_value_zero", Settings(power_price=0))
    case("gwp_29_8", Settings(gwp=29.8))
    case("gwp_21", Settings(gwp=21))
    case("discount_8", Settings(discount=0.08))
    case("discount_12", Settings(discount=0.12))
    case("drained_mandated", drained_mandated=True)
    case("gmi_scale_78", drained=78.0, amm_basis=23.45)
    case("vam_0_1pct_not_abatable", vam_conc=0.001)
    case("crediting_15", Settings(crediting_years=15))
    for yr in range(2027, 2037):
        case(f"closure_{yr}", active=yr - 2027 + 1)
    g = breakeven(S, st, grant=0.30); sens["grant_30"] = dict(breakeven=g, capex=base["capex"] * 0.7,
                                                              npv_at_15=summary(S, st, grant=0.30)["npv"])
    sens["escalation_3pct"] = dict(breakeven_year1_price=breakeven(S, st, escalation=0.03),
                                   npv_at_15=summary(S, st, escalation=0.03)["npv"])
    arche = {}
    for name in M.ARCHETYPES:
        ss = M.archetype_streams(name, st)
        if not ss:
            arche[name] = dict(abatable=False); continue
        a = evaluate(ss, st); sm = summary(ss, st)
        arche[name] = dict(abatable=True, capex=a["capex"], er_year1=a["er_year1"], er_total=a["er_total"],
                           breakeven=a["breakeven"], npv_at_15=a["npv"], irr_at_15=sm["irr"],
                           per_stream={k: v["breakeven"] for k, v in a["per_stream"].items()})
    fin = dict(params=FIN, at_15=financing(S, st), at_5=financing(S, Settings(credit_price=5)),
               wb2034_at_15=financing(moonidih_case(st, active=8), st))
    tor = dict(moonidih_v1=tornado(), moonidih_wb2034=tornado(dict(active=8)))
    wb = moonidih_case(st, active=8); smw = summary(wb, st)
    wbcase = dict(case="Moonidih with closure 2034 from the v5 workbook (FY2025-26 output basis), other inputs DUMMY",
                  capex=smw["capex"], er_by_year=smw["er"], er_total=smw["er_total"], cash=smw["cash"],
                  breakeven=breakeven(wb, st), npv_at_15=smw["npv"], irr_at_15=smw["irr"], payback_index=smw["payback"],
                  waterfall=waterfall(wb, st))
    physics = dict(t_ch4_per_mm3=mass_t(1.0), tco2e_per_mm3_destroyed_gwp28=mass_t(1.0) * M.er_per_t_destroyed(28),
                   gmi_check_78mm3_gwp21_no_combustion=mass_t(78.0) * 21)
    files = dict(moonidih_v1=moon, moonidih_wb2034=wbcase, sensitivities_v1=sens, archetypes_v1=arche,
                 financing_v1=fin, tornado_v1=tor, physics_v1=physics)
    for k, v in files.items():
        json.dump(r6(v), open(os.path.join(OUT, f"{k}.json"), "w"), indent=1)
    print("break-even", round(moon["breakeven"], 4), "| wb2034", round(wbcase["breakeven"], 4))
    for k in "ABCDE": print(k, {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in fin["at_15"][k].items() if "cash" not in kk})
    print("D at $5", round(fin["at_5"]["D"]["cil_npv"] / 1e6, 3), "A at $5", round(fin["at_5"]["A"]["cil_npv"] / 1e6, 3))
    print("tornado", [(d["key"], round(d["low_case"], 2), round(d["high_case"], 2)) for d in tor["moonidih_v1"]["rows"]])
    print("closures", {k: round(v["breakeven"], 2) for k, v in sens.items() if k.startswith("closure")})
    print({k: round(v.get("breakeven", v.get("breakeven_year1_price", 0)), 2) for k, v in sens.items() if not k.startswith("closure")})
    print("wf", {k: round(v, 3) for k, v in moon["waterfall"].items()}, physics)

if __name__ == "__main__":
    main()

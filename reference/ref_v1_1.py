"""Cost build-up for Methane Ledger v1.1 (PLAN_V1 Step 13, Appendix G).
Replaces v1's all-in unit costs with equipment / materials / installation labour / civil works, India factors,
owner's costs, grid connection, staff, insurance, engine overhauls and decommissioning.
With NEUTRAL settings it reproduces v1 exactly (checked below). Run: python3 reference/ref_v1_1.py"""
import copy, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cmm_model as M
from cmm_model import Settings, mass_t, LHV, er_per_t_destroyed
from ref_v1 import moonidih_case, irr, npv, payback, r6, OUT

CATS = ("equipment", "materials", "labour", "civil")
COST_DEFAULT = dict(  # every value DUMMY until Coal India / CMPDI costs arrive
    usd_to_inr=95.0,              # stated by Aashish, Nov 2026; check the RBI reference rate
    local_factor=0.60,            # Indian installation labour and civil works vs the source-country basis of v1 unit costs
    import_markup=0.15,           # customs duty, freight and insurance on imported equipment
    owners_cost=0.10,             # engineering, permits, project management, share of direct capex
    grid_connection_usd=800_000,  # transformer, line, connection charges; only if any stream makes power
    decommissioning=0.05,         # share of total capex, paid in the last year of the period
    insurance=0.01,               # share of total capex, every year
    staff_cost_inr=900_000,       # per person-year, Rs 9 lakh, fully loaded
    headcount=dict(power=12, flare=2, rto=4, drainage=6, monitoring=1),
    split=dict(power=(0.65, 0.10, 0.15, 0.10), flare=(0.60, 0.15, 0.15, 0.10),
               rto=(0.60, 0.15, 0.15, 0.10), drainage=(0.30, 0.30, 0.25, 0.15)),
    imported=dict(power=1.0, flare=0.5, rto=1.0, drainage=0.3),   # share of equipment that is imported
    nonlabour_om=dict(power_per_mwh=9.0, flare_frac=0.03, rto_frac=0.035, drainage_frac=0.025),
    overhaul_usd_per_kw=250.0, overhaul_hours=60_000.0,
)
NEUTRAL = dict(COST_DEFAULT, local_factor=1.0, import_markup=0.0, owners_cost=0.0, grid_connection_usd=0.0,
               decommissioning=0.0, insurance=0.0, staff_cost_inr=0.0, overhaul_usd_per_kw=0.0,
               nonlabour_om=dict(power_per_mwh=15.0, flare_frac=0.05, rto_frac=0.06, drainage_frac=0.04))

def item_factor(C, key):
    eq, mat, lab, civ = C["split"][key]
    imp = C["imported"][key]
    parts = dict(equipment=eq * (imp * (1 + C["import_markup"]) + (1 - imp)), materials=mat,
                 labour=lab * C["local_factor"], civil=civ * C["local_factor"])
    return parts

def flows_buildup(streams, st, C, price=None, grant=0.0):
    T = M.TECH; n = st.crediting_years; P = st.credit_price if price is None else price
    fx = C["usd_to_inr"]; staff_usd = C["staff_cost_inr"] / fx if fx else 0.0
    cap_items = []          # rows: stream, item, category -> USD (after owner's cost and contingency)
    er = [0.0] * n; erev = [0.0] * n
    opex = {k: [0.0] * n for k in ("om", "overhaul", "staff", "insurance", "fan_power", "decommissioning")}
    any_power = False
    for s in streams:
        t = T[s.tech]; cap = max(s.volumes) * s.capture_eff
        base = {}
        kw = 0.0
        if s.tech == "power":
            any_power = True
            kw = mass_t(cap) * LHV * t["eff"] / 3.6 * 1000 / (8760 * t["avail"]); base["power"] = kw * t["capex_per_kw"]
        elif s.tech == "flare":
            base["flare"] = cap * t["capex_per_mm3"]
        elif s.tech == "rto":
            base["rto"] = cap * 1e6 / s.conc / (8760 * 3600) * t["capex_per_m3s"]
        if s.needs_drainage_capex:
            base["drainage"] = cap * T["drainage_system"]["capex_per_mm3"]
        stream_capex = 0.0; tech_capex = 0.0
        for key, b in base.items():
            for cat, f in item_factor(C, key).items():
                v = b * f * (1 + C["owners_cost"]) * (1 + st.contingency)
                cap_items.append(dict(stream=s.kind, item=key, category=cat, usd=v)); stream_capex += v
                if key != "drainage": tech_capex += v
        for i, v in enumerate(s.volumes[:n]):
            captured = mass_t(v * s.capture_eff); destroyed = captured * t["de"]
            er[i] += 0.0 if s.mandated_destruction else destroyed * er_per_t_destroyed(st.gwp)
            running = v > 0
            if s.tech == "power":
                mwh = captured * LHV * t["eff"] / 3.6
                erev[i] += mwh * st.power_price
                opex["om"][i] += mwh * C["nonlabour_om"]["power_per_mwh"]
                if kw > 0 and C["overhaul_hours"] > 0:
                    opex["overhaul"][i] += C["overhaul_usd_per_kw"] * (mwh * 1000 / C["overhaul_hours"])  # $/kW x running kW-h / interval
            elif s.tech == "flare":
                opex["om"][i] += stream_capex * C["nonlabour_om"]["flare_frac"]  # v1 basis: whole stream capex incl. drainage
            elif s.tech == "rto":
                opex["om"][i] += stream_capex * C["nonlabour_om"]["rto_frac"]
                opex["fan_power"][i] += v * s.capture_eff * 1e6 / s.conc / (8760 * 3600) * t["kwh_per_m3s_yr"] / 1000 * st.power_price
            if s.needs_drainage_capex:
                opex["om"][i] += max(s.volumes) * T["drainage_system"]["capex_per_mm3"] * C["nonlabour_om"]["drainage_frac"]
                if running: opex["staff"][i] += C["headcount"]["drainage"] * staff_usd
            if running: opex["staff"][i] += C["headcount"][s.tech] * staff_usd
    grid = C["grid_connection_usd"] if any_power else 0.0
    if grid: cap_items.append(dict(stream="site", item="grid_connection", category="civil", usd=grid))
    cap_items.append(dict(stream="site", item="monitoring", category="equipment", usd=st.monitoring_capex))
    capex = sum(r["usd"] for r in cap_items) * (1 - grant)
    for i in range(n):
        opex["staff"][i] += C["headcount"]["monitoring"] * staff_usd
        opex["insurance"][i] += C["insurance"] * capex
    opex["decommissioning"][n - 1] += C["decommissioning"] * capex
    mrv = [st.verification_cost + (st.validation_cost if i == 0 else 0) for i in range(n)]
    tot_opex = [sum(opex[k][i] for k in opex) for i in range(n)]
    credit = [er[i] * (P * (1 - st.credit_fee_share) - st.issuance_fee) for i in range(n)]
    cash = [-capex] + [credit[i] + erev[i] - tot_opex[i] - mrv[i] for i in range(n)]
    return dict(capex=capex, cap_items=cap_items, er=er, energy=erev, opex_by=opex, opex=tot_opex, mrv=mrv,
                credit=credit, cash=cash)

def breakeven_buildup(streams, st, C, grant=0.0):
    f = flows_buildup(streams, st, C, price=0.0, grant=grant); r = st.discount; n = st.crediting_years
    pv = lambda xs: sum(x / (1 + r) ** (i + 1) for i, x in enumerate(xs))
    num = f["capex"] + pv([f["opex"][i] + f["mrv"][i] - f["energy"][i] for i in range(n)]) + st.issuance_fee * pv(f["er"])
    return num / ((1 - st.credit_fee_share) * pv(f["er"]))

def summary(streams, st, C, **kw):
    f = flows_buildup(streams, st, C, **kw)
    by_cat = {c: sum(x["usd"] for x in f["cap_items"] if x["category"] == c) for c in CATS}
    by_item = {}
    for x in f["cap_items"]: by_item[x["item"]] = by_item.get(x["item"], 0) + x["usd"]
    return dict(capex=f["capex"], capex_by_category=by_cat, capex_by_item=by_item,
                opex_year1_by_type={k: v[0] for k, v in f["opex_by"].items()}, opex_year1=f["opex"][0],
                opex_total=sum(f["opex"]), breakeven=breakeven_buildup(streams, st, C, grant=kw.get("grant", 0.0)),
                npv_at_15=npv(f["cash"], st.discount), irr_at_15=irr(f["cash"]), payback_index=payback(f["cash"]),
                er_total=sum(f["er"]), cash=f["cash"])

def main():
    st = Settings()
    import ref_v1 as R
    for act in (4, 8):
        S = moonidih_case(st, active=act)
        assert abs(breakeven_buildup(S, st, NEUTRAL) - R.breakeven(S, st)) < 1e-9, "neutral must equal v1"
        assert abs(summary(S, st, NEUTRAL)["npv_at_15"] - R.summary(S, st)["npv"]) < 1e-6
    ff = moonidih_case(st, tech="flare")
    assert abs(breakeven_buildup(ff, st, NEUTRAL) - R.breakeven(ff, st)) < 1e-9
    out = dict(params_default=COST_DEFAULT, params_neutral=NEUTRAL,
               note="NEUTRAL reproduces tests/golden/moonidih_v1.json exactly; DEFAULT is the v1.1 India build-up (all DUMMY)")
    cases = dict(
        moonidih_2030_default=(dict(active=4), {}),
        moonidih_2034_default=(dict(active=8), {}),
        moonidih_2030_fx85=(dict(active=4), dict(usd_to_inr=85.0)),
        moonidih_2030_local_factor_1=(dict(active=4), dict(local_factor=1.0)),
        moonidih_2030_no_import_markup=(dict(active=4), dict(import_markup=0.0)),
        moonidih_2030_staff_x2=(dict(active=4), dict(staff_cost_inr=1_800_000)),
        moonidih_2030_flare_default=(dict(active=4, tech="flare"), {}),
    )
    for name, (ck, cp) in cases.items():
        out[name] = summary(moonidih_case(st, **ck), st, dict(COST_DEFAULT, **cp))
    out["moonidih_2030_default_grant30"] = summary(moonidih_case(st, active=4), st, COST_DEFAULT, grant=0.30)
    json.dump(r6(out), open(os.path.join(OUT, "costs_v1_1.json"), "w"), indent=1)
    for k, v in out.items():
        if isinstance(v, dict) and "breakeven" in v:
            print(f"{k:34s} be ${v['breakeven']:.2f}  capex ${v['capex']/1e6:.2f}M  opex y1 ${v['opex_year1']/1e6:.2f}M  npv ${v['npv_at_15']/1e6:.2f}M")
    d = out["moonidih_2030_default"]
    print({k: round(v / 1e6, 3) for k, v in d["capex_by_category"].items()}, {k: round(v / 1e6, 3) for k, v in d["capex_by_item"].items()})
    print({k: round(v / 1e3, 1) for k, v in d["opex_year1_by_type"].items()})

if __name__ == "__main__":
    main()

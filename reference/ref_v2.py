"""Methane Ledger v2 reference: estimated model inputs for EVERY Coal India mine (PLAN_V2 Appendix B).
Builds each mine's gas streams from its real output and closure year plus a gassiness default, then runs the
v1.1 cost build-up. Run from the repo root: python3 reference/ref_v2.py  (writes tests/golden/estimation_v2.json)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cmm_model as M
from cmm_model import Settings, Stream, amm_profile
import ref_v1_1 as C
from ref_v1 import r6

ROOT = os.path.join(HERE, '..')
MAP = json.load(open(os.path.join(ROOT, 'src', 'generated', 'mines_map.json')))
TL = json.load(open(os.path.join(ROOT, 'src', 'generated', 'closure_timeline.json')))
OUT = os.path.join(ROOT, 'tests', 'golden', 'estimation_v2.json')

# Gassiness grade (DGMS degree) by coalfield, until a mine-wise DGMS list replaces it. ESTIMATED.
DEGREE_BY_FIELD = {'jharia': 3, 'raniganj': 2, 'e_bokaro': 2, 'w_bokaro': 2, 'mugma': 2}
DEFAULT_DEGREE = 1
# Per degree: specific emission m3 CH4 per t coal, drained share, drained CH4 share, ventilation-air CH4 share.
# Same values as the v1 archetypes (reference/cmm_model.py ARCHETYPES).
BY_DEGREE = {1: dict(se=0.8, dshare=0.0, dconc=0.0, vconc=0.0005),
             2: dict(se=5.0, dshare=0.30, dconc=0.35, vconc=0.002),
             3: dict(se=15.0, dshare=0.50, dconc=0.50, vconc=0.004)}
OPENCAST = dict(se=0.3, dshare=0.0, dconc=0.0, vconc=0.0)
MIXED_UG_SHARE = 0.5          # share of a mixed mine's output assumed to come from underground workings
F_AMM, AMM_CONC, CAP_VAM, CAP_AMM = 0.30, 0.60, 0.85, 0.70


def estimate(mine_id, st, closure_override=None, tech_override=None):
    m = next(x for x in MAP['mines'] if x['id'] == mine_id)
    t = TL[mine_id]
    n, start = st.crediting_years, st.start_year
    out = dict(id=mine_id, name=m['name'], type=m['type'], field=m['field'], status=t['status'], warnings=[])
    P = t.get('rateUsedMtPerYr') or 0.0
    if P <= 0:
        out.update(modelStatus='no_output', reason='No recent output. Enter coal output to model this mine.')
        return out, []
    ry = t.get('runoutYear')
    if ry is None:                               # "After 2225": runs past the crediting window
        closure = start + n - 1 + 1
    else:
        closure = ry
    if closure_override is not None:
        closure = closure_override
    if t['status'] == 'Past reported reserve' or closure < start:
        closure = max(closure, start)
        out['warnings'].append('closure_uncertain')
    active = max(0, min(n, closure - start + 1))
    if m['type'] == 'OC':
        p, degree, P_ug = OPENCAST, None, P
    else:
        degree = DEGREE_BY_FIELD.get(m['field'], DEFAULT_DEGREE)
        p = BY_DEGREE[degree]
        P_ug = P * (MIXED_UG_SHARE if m['type'] == 'Mixed' else 1.0)
    total = P_ug * p['se']                       # Mm3 CH4 a year (Mt x m3/t)
    out.update(productionMt=P, ugProductionMt=P_ug, degree=degree, specificEmission=p['se'], totalMm3=total,
               closureYear=closure, activeYears=active,
               drainedMm3=total * p['dshare'], vamMm3=total * (1 - p['dshare']), drainedConc=p['dconc'], vamConc=p['vconc'])
    streams = []
    if p['dshare'] > 0:
        streams.append(Stream('drained', 'drained', p['dconc'], [total * p['dshare']] * active + [0] * (n - active),
                              tech_override or ('power' if p['dconc'] >= M.TECH['power']['min_conc'] else 'flare'), needs_drainage_capex=True))
    if p['vconc'] >= M.TECH['rto']['min_conc']:
        streams.append(Stream('vam', 'vam', p['vconc'], [total * (1 - p['dshare'])] * active + [0] * (n - active), 'rto',
                              capture_eff=CAP_VAM))
    if active < n and p['dshare'] > 0:
        streams.append(Stream('amm', 'amm', AMM_CONC, [0] * active + amm_profile(F_AMM * total, n - active), tech_override or 'power',
                              capture_eff=CAP_AMM))
    if not streams:
        out.update(modelStatus='not_abatable',
                   reason='Opencast: no concentrated stream to capture.' if m['type'] == 'OC'
                   else 'Ventilation air is 0.05% methane, below the 0.2% an oxidiser needs, and there is no drained gas.')
        return out, []
    out['modelStatus'] = 'ok'
    return out, streams


def run(mine_id, st):
    est, streams = estimate(mine_id, st)
    if est['modelStatus'] == 'ok':
        s = C.summary(streams, st, C.COST_DEFAULT)
        est.update(breakeven=s['breakeven'], capex=s['capex'], npv_at_15=s['npv_at_15'], irr_at_15=s['irr_at_15'],
                   er_total=s['er_total'], payback_index=s['payback_index'])
    return est


def closure_curve(st):
    import ref_v1 as R
    years = list(range(st.start_year, st.start_year + st.crediting_years))
    rec = {tech: {y: C.breakeven_buildup(R.moonidih_case(st, active=y - st.start_year + 1, tech=tech), st, C.COST_DEFAULT) for y in years}
           for tech in ('power', 'flare')}
    def est(tech):
        res = {}
        for y in years:
            e, ss = estimate('bccl-amp-colliery', st, closure_override=y, tech_override=tech)
            res[y] = C.breakeven_buildup(ss, st, C.COST_DEFAULT)
        return res
    amp = {tech: est(tech) for tech in ('power', 'flare')}
    def cross(c):
        return next((y for y in years if c['power'][y] <= c['flare'][y]), None)
    return dict(moonidih_record=dict(curve=rec, crossover_year=cross(rec)),
                amp_colliery_estimate=dict(curve=amp, crossover_year=cross(amp)))


def main():
    st = Settings()
    picks = ['bccl-moonidih', 'ecl-belbaid-colliery', 'ccl-dhori-khas-ug', 'secl-khairaha', 'secl-churcha-ro']
    ids = {m['id'] for m in MAP['mines']}
    picks = [p for p in picks if p in ids]
    # one of each other kind
    for pred in (lambda m: m['type'] == 'Mixed' and m['field'] == 'jharia',
                 lambda m: m['type'] == 'OC' and m['band'] == 'by2031',
                 lambda m: TL[m['id']]['status'] == 'Not producing',
                 lambda m: TL[m['id']]['status'] == 'Past reported reserve' and m['type'] != 'OC',
                 lambda m: m['runoutYear'] is None and m['type'] == 'UG'):
        x = next((m for m in MAP['mines'] if pred(m) and TL[m['id']].get('rateUsedMtPerYr', 0) is not None), None)
        if x and x['id'] not in picks:
            picks.append(x['id'])
    cases = {p: run(p, st) for p in picks}
    allres = [run(m['id'], st) for m in MAP['mines']]
    ok = [r for r in allres if r['modelStatus'] == 'ok']
    summary = dict(mines=len(allres),
                   by_status={k: sum(1 for r in allres if r['modelStatus'] == k) for k in ('ok', 'not_abatable', 'no_output')},
                   pays_at_15=sum(1 for r in ok if r['breakeven'] <= 15),
                   pays_at_7=sum(1 for r in ok if r['breakeven'] <= 7),
                   er_total_ok_mt=sum(r['er_total'] for r in ok) / 1e6,
                   er_total_pays_at_15_mt=sum(r['er_total'] for r in ok if r['breakeven'] <= 15) / 1e6,
                   cheapest=sorted(((r['name'], round(r['breakeven'], 2)) for r in ok), key=lambda x: x[1])[:8])
    out = dict(note='Estimated inputs for every mine from real output and closure year plus coalfield gassiness defaults (ESTIMATED). '
                    'Moonidih here is the ESTIMATE, not its data/mines.json record; the app uses the record when one exists.',
               params=dict(DEGREE_BY_FIELD=DEGREE_BY_FIELD, DEFAULT_DEGREE=DEFAULT_DEGREE, BY_DEGREE=BY_DEGREE, OPENCAST=OPENCAST,
                           MIXED_UG_SHARE=MIXED_UG_SHARE, F_AMM=F_AMM, AMM_CONC=AMM_CONC, CAP_VAM=CAP_VAM, CAP_AMM=CAP_AMM),
               cases=cases, summary=summary, closure_curve=closure_curve(st))
    json.dump(r6(out), open(OUT, 'w'), indent=1)
    for k, v in cases.items():
        print(f"{v['name'][:28]:28s} {v['type']:5s} {v['field']:11s} {v['modelStatus']:12s} deg {v.get('degree')} P {v.get('productionMt')} close {v.get('closureYear')} be {round(v['breakeven'],2) if 'breakeven' in v else '-'}")
    print(json.dumps(r6(summary), indent=1))


if __name__ == '__main__':
    main()

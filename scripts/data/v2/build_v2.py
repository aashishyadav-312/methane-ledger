"""Build src/generated/v2/mines_v2.json and src/generated/v2/gem_match_report.csv (PLAN_V2 Step 1).

Inputs:
  src/generated/mines_map.json, closure_timeline.json   v1 outputs (positions by coalfield, closure years)
  data/raw/gem/Global-Coal-Mine-Tracker.xlsx            Global Energy Monitor's Global Coal Mine Tracker (optional)
  data/gem_overrides.csv                                mine_id, gem_id_or_none (wins over every rule)

Every mine keeps its v1 coalfield position unless a GEM mine is matched to it. A matched mine takes the GEM
latitude and longitude, projected with the v1 projection (Appendix A).

Run from the repo root: python3 scripts/data/v2/build_v2.py   (needs openpyxl, shapely and rapidfuzz: npm run py:setup)
"""
import csv
import json
import math
import os
import re
import sys
import unicodedata
import warnings

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "data"))

import build_data as v1  # noqa: E402  (v1 projection, coalfield centroids and the compact JSON writer)

try:
    from rapidfuzz import fuzz
except ImportError:  # the no-GEM path must still build
    fuzz = None

MAP_JSON = os.path.join(ROOT, "src", "generated", "mines_map.json")
TIMELINE_JSON = os.path.join(ROOT, "src", "generated", "closure_timeline.json")
GEM_XLSX = os.path.join(ROOT, "data", "raw", "gem", "Global-Coal-Mine-Tracker.xlsx")
OVERRIDES_CSV = os.path.join(ROOT, "data", "gem_overrides.csv")
OUT_DIR = os.path.join(ROOT, "src", "generated", "v2")
OUT_JSON = os.path.join(OUT_DIR, "mines_v2.json")
OUT_REPORT = os.path.join(OUT_DIR, "gem_match_report.csv")

# ---------- GEM matching rules (PLAN_V2 Step 1) ----------
GEM_SHEET = "Non-closed mines"
MIN_NAME_SCORE = 88           # rapidfuzz token_set_ratio, 0 to 100
MAX_CENTROID_KM = 60.0        # a GEM point must lie this close to the mine's coalfield centroid
EARTH_RADIUS_KM = 6371.0088
GEM_COUNTRY = "India"
# Owner or parent company text that marks a Coal India mine: the holding company and each subsidiary.
CIL_OWNER_MARKERS = (
    "coal india", "bharat coking coal", "eastern coalfields", "central coalfields", "western coalfields",
    "south eastern coalfields", "mahanadi coalfields", "northern coalfields", "north eastern coalfields",
)
# When one GEM mine has several rows (an operating mine and its proposed expansion), the best status wins.
GEM_STATUS_RANK = {"Operating": 0, "Mothballed": 1, "Proposed": 2, "Shelved": 3, "Cancelled": 4}
GEM_METHANE_UNIT = "million m3 of CH4 a year (GEM column 'GEM Coal Mine Methane Emissions Estimate (MCM/yr)')"

# v1 mine fields that v2 leaves out to stay under the 220 kB budget. `wbId` is the workbook row number, which nothing
# in v2 reads. `modelled` means "has a record in data/mines.json" in v1; in v2 every mine can be modelled, so the flag
# would mislead (src/data and Step 2 decide record versus estimate from data/mines.json).
DROPPED_V1_FIELDS = ("wbId", "modelled")

# ---------- search normalisation (PLAN_V2 Appendix G) ----------
GENERIC_TOKENS = frozenset(
    "colliery project mine mines ug oc ocp ocm incline pit expn expansion".split()
)
# Extra words that carry no identity when matching names against GEM ("Adasa Coal Mine", "Cluster 11").
MATCH_EXTRA_TOKENS = frozenset("coal cluster area".split())

# ---------- gassiness grade ----------
# Same table as reference/ref_v2.py (DEGREE_BY_FIELD, DEFAULT_DEGREE): estimated by coalfield until a mine-wise DGMS
# list exists. tests/data/v2 checks it against tests/golden/estimation_v2.json. Opencast mines have no degree.
DEGREE_BY_FIELD = {"jharia": 3, "raniganj": 2, "e_bokaro": 2, "w_bokaro": 2, "mugma": 2}
DEFAULT_DEGREE = 1

# Display names for the coalfield keys, used by the search (Appendix G: coalfield name, weight 0.5).
COALFIELD_NAMES = {
    "raniganj": "Raniganj", "mugma": "Mugma", "rajmahal": "Rajmahal", "chitra": "Chitra", "jharia": "Jharia",
    "s_karanpura": "South Karanpura", "ramgarh": "Ramgarh", "n_karanpura": "North Karanpura",
    "w_bokaro": "West Bokaro", "e_bokaro": "East Bokaro", "giridih": "Giridih", "daltonganj": "Daltonganj",
    "singrauli": "Singrauli", "chandrapur": "Chandrapur", "ballarpur": "Ballarpur", "wani": "Wardha Valley",
    "nagpur": "Kamptee", "umrer": "Umrer", "pench": "Pench Kanhan", "pathakhera": "Pathakhera",
    "sohagpur": "Sohagpur", "johilla": "Johilla", "chirimiri": "Chirimiri", "hasdeo": "Hasdeo",
    "bisrampur": "Bisrampur", "korba": "Korba", "mand": "Mand Raigarh", "talcher": "Talcher",
    "ib_valley": "IB Valley", "makum": "Makum",
}


def tokens_of(text):
    """Lower-case, accents stripped, punctuation turned into spaces, split into words."""
    t = unicodedata.normalize("NFKD", text or "")
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).split()


def search_key(text, strip_generic=True):
    """Appendix G normalisation. With strip_generic=False only the case, accent and punctuation steps run."""
    words = tokens_of(text)
    if strip_generic:
        kept = [w for w in words if w not in GENERIC_TOKENS]
        words = kept or words  # a name made only of generic words keeps them
    return " ".join(words)


def match_key(text):
    words = [w for w in tokens_of(text) if w not in GENERIC_TOKENS and w not in MATCH_EXTRA_TOKENS]
    return " ".join(words or tokens_of(text))


def has_identity(key):
    """A name fragment such as "10" or "ii" (from an AKA like "Cluster 10") says nothing about which mine it is."""
    return any(len(w) >= 3 and w.isalpha() for w in key.split())


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def state_key(text):
    return " ".join(tokens_of(text))


# ---------- reading GEM ----------
def to_float(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def read_gem(path=GEM_XLSX):
    """Return one record per GEM mine ID for Coal India mines in India, or None if the workbook is missing."""
    if not os.path.exists(path):
        return None
    import openpyxl
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        rows = list(wb[GEM_SHEET].iter_rows(values_only=True))
    header = [str(c).strip() if c is not None else "" for c in rows[0]]

    def col(prefix):
        hits = [i for i, h in enumerate(header) if h == prefix] or [i for i, h in enumerate(header) if h.startswith(prefix)]
        if len(hits) != 1:
            sys.exit(f"GEM sheet '{GEM_SHEET}': expected one column named '{prefix}', found {len(hits)}")
        return hits[0]

    c = dict(
        id=col("GEM Mine ID"), country=col("Country / Area"), name=col("Mine Name"), akas=col("Mine Name AKAs"),
        status=col("Status"), owners=col("Owners"), parent=col("Parent Company"), state=col("State, Province"),
        lat=col("Latitude"), lon=col("Longitude"), accuracy=col("Location Accuracy"),
        methane=col("GEM Coal Mine Methane Emissions Estimate (MCM/yr)"),
    )
    best = {}
    for r in rows[1:]:
        if r[c["country"]] != GEM_COUNTRY:
            continue
        owner_text = f"{r[c['owners']] or ''} {r[c['parent']] or ''}".lower()
        if not any(m in owner_text for m in CIL_OWNER_MARKERS):
            continue
        lat, lon = to_float(r[c["lat"]]), to_float(r[c["lon"]])
        if lat is None or lon is None:
            continue
        gid = str(r[c["id"]]).strip()
        rank = GEM_STATUS_RANK.get(r[c["status"]], 9)
        if gid in best and best[gid]["rank"] <= rank:
            continue
        akas = [a.strip() for a in re.split(r"[;,\n]", r[c["akas"]] or "") if a.strip()]
        best[gid] = dict(
            id=gid, name=str(r[c["name"]]).strip(), akas=akas, status=r[c["status"]], rank=rank,
            state=(r[c["state"]] or "").strip(), lat=lat, lon=lon, accuracy=r[c["accuracy"]],
            methane_mm3=to_float(r[c["methane"]]),
        )
    for g in best.values():
        g["keys"] = sorted({match_key(n) for n in [g["name"], *g["akas"]] if has_identity(match_key(n))})
        g["state_key"] = state_key(g["state"])
    return best


def read_overrides(path=OVERRIDES_CSV):
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            mid = (row.get("mine_id") or "").strip()
            gid = (row.get("gem_id_or_none") or "").strip()
            if mid and not mid.startswith("#"):
                out[mid] = gid
    return out


# ---------- matching ----------
def best_candidate(mine, gem, centroid):
    """Closest GEM mine by name for `mine`, ignoring the state and distance rules, with those checks attached."""
    mk = match_key(mine["name"])
    cands = []
    for g in gem.values():
        score = max((fuzz.token_set_ratio(mk, k) for k in g["keys"]), default=0.0)
        km = haversine_km(centroid[0], centroid[1], g["lat"], g["lon"])
        state_ok = g["state_key"] == state_key(mine["state"])
        cands.append(dict(g=g, score=score, km=km, state_ok=state_ok, near_ok=km <= MAX_CENTROID_KM))
    return cands


def match_mine(mine, gem, overrides):
    centroid = v1.C[mine["field"]][:2]
    if mine["id"] in overrides:
        gid = overrides[mine["id"]]
        if gid.lower() in ("", "none"):
            return None, dict(rule="override_none", score="", km="", state_check="", note="forced to no match")
        g = gem.get(gid)
        if g is None:
            sys.exit(f"gem_overrides.csv: {mine['id']} names {gid}, which is not a Coal India mine in the GEM sheet")
        km = haversine_km(centroid[0], centroid[1], g["lat"], g["lon"])
        return g, dict(rule="override", score="", km=round(km, 1),
                       state_check="pass" if g["state_key"] == state_key(mine["state"]) else "fail", note="")
    cands = best_candidate(mine, gem, centroid)
    ok = [c for c in cands if c["score"] >= MIN_NAME_SCORE and c["state_ok"] and c["near_ok"]]
    if ok:
        top = max(c["score"] for c in ok)
        tied = [c for c in ok if c["score"] == top]
        c = min(tied, key=lambda c: (c["km"], c["g"]["id"]))
        return c["g"], dict(rule="name+state+60km", score=round(c["score"], 1), km=round(c["km"], 1),
                            state_check="pass", note=f"{len(tied)} tied" if len(tied) > 1 else "")
    # No match: say why the closest name failed, to help writing an override.
    named = [c for c in cands if c["score"] >= MIN_NAME_SCORE]
    pool = named or cands
    c = max(pool, key=lambda c: (c["score"], -c["km"]))
    why = []
    if c["score"] < MIN_NAME_SCORE:
        why.append(f"name score {c['score']:.0f} < {MIN_NAME_SCORE}")
    if not c["state_ok"]:
        why.append(f"state {c['g']['state'] or 'blank'}")
    if not c["near_ok"]:
        why.append(f"{c['km']:.0f} km from centroid")
    return None, dict(rule="none", score=round(c["score"], 1), km=round(c["km"], 1),
                      state_check="pass" if c["state_ok"] else "fail",
                      note=f"closest {c['g']['id']} {c['g']['name']}: " + "; ".join(why), closest=c["g"])


# ---------- build ----------
def degree_for(mine):
    if mine["type"] == "OC":
        return None
    return DEGREE_BY_FIELD.get(mine["field"], DEFAULT_DEGREE)


def build(gem_path=GEM_XLSX, overrides_path=OVERRIDES_CSV):
    """Return (mines_v2 dict, report rows). Writes nothing."""
    with open(MAP_JSON) as f:
        v1_map = json.load(f)
    with open(TIMELINE_JSON) as f:
        timeline = json.load(f)
    gem = read_gem(gem_path)
    if gem is not None and fuzz is None:
        sys.exit("rapidfuzz is not installed. Run: npm run py:setup")
    overrides = read_overrides(overrides_path)
    unknown = [m for m in overrides if m not in {x["id"] for x in v1_map["mines"]}]
    if unknown:
        sys.exit(f"gem_overrides.csv names unknown mines: {unknown}")

    mines, report = [], []
    for m in v1_map["mines"]:
        out = {k: v for k, v in m.items() if k not in DROPPED_V1_FIELDS}
        rate = (timeline.get(m["id"]) or {}).get("rateUsedMtPerYr")
        g, info = (None, dict(rule="no_gem_file", score="", km="", state_check="", note="")) if gem is None \
            else match_mine(m, gem, overrides)
        if g is not None:
            x, y = v1.proj(g["lon"], g["lat"])
            out.update(x=round(x, 1), y=round(y, 1), lat=round(g["lat"], 4), lon=round(g["lon"], 4),
                       positionQuality="gem", gemId=g["id"],
                       gemMethaneMm3=None if g["methane_mm3"] is None else round(g["methane_mm3"], 3))
        else:
            out.update(lat=None, lon=None, positionQuality="coalfield", gemId=None, gemMethaneMm3=None)
        out["degreeEstimate"] = degree_for(m)
        out["searchKey"] = search_key(m["name"])
        mines.append(out)

        closest = info.pop("closest", None)
        report.append(dict(
            mine_id=m["id"], mine_name=m["name"].replace("\n", " "), company=m["company"], state=m["state"],
            field=m["field"], output_mt_per_year=rate if rate is not None else "",
            matched="yes" if g is not None else "no",
            gem_id=g["id"] if g else "", gem_name=g["name"] if g else "", gem_status=g["status"] if g else "",
            gem_state=g["state"] if g else (closest["state"] if closest else ""),
            score=info["score"], distance_to_centroid_km=info["km"], state_check=info["state_check"],
            rule=info["rule"], note=info["note"],
        ))

    out = dict(
        sourceGeneratedAt=v1_map["generatedAt"],
        sources=v1_map["sources"] + ([
            "Global Energy Monitor, Global Coal Mine Tracker, August 2026 release, CC BY 4.0 (mine coordinates and mine-level methane estimate)",
        ] if gem is not None else []),
        note=("Positions are GEM coordinates where positionQuality is 'gem', else approximate and placed by coalfield. "
              "Closure year = reserve run-out at FY2025-26 output. gemMethaneMm3 is GEM's estimate in "
              "million m3 of CH4 a year, shown as a comparison and never as a model input. degreeEstimate is "
              "an estimated gassiness grade by coalfield."),
        gemMethaneUnit=GEM_METHANE_UNIT,
        viewBox=v1_map["viewBox"], projection=v1_map["projection"], bands=v1_map["bands"], lens=v1_map["lens"],
        cities=v1_map["cities"],
        outline=v1_map["outline"],            # one path for the whole India outline: fill it and stroke it
        coalStates=v1_map["coalStates"],
        coalfieldNames=COALFIELD_NAMES,
        mines=mines,
        closedMines=v1_map["closed"],
    )
    flag_shared(report)
    return out, report


def flag_shared(report):
    """Mark GEM mines matched by more than one Coal India mine (for example an UG and an OC working of one mine)."""
    counts = {}
    for r in report:
        if r["gem_id"]:
            counts[r["gem_id"]] = counts.get(r["gem_id"], 0) + 1
    for r in report:
        r["gem_matched_by"] = counts.get(r["gem_id"], "") if r["gem_id"] else ""


REPORT_COLUMNS = ["mine_id", "mine_name", "company", "state", "field", "output_mt_per_year", "matched", "gem_id",
                  "gem_name", "gem_status", "gem_state", "gem_matched_by", "score", "distance_to_centroid_km", "state_check", "rule",
                  "note"]


def write_report(report, path=OUT_REPORT):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=REPORT_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(report)


def main():
    out, report = build()
    os.makedirs(OUT_DIR, exist_ok=True)
    v1.dump_compact(out, OUT_JSON, {"mines", "closedMines", "coalStates", "cities"})
    write_report(report)
    n_gem = sum(1 for m in out["mines"] if m["positionQuality"] == "gem")
    print(f"mines {len(out['mines'])}, closed {len(out['closedMines'])}, matched to GEM {n_gem}, "
          f"with GEM methane {sum(1 for m in out['mines'] if m['gemMethaneMm3'] is not None)}")
    print(f"{os.path.relpath(OUT_JSON, ROOT)}: {os.path.getsize(OUT_JSON)} bytes")
    un = sorted((r for r in report if r["matched"] == "no"),
                key=lambda r: -(r["output_mt_per_year"] if r["output_mt_per_year"] != "" else 0))[:20]
    if un:
        print("20 largest unmatched mines by output (Mt a year):")
        for r in un:
            print(f"  {r['output_mt_per_year']!s:>8}  {r['mine_id']}  {r['note']}")


if __name__ == "__main__":
    main()

"""Build src/generated/mines_map.json and src/generated/closure_timeline.json from the raw source files.

Ported from scripts/reference/build_map_mock.py (projection, coalfield clusters, keyword rules and md5 jitter are kept
exactly). Positions are approximate: coalfield centroid plus a fixed jitter.

Run with: npm run data
"""
import datetime
import hashlib
import json
import math
import os
import re
import sys
import warnings

import openpyxl
from shapely.geometry import MultiPolygon, Polygon, shape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
XLSX = os.path.join(ROOT, "data", "raw", "CIL_Mine_Closure_Timeline_v5.xlsx")
LSTXT = os.path.join(ROOT, "data", "raw", "LokSabha_AU4259_annexures.txt")
OUTLINE_GEOJSON = os.path.join(ROOT, "data", "geo", "india_outline.geojson")
STATES_GEOJSON = os.path.join(ROOT, "data", "geo", "coal_states.geojson")
MINES_JSON = os.path.join(ROOT, "data", "mines.json")
OUT_DIR = os.path.join(ROOT, "src", "generated")

SHEET = "Mine Closure Timeline"
FIRST_ROW, LAST_ROW = 7, 317
HEADER_ROW = 6

# Projection (docs/DESIGN.md > Map): equirectangular around 22 degrees N.
LAT0 = 22.0
K = 33.0
LON_MIN, LAT_MAX = 68.0, 37.2
COS = math.cos(math.radians(LAT0))

# Geography simplification (degrees, square degrees).
SIMPLIFY_TOL_DEG = 0.02
MIN_RING_AREA_DEG2 = 0.02

# Lens (docs/DESIGN.md > Map): window [x, y, w, h] redrawn in the Bay of Bengal at box [x, y, width].
LENS = {"window": [548, 435.5, 26, 19], "box": [612, 596, 232]}

# Moonidih is pinned (docs/DESIGN.md > Map; PLAN_V1 Step 1).
MOONIDIH_ID = "bccl-moonidih"
MOONIDIH_LAT, MOONIDIH_LON = 23.735, 86.335

# (name, latitude, longitude, label side) from docs/DESIGN.md > Map.
CITIES = [
    ("New Delhi", 28.61, 77.21, "e"),
    ("Mumbai", 19.08, 72.88, "e"),
    ("Kolkata", 22.57, 88.36, "e"),
    ("Ranchi", 23.34, 85.31, "w"),
    ("Nagpur", 21.15, 79.09, "w"),
]

DEFAULT_MODELLED_IDS = [MOONIDIH_ID]

NOTE = "Positions approximate; placed by coalfield. Closure year = reserve run-out at FY2025-26 output."
SOURCES = [
    "CIL_Mine_Closure_Timeline_v5.xlsx, sheet Mine Closure Timeline (Aashish Yadav; Lok Sabha Q.4259 reserves and the "
    "CIL production portal, read 11 Oct 2026)",
    "Lok Sabha Unstarred Question 4259, 26 Mar 2025, Annexure II (closed mines)",
    "DataMeet community maps, based on Survey of India boundaries (https://github.com/datameet/maps)",
]

BAND_KEYS = ["by2031", "by2036", "by2050", "after2050", "nodate", "closed"]

# Column indexes in the Mine Closure Timeline sheet (0-based).
COL = dict(
    id=0, company=1, name=2, state=3, type=4, reserve2024=5, out2324=6, out2425=7, out2526=8, target2627=9,
    out2627=10, left2026=11, left1010=12, rate=13, yearsLeft=14, runoutDate=15, year=16, window=17, status=18,
    yearAtTarget=19, ecCap=20, yearAtEc=21, outShareEc=22, portal=23, note=24,
)

RECALC_MSG = "Open the workbook in Excel, recalculate, save, and rerun."


def proj(lon, lat):
    return ((lon - LON_MIN) * COS * K, (LAT_MAX - lat) * K)


def ring_path(coords):
    pts = [proj(x, y) for x, y in coords]
    return "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"


def geom_path(g, tol=SIMPLIFY_TOL_DEG, min_area=MIN_RING_AREA_DEG2):
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(g.geoms) if isinstance(g, MultiPolygon) else []
    out = []
    for p in polys:
        if p.area < min_area:
            continue
        out.append(ring_path(p.exterior.coords))
    return "".join(out)


# ---------- coalfield clusters (lat, lon, spread deg): unchanged from the mock ----------
C = {
    "raniganj": (23.63, 87.12, 0.22), "mugma": (23.80, 86.72, 0.08), "rajmahal": (24.97, 87.38, 0.06),
    "chitra": (24.12, 86.95, 0.03), "jharia": (23.76, 86.38, 0.10), "s_karanpura": (23.66, 85.33, 0.10),
    "ramgarh": (23.62, 85.58, 0.08), "n_karanpura": (23.87, 84.98, 0.12), "w_bokaro": (23.80, 85.52, 0.07),
    "e_bokaro": (23.79, 85.95, 0.09), "giridih": (24.19, 86.30, 0.03), "daltonganj": (24.03, 84.10, 0.03),
    "singrauli": (24.14, 82.62, 0.14), "chandrapur": (19.97, 79.30, 0.07), "ballarpur": (19.83, 79.40, 0.07),
    "wani": (20.08, 78.95, 0.12), "nagpur": (21.30, 79.02, 0.12), "umrer": (20.85, 79.33, 0.06),
    "pench": (22.17, 78.80, 0.10), "pathakhera": (22.12, 77.95, 0.05), "sohagpur": (23.18, 81.62, 0.15),
    "johilla": (23.45, 80.90, 0.08), "chirimiri": (23.20, 82.36, 0.06), "hasdeo": (23.05, 82.55, 0.10),
    "bisrampur": (23.15, 83.10, 0.12), "korba": (22.35, 82.62, 0.10), "mand": (22.05, 83.35, 0.10),
    "talcher": (20.97, 85.17, 0.10), "ib_valley": (21.92, 83.93, 0.12), "makum": (27.30, 95.72, 0.03),
}

KW = [  # (company, state or None, regex, cluster)
    ("ECL", "Jharkhand", r"rajmahal|hurra", "rajmahal"), ("ECL", "Jharkhand", r"chitra", "chitra"),
    ("ECL", "Jharkhand", r".", "mugma"), ("ECL", None, r".", "raniganj"),
    ("BCCL", None, r".", "jharia"),
    ("CCL", None, r"giridih|kabribad", "giridih"), ("CCL", None, r"rajhara", "daltonganj"),
    ("CCL", None, r"bhurkunda|saunda|sayal|urimari|gidi|religara|sirka|birsa", "s_karanpura"),
    ("CCL", None, r"rajrappa|kuju|topa|pindra|ara |sarubera|chainpur", "ramgarh"),
    ("CCL", None, r"manki|churi|dakra|dewarkhand|purnadih|rohini|tetaria|ashoka|magadh|amrapali|piparwar", "n_karanpura"),
    ("CCL", None, r"pundi|karma|parej|kedla|tapin|jharkhand ocp|laiyo", "w_bokaro"),
    ("CCL", None, r".", "e_bokaro"),
    ("NCL", None, r".", "singrauli"),
    ("WCL", "Madhya Pradesh", r"tawa|chhatarpur|satpura|pathakhera", "pathakhera"),
    ("WCL", "Madhya Pradesh", r".", "pench"),
    ("WCL", None, r"lalpeth|mahakali|rayatwari|durgapur|bhatadi|nandgaon|manna", "chandrapur"),
    ("WCL", None, r"ballarpur|sasti|dhoptala|gouri|paoni", "ballarpur"),
    ("WCL", None, r"makardhokra|umrer|gokul|murpar", "umrer"),
    ("WCL", None, r"silewara|patansaongi|saoner|adasa|inder|kamptee|gondegaon|bhanegaon|singori", "nagpur"),
    ("WCL", None, r".", "wani"),
    ("SECL", "Madhya Pradesh", r"nowrozabad|pali|umaria|piparia|vindhya", "johilla"),
    ("SECL", "Madhya Pradesh", r".", "sohagpur"),
    ("SECL", None, r"jhagrakhand|haldibari|ncph|n\.c\.p\.h|chirimiri|kurasia", "chirimiri"),
    ("SECL", None, r"raniatari|vijay|churcha|katkona|pandavpara|jhilimili", "hasdeo"),
    ("SECL", None, r"gevra|dipka|kusmunda|manikpur|dhelwadih|singhali|bagdeva|saraipali", "korba"),
    ("SECL", None, r"baroud|chhal|jampali|bijari|gare", "mand"),
    ("SECL", None, r".", "bisrampur"),
    ("MCL", None, r"lajkura|samleswari|lakhanpur|basundhara|siarmal|kulda|garjanbahal|hirakhand|orient", "ib_valley"),
    ("MCL", None, r".", "talcher"),
    ("NEC", None, r".", "makum"), ("NECL", None, r".", "makum"),
]


def cluster_for(co, state, name):
    n = (name or "").lower() + " "
    for c, st, rx, cl in KW:
        if c == co and (st is None or st == state) and re.search(rx, n):
            return cl
    return None


def jitter(key, spread):
    h = hashlib.md5(key.encode()).digest()
    a = h[0] / 255 * 2 * math.pi
    r = math.sqrt(h[1] / 255) * spread
    return r * math.cos(a), r * math.sin(a)


def slug(company, name):
    return re.sub(r"[^a-z0-9]+", "-", f"{company} {name}".lower()).strip("-")


def band_for(year, status):
    """Appendix A. `year` is an int, the text 'After 2225', or None."""
    if status == "Past reported reserve":
        return "by2031"
    if year is None:
        return "nodate"
    if isinstance(year, str):
        return "after2050"
    if year <= 2031:
        return "by2031"
    if year <= 2036:
        return "by2036"
    if year <= 2050:
        return "by2050"
    return "after2050"


def num(x, nd=4):
    return round(float(x), nd) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def int_or_none(x):
    return int(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def read_workbook(path=XLSX):
    """Return the 311 sheet rows as lists, after checking that the cached formula values are present."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ws = openpyxl.load_workbook(path, data_only=True)[SHEET]
    header = [c.value for c in ws[HEADER_ROW]]
    if not (str(header[COL["id"]]).strip() == "ID" and "Mine name" in str(header[COL["name"]])):
        sys.exit(f"Unexpected header row {HEADER_ROW} in sheet '{SHEET}': {header[:4]}")
    rows = []
    for r in range(FIRST_ROW, LAST_ROW + 1):
        row = [c.value for c in ws[r]][: COL["note"] + 1]
        # Status, output rate and (for producing mines) the closure year are formulas that always cache a value. A
        # None here means the workbook was saved without being recalculated.
        if row[COL["status"]] is None or row[COL["rate"]] is None:
            sys.exit(f"Row {r}: cached formula values are missing. {RECALC_MSG}")
        if row[COL["status"]] in ("Producing", "Past reported reserve") and row[COL["year"]] is None:
            sys.exit(f"Row {r}: closure year is missing for a producing mine. {RECALC_MSG}")
        rows.append(row)
    return rows


def modelled_ids():
    """IDs with a record in data/mines.json if that file exists, else the hardcoded list (Appendix D)."""
    if not os.path.exists(MINES_JSON):
        return list(DEFAULT_MODELLED_IDS)
    data = json.load(open(MINES_JSON))
    items = data.get("mines", data) if isinstance(data, dict) else data
    if isinstance(items, dict):
        return list(items.keys())
    ids = []
    for it in items:
        v = it.get("id") if isinstance(it, dict) else None
        ids.append(v["value"] if isinstance(v, dict) else v)
    return [i for i in ids if i]


def build_mines(rows, modelled):
    mines, timeline, seen = [], {}, set()
    # The workbook has pairs of rows with the same company and name (for example CCL Urimari, UG and OC). Only those
    # get the mine type appended to the ID and to the jitter key, so every other ID stays the plain slug.
    base_counts = {}
    for row in rows:
        b = slug((row[COL["company"]] or "").strip(), row[COL["name"]].strip())
        base_counts[b] = base_counts.get(b, 0) + 1
    for row in rows:
        co = (row[COL["company"]] or "").strip()
        nm_raw = row[COL["name"]]
        nm = nm_raw.strip()
        st = (row[COL["state"]] or "").strip()
        typ = (row[COL["type"]] or "").strip()
        mine_id = slug(co, nm)
        dup = base_counts[mine_id] > 1
        if dup:
            mine_id = slug(co, f"{nm} {typ}")
        if mine_id in seen:
            sys.exit(f"Duplicate mine ID: {mine_id}")
        seen.add(mine_id)

        cl = cluster_for(co, st, nm_raw)
        if cl is None:
            sys.exit(f"No coalfield cluster for {co} / {nm} / {st}")
        lat, lon, spread = C[cl]
        if mine_id == MOONIDIH_ID:
            la, lo = MOONIDIH_LAT, MOONIDIH_LON
        else:
            dx, dy = jitter(f"{co}|{nm_raw}" + (f"|{typ}" if dup else ""), spread)
            lo, la = lon + dx, lat + dy
        x, y = proj(lo, la)

        year = row[COL["year"]]
        status = row[COL["status"]]
        runout_year = year if isinstance(year, int) else None
        if isinstance(year, int):
            label = str(year)
        elif isinstance(year, str):
            label = year
        else:
            label = "No date"
        wb_id = str(row[COL["id"]]).strip()
        mines.append(dict(
            id=mine_id, wbId=wb_id, name=nm, company=co, state=st, type=typ,
            band=band_for(year, status), runoutYear=runout_year, runoutLabel=label, status=status, field=cl,
            x=round(x, 1), y=round(y, 1), modelled=mine_id in modelled,
        ))
        timeline[mine_id] = dict(
            wbId=wb_id,
            reserve2024Mt=num(row[COL["reserve2024"]]),
            reserveLeft2026Mt=num(row[COL["left2026"]]),
            outputMt=dict(fy2324=num(row[COL["out2324"]]), fy2425=num(row[COL["out2425"]]),
                          fy2526=num(row[COL["out2526"]])),
            targetFy2627Mt=num(row[COL["target2627"]]),
            rateUsedMtPerYr=num(row[COL["rate"]]),
            yearsLeft=num(row[COL["yearsLeft"]], 2),
            runoutYear=runout_year,
            runoutLabel=label,
            status=status,
            yearAtTarget=int_or_none(row[COL["yearAtTarget"]]),
            ecCapacityMtPerYr=num(row[COL["ecCap"]]),
            yearAtEc=int_or_none(row[COL["yearAtEc"]]),
            note=(row[COL["note"]] or None),
        )
    return mines, timeline


def build_closed(path=LSTXT):
    txt = open(path).read().split("ANNEXURE-II", 1)[1]
    closed = []
    for line in txt.splitlines():
        m = re.match(r"\s*(\d+)\s+(BCCL|CCL|CLL|ECL|MCL|NCL|NECL|SECL|WCL)\s+(.+?)\s*$", line)
        if not m:
            continue
        co = {"CLL": "CCL", "NECL": "NEC"}.get(m.group(2), m.group(2))
        nm = re.sub(r"\s{2,}.*$", "", m.group(3)).strip()
        nm = re.sub(r"(Before 2009|Post-2009)", "", nm).strip()
        cl = cluster_for(co, None, nm) or {"ECL": "raniganj"}.get(co)
        if co == "WCL" and cl == "wani":  # unknown WCL field: spread over WCL fields deterministically
            cl = ["wani", "pench", "pathakhera", "nagpur", "chandrapur"][int(hashlib.md5(nm.encode()).hexdigest(), 16) % 5]
        if co == "SECL" and cl == "bisrampur":
            cl = ["sohagpur", "korba", "chirimiri", "bisrampur", "johilla"][int(hashlib.md5(nm.encode()).hexdigest(), 16) % 5]
        lat, lon, sp = C[cl]
        dx, dy = jitter("closed|" + co + nm + m.group(1), sp * 1.1)
        x, y = proj(lon + dx, lat + dy)
        closed.append(dict(name=nm.title(), company=co, field=cl, x=round(x, 1), y=round(y, 1)))
    return closed


def build_geography():
    india = json.load(open(OUTLINE_GEOJSON))
    outline = "".join(geom_path(shape(f["geometry"])) for f in india["features"])
    states = json.load(open(STATES_GEOJSON))
    coal_states = []
    for f in states["features"]:
        d = geom_path(shape(f["geometry"]))
        if d:
            coal_states.append({"name": f["properties"].get("ST_NM", ""), "d": d})
    return outline, coal_states


def build():
    """Return (mines_map, closure_timeline) as dicts. Writes nothing."""
    rows = read_workbook()
    mines, timeline = build_mines(rows, set(modelled_ids()))
    closed = build_closed()
    outline, coal_states = build_geography()

    bands = {k: 0 for k in BAND_KEYS}
    for m in mines:
        bands[m["band"]] += 1
    bands["closed"] = len(closed)

    cities = []
    for name, lat, lon, side in CITIES:
        x, y = proj(lon, lat)
        cities.append(dict(name=name, x=round(x, 1), y=round(y, 1), side=side))

    width, height = proj(97.6, 6.4)
    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    mines_map = dict(
        generatedAt=generated_at, sources=SOURCES, note=NOTE,
        viewBox=[0, 0, round(width), round(height)],
        projection=dict(lat0=LAT0, k=K, lonMin=LON_MIN, latMax=LAT_MAX),
        outline=outline, coalStates=coal_states, cities=cities, lens=LENS, bands=bands,
        mines=mines, closed=closed,
    )
    closure_timeline = {"generatedAt": generated_at, "sources": SOURCES, "note": NOTE, "mines": timeline}
    return mines_map, closure_timeline


def dump_compact(obj, path, line_keys):
    """Compact JSON, with one line per item of the keys in `line_keys` so that diffs stay readable."""
    def j(v):
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)
    parts = []
    for k, v in obj.items():
        if k in line_keys and isinstance(v, list):
            body = ",\n".join("    " + j(i) for i in v)
            parts.append(f'  {j(k)}: [\n{body}\n  ]')
        elif k in line_keys and isinstance(v, dict):
            body = ",\n".join(f"    {j(a)}: {j(b)}" for a, b in v.items())
            parts.append(f'  {j(k)}: {{\n{body}\n  }}')
        else:
            parts.append(f"  {j(k)}: {j(v)}")
    with open(path, "w") as f:
        f.write("{\n" + ",\n".join(parts) + "\n}\n")


def main():
    mines_map, timeline = build()
    os.makedirs(OUT_DIR, exist_ok=True)
    p1 = os.path.join(OUT_DIR, "mines_map.json")
    p2 = os.path.join(OUT_DIR, "closure_timeline.json")
    dump_compact(mines_map, p1, {"mines", "closed", "coalStates", "cities"})
    # Appendix D: closure_timeline.json is an object keyed by mine ID, so metadata sits under reserved keys that
    # no slug can collide with (IDs never start with an underscore).
    meta = {"_meta": {"generatedAt": timeline["generatedAt"], "sources": timeline["sources"], "note": timeline["note"]}}
    keyed = {**meta, **timeline["mines"]}
    dump_compact(keyed, p2, set(keyed.keys()) - {"_meta"})
    print("mines", len(mines_map["mines"]), "closed", len(mines_map["closed"]), mines_map["bands"])
    print("mines_map.json", os.path.getsize(p1), "bytes; closure_timeline.json", os.path.getsize(p2), "bytes")


if __name__ == "__main__":
    main()

"""Build map + mine data for the design mock. Positions are INDICATIVE (coalfield centroid + jitter)."""
import json, math, re, hashlib, os, sys
import openpyxl
from shapely.geometry import shape, MultiPolygon, Polygon

D = os.path.dirname(os.path.abspath(__file__))
XLSX = sys.argv[1]
LSTXT = sys.argv[2]

LAT0 = 22.0
K = 33.0
LON_MIN, LAT_MAX = 68.0, 37.2
COS = math.cos(math.radians(LAT0))

def proj(lon, lat):
    return ((lon - LON_MIN) * COS * K, (LAT_MAX - lat) * K)

def ring_path(coords):
    pts = [proj(x, y) for x, y in coords]
    return "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"

def geom_path(g, tol, min_area):
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(g.geoms) if isinstance(g, MultiPolygon) else []
    out = []
    for p in polys:
        if p.area < min_area:
            continue
        out.append(ring_path(p.exterior.coords))
    return "".join(out)

india = json.load(open(os.path.join(D, "geo", "india-composite.geojson")))
outline = "".join(geom_path(shape(f["geometry"]), 0.03, 0.02) for f in india["features"])

states = json.load(open(os.path.join(D, "geo", "states.geojson")))
COAL_STATES = {"Jharkhand", "West Bengal", "Odisha", "Chhattisgarh", "Madhya Pradesh", "Maharashtra",
               "Uttar Pradesh", "Assam", "Telangana", "Bihar"}
state_paths = []
for f in states["features"]:
    nm = f["properties"].get("ST_NM", "")
    p = geom_path(shape(f["geometry"]), 0.03, 0.02)
    if p:
        state_paths.append({"name": nm, "coal": nm in COAL_STATES, "d": p})

# ---------- clusters (lat, lon, spread deg) ----------
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

def klass(res):
    # ILLUSTRATIVE proxy until the closure workbook is wired in: reserve size -> closure band
    if res is None:
        return "unknown"
    if res < 5: return "y5"
    if res < 20: return "y10"
    if res < 100: return "y2050"
    return "after2050"

CIL = {"ECL", "BCCL", "CCL", "NCL", "WCL", "SECL", "MCL", "NEC"}
mines = []
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb.active
for row in ws.iter_rows(min_row=4, values_only=True):
    sl, co, nm, st, typ, res = (list(row) + [None] * 6)[:6]
    co = (co or "").strip()
    if co not in CIL or not nm:
        continue
    res = res if isinstance(res, (int, float)) else None
    cl = cluster_for(co, (st or "").strip(), nm)
    lat, lon, sp = C[cl]
    key = f"{co}|{nm}"
    if co == "BCCL" and nm.strip().lower() == "moonidih":
        la, lo = 23.735, 86.335
    else:
        dx, dy = jitter(key, sp)
        lo, la = lon + dx, lat + dy
    x, y = proj(lo, la)
    mines.append(dict(id=re.sub(r"[^a-z0-9]+", "-", f"{co} {nm}".lower()).strip("-"), name=nm.strip(), company=co,
                      state=(st or "").strip(), type=(typ or "").strip(), reserve=res, field=cl,
                      status="active", band=klass(res), x=round(x, 1), y=round(y, 1)))

# closed mines from Annexure II
txt = open(LSTXT).read().split("ANNEXURE-II", 1)[1]
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
    closed.append(dict(name=nm.title(), company=co, field=cl, status="closed", x=round(x, 1), y=round(y, 1)))

W, H = proj(97.6, 6.4)
out = dict(viewBox=[0, 0, round(W), round(H)], outline=outline, states=state_paths, mines=mines, closed=closed,
           note="Positions indicative (coalfield centroid + jitter). Closure bands are an illustrative proxy from reserve size.")
json.dump(out, open(os.path.join(D, "mapdata.json"), "w"))
from collections import Counter
print("viewBox", out["viewBox"], "outline chars", len(outline), "states", len(state_paths))
print("active", len(mines), Counter(m["band"] for m in mines), "closed", len(closed))
print([m for m in mines if m["name"].lower() == "moonidih"])
print(Counter(m["field"] for m in mines).most_common(8))

"""Tests for scripts/data/v2/build_v2.py. Run: python3 -m unittest discover -s tests/data/v2"""
import csv
import json
import math
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, "scripts", "data", "v2"))

import build_v2  # noqa: E402

HAS_GEM = os.path.exists(build_v2.GEM_XLSX)
NO_GEM_PATH = os.path.join(tempfile.gettempdir(), "no-such-gem-workbook.xlsx")


def load_json(path):
    with open(path) as f:
        return json.load(f)


V1 = load_json(build_v2.MAP_JSON)
GOLDEN = load_json(os.path.join(ROOT, "tests", "golden", "estimation_v2.json"))
MOONIDIH = "bccl-moonidih"


def check_common(test, out):
    mines, closed = out["mines"], out["closedMines"]
    test.assertEqual(len(mines), 311)
    test.assertEqual(len(closed), 315)
    test.assertEqual([m["id"] for m in mines], [m["id"] for m in V1["mines"]])
    for p in [*mines, *closed]:
        test.assertTrue(0 <= p["x"] <= 906, p)
        test.assertTrue(0 <= p["y"] <= 1016, p)
    counts = {}
    for m in mines:
        counts[m["band"]] = counts.get(m["band"], 0) + 1
    test.assertEqual(counts, {"by2031": 55, "by2036": 25, "by2050": 44, "after2050": 142, "nodate": 45})
    test.assertEqual(out["bands"], {**counts, "closed": 315})
    test.assertEqual(out["viewBox"], [0, 0, 906, 1016])


class SearchKeyTest(unittest.TestCase):
    def test_normalisation(self):
        k = build_v2.search_key
        self.assertEqual(k("Khottadih OCP"), "khottadih")
        self.assertEqual(k("Khottadih OCP", strip_generic=False), "khottadih ocp")
        self.assertEqual(k("Nakrakonda -Kumardihi 'B' UG"), "nakrakonda kumardihi b")
        self.assertEqual(k("Chora Block Incline UG &\nShankarpur OC & Banbahal OC"), "chora block shankarpur banbahal")
        self.assertEqual(k("Hürra  Colliery"), "hurra")  # accents and double spaces
        self.assertEqual(k("Sasti Expn. OCM"), "sasti")
        self.assertEqual(k("OC Project"), "oc project")  # only generic words: kept

    def test_match_key_drops_coal_and_cluster(self):
        self.assertEqual(build_v2.match_key("Adasa Coal Mine"), "adasa")
        self.assertEqual(build_v2.match_key("Cluster 11"), "11")
        self.assertFalse(build_v2.has_identity("11"))
        self.assertTrue(build_v2.has_identity("pootkee baliharia"))

    def test_haversine(self):
        self.assertAlmostEqual(build_v2.haversine_km(23.0, 86.0, 23.0, 86.0), 0.0)
        # one degree of latitude is about 111.2 km
        self.assertAlmostEqual(build_v2.haversine_km(23.0, 86.0, 24.0, 86.0), 111.2, delta=0.2)


class WithoutGemTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out, cls.report = build_v2.build(gem_path=NO_GEM_PATH)

    def test_counts_ids_and_ranges(self):
        check_common(self, self.out)

    def test_every_mine_keeps_its_coalfield_position(self):
        for m, v in zip(self.out["mines"], V1["mines"]):
            self.assertEqual(m["positionQuality"], "coalfield")
            self.assertEqual((m["x"], m["y"]), (v["x"], v["y"]))
            self.assertIsNone(m["lat"])
            self.assertIsNone(m["lon"])
            self.assertIsNone(m["gemId"])
            self.assertIsNone(m["gemMethaneMm3"])
        self.assertEqual({r["matched"] for r in self.report}, {"no"})
        self.assertEqual(len(self.report), 311)


@unittest.skipUnless(HAS_GEM, "GEM workbook not present")
class WithGemTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out, cls.report = build_v2.build()
        cls.by_id = {m["id"]: m for m in cls.out["mines"]}

    def test_counts_ids_and_ranges(self):
        check_common(self, self.out)

    def test_moonidih_is_at_its_gem_point(self):
        m = self.by_id[MOONIDIH]
        self.assertEqual(m["positionQuality"], "gem")
        self.assertAlmostEqual(m["lat"], 23.7409, delta=0.002)
        self.assertAlmostEqual(m["lon"], 86.3525, delta=0.002)
        self.assertAlmostEqual(m["x"], 561.4, delta=0.2)  # PLAN_V2 Appendix A
        self.assertAlmostEqual(m["y"], 444.2, delta=0.2)

    def test_a_majority_is_matched(self):
        matched = [m for m in self.out["mines"] if m["positionQuality"] == "gem"]
        self.assertGreater(len(matched), 311 / 2)

    def test_matched_mines_follow_the_rules(self):
        by_row = {r["mine_id"]: r for r in self.report}
        for m in self.out["mines"]:
            r = by_row[m["id"]]
            if m["positionQuality"] == "gem":
                self.assertEqual(r["matched"], "yes")
                self.assertEqual(r["state_check"], "pass")
                self.assertLessEqual(float(r["distance_to_centroid_km"]), build_v2.MAX_CENTROID_KM)
                self.assertGreaterEqual(float(r["score"]), build_v2.MIN_NAME_SCORE)
                self.assertIsNotNone(m["lat"])
                self.assertEqual(m["gemId"], r["gem_id"])
                # x, y come from the v1 projection of the GEM point
                x = (m["lon"] - 68) * math.cos(math.radians(22)) * 33
                y = (37.2 - m["lat"]) * 33
                self.assertAlmostEqual(m["x"], x, delta=0.2)
                self.assertAlmostEqual(m["y"], y, delta=0.2)
            else:
                self.assertEqual(r["matched"], "no")
                self.assertIsNone(m["gemId"])
                self.assertIsNone(m["gemMethaneMm3"])

    def test_methane_is_million_m3_or_null(self):
        values = [m["gemMethaneMm3"] for m in self.out["mines"] if m["gemMethaneMm3"] is not None]
        self.assertGreater(len(values), 100)
        self.assertTrue(all(0 <= v < 1000 for v in values))
        self.assertAlmostEqual(self.by_id[MOONIDIH]["gemMethaneMm3"], 11.92, places=2)

    def test_report_has_one_row_per_mine(self):
        self.assertEqual(len(self.report), 311)
        self.assertEqual([r["mine_id"] for r in self.report], [m["id"] for m in self.out["mines"]])

    def test_committed_files_are_current(self):
        committed = load_json(build_v2.OUT_JSON)
        self.assertEqual(committed, json.loads(json.dumps(self.out)))
        with open(build_v2.OUT_REPORT, newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual([r["mine_id"] for r in rows], [r["mine_id"] for r in self.report])
        self.assertEqual([r["gem_id"] for r in rows], [r["gem_id"] for r in self.report])

    def test_overrides_win(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "o.csv")
            with open(path, "w") as f:
                f.write(f"mine_id,gem_id_or_none\n{MOONIDIH},none\nncl-bina-extn,M0488\n")
            out, report = build_v2.build(overrides_path=path)
        by_id = {m["id"]: m for m in out["mines"]}
        self.assertEqual(by_id[MOONIDIH]["positionQuality"], "coalfield")
        self.assertIsNone(by_id[MOONIDIH]["lat"])
        self.assertEqual(by_id["ncl-bina-extn"]["positionQuality"], "gem")
        self.assertEqual(by_id["ncl-bina-extn"]["gemId"], "M0488")
        rule = {r["mine_id"]: r["rule"] for r in report}
        self.assertEqual((rule[MOONIDIH], rule["ncl-bina-extn"]), ("override_none", "override"))


class FieldsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out, _ = build_v2.build(gem_path=NO_GEM_PATH)

    def test_degree_estimate_matches_the_golden_cases(self):
        by_id = {m["id"]: m for m in self.out["mines"]}
        self.assertEqual(GOLDEN["params"]["DEGREE_BY_FIELD"], build_v2.DEGREE_BY_FIELD)
        self.assertEqual(GOLDEN["params"]["DEFAULT_DEGREE"], build_v2.DEFAULT_DEGREE)
        cases = [c for c in GOLDEN["cases"].values() if c["modelStatus"] != "no_output"]  # no degree is computed
        self.assertGreaterEqual(len(cases), 8)
        for case in cases:
            self.assertEqual(by_id[case["id"]]["degreeEstimate"], case["degree"], case["id"])

    def test_opencast_has_no_degree(self):
        for m in self.out["mines"]:
            if m["type"] == "OC":
                self.assertIsNone(m["degreeEstimate"])
            else:
                self.assertIn(m["degreeEstimate"], (1, 2, 3))

    def test_every_field_has_a_display_name(self):
        for m in self.out["mines"]:
            self.assertIn(m["field"], self.out["coalfieldNames"])

    def test_every_mine_has_the_contract_fields(self):
        keys = {"id", "name", "company", "state", "type", "field", "band", "runoutYear", "runoutLabel", "x", "y",
                "lat", "lon", "positionQuality", "gemMethaneMm3", "searchKey", "gemId", "degreeEstimate"}
        for m in self.out["mines"]:
            self.assertTrue(keys <= set(m), keys - set(m))
            self.assertTrue(m["searchKey"])


if __name__ == "__main__":
    unittest.main()

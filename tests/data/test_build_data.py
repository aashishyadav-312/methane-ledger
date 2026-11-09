"""Tests for scripts/data/build_data.py. Run: .venv/bin/python -m unittest discover -s tests/data"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts", "data"))

import build_data  # noqa: E402


class BuildDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mines_map, cls.timeline_doc = build_data.build()
        cls.mines = cls.mines_map["mines"]
        cls.closed = cls.mines_map["closed"]
        cls.timeline = cls.timeline_doc["mines"]

    def test_311_operating_mines_with_unique_ids(self):
        ids = [m["id"] for m in self.mines]
        self.assertEqual(len(ids), 311)
        self.assertEqual(len(set(ids)), 311)
        self.assertEqual(set(ids), set(self.timeline))

    def test_band_counts(self):
        counts = {k: 0 for k in ("by2031", "by2036", "by2050", "after2050", "nodate")}
        for m in self.mines:
            counts[m["band"]] += 1
        self.assertEqual(counts, {"by2031": 55, "by2036": 25, "by2050": 44, "after2050": 142, "nodate": 45})
        self.assertEqual(self.mines_map["bands"], {**counts, "closed": 315})

    def test_315_closed_mines(self):
        self.assertEqual(len(self.closed), 315)

    def test_type_counts(self):
        types = {}
        for m in self.mines:
            types[m["type"]] = types.get(m["type"], 0) + 1
        self.assertEqual(types, {"OC": 168, "UG": 130, "Mixed": 13})

    def test_moonidih(self):
        m = next(m for m in self.mines if m["id"] == "bccl-moonidih")
        self.assertEqual(m["runoutYear"], 2034)
        self.assertEqual(m["band"], "by2036")
        self.assertEqual(m["wbId"], "111")
        self.assertTrue(m["modelled"])
        self.assertAlmostEqual(m["x"], 561.0, delta=0.5)
        self.assertAlmostEqual(m["y"], 444.3, delta=0.5)
        self.assertEqual(self.timeline["bccl-moonidih"]["yearAtTarget"], 2030)
        self.assertEqual(self.timeline["bccl-moonidih"]["runoutYear"], 2034)

    def test_only_moonidih_is_modelled(self):
        self.assertEqual([m["id"] for m in self.mines if m["modelled"]], ["bccl-moonidih"])

    def test_positions_inside_view_box(self):
        w, h = self.mines_map["viewBox"][2:]
        self.assertEqual((w, h), (906, 1016))
        for p in self.mines + self.closed:
            self.assertTrue(0 <= p["x"] <= w, p)
            self.assertTrue(0 <= p["y"] <= h, p)

    def test_tikak_note(self):
        t = next(m for m in self.mines if m["name"] == "Tikak Colliery")
        note = self.timeline[t["id"]]["note"]
        self.assertIn("data-entry error", note)

    def test_duplicate_names_get_type_suffix(self):
        ids = {m["id"] for m in self.mines}
        self.assertIn("ccl-urimari-ug", ids)
        self.assertIn("ccl-urimari-oc", ids)
        self.assertNotIn("ccl-urimari", ids)

    def test_cities_and_lens(self):
        ranchi = next(c for c in self.mines_map["cities"] if c["name"] == "Ranchi")
        self.assertAlmostEqual(ranchi["x"], 529.6, delta=0.1)
        self.assertAlmostEqual(ranchi["y"], 457.4, delta=0.1)
        self.assertEqual(ranchi["side"], "w")
        self.assertEqual(self.mines_map["lens"], {"window": [548, 435.5, 26, 19], "box": [612, 596, 232]})

    def test_geography_present(self):
        self.assertTrue(self.mines_map["outline"].startswith("M"))
        self.assertEqual(len(self.mines_map["coalStates"]), 10)

    def test_band_rule(self):
        b = build_data.band_for
        self.assertEqual(b(2040, "Past reported reserve"), "by2031")
        self.assertEqual(b(2031, "Producing"), "by2031")
        self.assertEqual(b(2032, "Producing"), "by2036")
        self.assertEqual(b(2036, "Producing"), "by2036")
        self.assertEqual(b(2037, "Producing"), "by2050")
        self.assertEqual(b(2050, "Producing"), "by2050")
        self.assertEqual(b(2051, "Producing"), "after2050")
        self.assertEqual(b("After 2225", "Producing"), "after2050")
        self.assertEqual(b(None, "Not producing"), "nodate")


if __name__ == "__main__":
    unittest.main()

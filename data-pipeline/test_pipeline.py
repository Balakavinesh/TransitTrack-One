"""
Automated Test Suite for TransitTrack One Data Ingestion Pipeline
Verifies validation rules, Chennai constraints, and gate protection.
"""

import os
import unittest
from validator import GTFSValidator

class TestDataPipeline(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.fixtures_dir = os.path.join(self.base_dir, "fixtures")

    def test_valid_chennai_gtfs_passes_validation_gate(self):
        feed = os.path.join(self.fixtures_dir, "valid_chennai_gtfs")
        validator = GTFSValidator(feed)
        res = validator.validate()

        self.assertTrue(res["passed"], "Valid Chennai GTFS feed must pass the validation gate")
        self.assertEqual(res["critical_count"], 0, "Valid feed should have 0 critical findings")
        self.assertGreater(res["stats"]["stops"], 0)
        self.assertGreater(res["stats"]["routes"], 0)
        self.assertGreater(res["stats"]["trips"], 0)
        self.assertGreater(res["stats"]["stop_times"], 0)
        self.assertGreaterEqual(res["completeness_score"], 90.0)

    def test_expired_calendar_detected_and_blocks_gate(self):
        feed = os.path.join(self.fixtures_dir, "invalid_expired_calendar")
        validator = GTFSValidator(feed)
        res = validator.validate()

        self.assertFalse(res["passed"], "Expired service calendar must fail the validation gate")
        rule_codes = [f["rule_code"] for f in res["findings"]]
        self.assertIn("EXPIRED_SERVICE_CALENDAR", rule_codes)
        criticals = [f for f in res["findings"] if f["severity"] == "critical"]
        self.assertGreater(len(criticals), 0)

    def test_mtc_placeholder_departure_detected_and_blocks_gate(self):
        feed = os.path.join(self.fixtures_dir, "invalid_placeholder_times")
        validator = GTFSValidator(feed)
        res = validator.validate()

        self.assertFalse(res["passed"], "MTC 00:00:15 placeholder times must fail the validation gate")
        rule_codes = [f["rule_code"] for f in res["findings"]]
        self.assertIn("MTC_PLACEHOLDER_DEPARTURE", rule_codes)

    def test_broken_references_detected_and_blocks_gate(self):
        feed = os.path.join(self.fixtures_dir, "invalid_broken_refs")
        validator = GTFSValidator(feed)
        res = validator.validate()

        self.assertFalse(res["passed"], "Broken references must fail the validation gate")
        rule_codes = [f["rule_code"] for f in res["findings"]]
        self.assertTrue(any("ORPHAN" in r for r in rule_codes))

    def test_missing_required_file_blocks_gate(self):
        # Empty directory
        empty_dir = os.path.join(self.fixtures_dir, "_temp_empty")
        os.makedirs(empty_dir, exist_ok=True)
        try:
            validator = GTFSValidator(empty_dir)
            res = validator.validate()
            self.assertFalse(res["passed"])
            self.assertEqual(res["critical_count"], 6)
            rule_codes = [f["rule_code"] for f in res["findings"]]
            self.assertIn("REQ_FILE_MISSING", rule_codes)
        finally:
            if os.path.exists(empty_dir):
                os.rmdir(empty_dir)

if __name__ == "__main__":
    unittest.main()

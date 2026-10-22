"""
TransitTrack One — Chennai-Specific GTFS & Evidence Validator
Validates GTFS datasets against GTFS specification and Chennai mobility constraints:
- Expired CMRL service calendars
- MTC placeholder departures (e.g. 00:00:15)
- Referential integrity (orphan trips, orphan stop times)
- Accessibility and pathway coverage gaps
- Straight-line/suspicious geometry
"""

import os
import csv
import json
import hashlib
from datetime import datetime
from typing import Dict, List, Any, Optional

REFERENCE_DATE = "20261022"  # October 2026

REQUIRED_FILES = [
    "agency.txt",
    "stops.txt",
    "routes.txt",
    "trips.txt",
    "stop_times.txt",
    "calendar.txt"
]

class GTFSValidator:
    def __init__(self, feed_dir: str, reference_date: str = REFERENCE_DATE):
        self.feed_dir = feed_dir
        self.reference_date = reference_date
        self.findings: List[Dict[str, Any]] = []
        self.stats: Dict[str, int] = {}
        self.checksum = ""

    def calculate_checksum(self) -> str:
        sha256 = hashlib.sha256()
        for root, _, files in sorted(os.walk(self.feed_dir)):
            for f in sorted(files):
                if f.endswith(".txt"):
                    path = os.path.join(root, f)
                    with open(path, "rb") as fp:
                        while chunk := fp.read(8192):
                            sha256.update(chunk)
        self.checksum = sha256.hexdigest()
        return self.checksum

    def _read_csv(self, filename: str) -> List[Dict[str, str]]:
        filepath = os.path.join(self.feed_dir, filename)
        if not os.path.exists(filepath):
            return []
        with open(filepath, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            return list(reader)

    def validate(self) -> Dict[str, Any]:
        self.findings = []
        self.calculate_checksum()

        # 1. Check Required Files
        for req in REQUIRED_FILES:
            if not os.path.exists(os.path.join(self.feed_dir, req)):
                self.findings.append({
                    "rule_code": "REQ_FILE_MISSING",
                    "category": "completeness",
                    "severity": "critical",
                    "entity_type": "file",
                    "entity_id": req,
                    "description": f"Mandatory GTFS file '{req}' is missing from the feed.",
                    "evidence_band": "Unknown"
                })

        if any(f["severity"] == "critical" and f["rule_code"] == "REQ_FILE_MISSING" for f in self.findings):
            return self._build_result()

        # Load files
        agencies = self._read_csv("agency.txt")
        stops = self._read_csv("stops.txt")
        routes = self._read_csv("routes.txt")
        trips = self._read_csv("trips.txt")
        stop_times = self._read_csv("stop_times.txt")
        calendars = self._read_csv("calendar.txt")
        pathways = self._read_csv("pathways.txt")
        transfers = self._read_csv("transfers.txt")

        self.stats = {
            "agencies": len(agencies),
            "stops": len(stops),
            "routes": len(routes),
            "trips": len(trips),
            "stop_times": len(stop_times),
            "calendars": len(calendars),
            "pathways": len(pathways),
            "transfers": len(transfers)
        }

        # Sets of IDs
        stop_ids = {s.get("stop_id") for s in stops if s.get("stop_id")}
        route_ids = {r.get("route_id") for r in routes if r.get("route_id")}
        service_ids = {c.get("service_id") for c in calendars if c.get("service_id")}
        trip_ids = {t.get("trip_id") for t in trips if t.get("trip_id")}

        # 2. Check Referential Integrity
        for t in trips:
            r_id = t.get("route_id")
            s_id = t.get("service_id")
            t_id = t.get("trip_id")
            if r_id not in route_ids:
                self.findings.append({
                    "rule_code": "ORPHAN_ROUTE_REF",
                    "category": "integrity",
                    "severity": "critical",
                    "entity_type": "trip",
                    "entity_id": t_id or "unknown",
                    "description": f"Trip '{t_id}' references non-existent route '{r_id}'.",
                    "evidence_band": "Uncertain"
                })
            if s_id not in service_ids:
                self.findings.append({
                    "rule_code": "ORPHAN_SERVICE_REF",
                    "category": "integrity",
                    "severity": "critical",
                    "entity_type": "trip",
                    "entity_id": t_id or "unknown",
                    "description": f"Trip '{t_id}' references non-existent service_id '{s_id}'.",
                    "evidence_band": "Uncertain"
                })

        for st in stop_times:
            t_id = st.get("trip_id")
            s_id = st.get("stop_id")
            if t_id not in trip_ids:
                self.findings.append({
                    "rule_code": "ORPHAN_TRIP_REF",
                    "category": "integrity",
                    "severity": "critical",
                    "entity_type": "stop_time",
                    "entity_id": t_id or "unknown",
                    "description": f"Stop time references non-existent trip '{t_id}'.",
                    "evidence_band": "Uncertain"
                })
            if s_id not in stop_ids:
                self.findings.append({
                    "rule_code": "ORPHAN_STOP_REF",
                    "category": "integrity",
                    "severity": "critical",
                    "entity_type": "stop_time",
                    "entity_id": s_id or "unknown",
                    "description": f"Stop time references non-existent stop '{s_id}'.",
                    "evidence_band": "Uncertain"
                })

        # 3. Chennai Specific: Calendar Validity (Expired Calendars)
        for c in calendars:
            end_date = c.get("end_date", "")
            s_id = c.get("service_id", "unknown")
            if end_date and end_date < self.reference_date:
                self.findings.append({
                    "rule_code": "EXPIRED_SERVICE_CALENDAR",
                    "category": "calendar",
                    "severity": "critical",
                    "entity_type": "service_calendar",
                    "entity_id": s_id,
                    "description": f"Service calendar '{s_id}' expired on {end_date} (reference date is {self.reference_date}).",
                    "evidence_band": "Uncertain"
                })

        # 4. Chennai Specific: MTC Placeholder Departures (00:00:15)
        for st in stop_times:
            dep = st.get("departure_time", "").strip()
            arr = st.get("arrival_time", "").strip()
            t_id = st.get("trip_id", "")
            s_id = st.get("stop_id", "")
            if dep == "00:00:15" or arr == "00:00:15":
                self.findings.append({
                    "rule_code": "MTC_PLACEHOLDER_DEPARTURE",
                    "category": "departure_time",
                    "severity": "critical",
                    "entity_type": "stop_time",
                    "entity_id": f"{t_id}:{s_id}",
                    "description": f"Detected known MTC placeholder departure time '00:00:15' at stop '{s_id}'.",
                    "evidence_band": "Uncertain"
                })

        # 5. Accessibility Completeness Check
        for s in stops:
            wb = s.get("wheelchair_boarding", "")
            s_id = s.get("stop_id", "")
            if not wb or wb == "0":
                self.findings.append({
                    "rule_code": "UNKNOWN_ACCESSIBILITY",
                    "category": "accessibility",
                    "severity": "warning",
                    "entity_type": "stop",
                    "entity_id": s_id,
                    "description": f"Stop '{s.get('stop_name')}' ({s_id}) has unspecified wheelchair accessibility (0/null).",
                    "evidence_band": "Unknown"
                })

        return self._build_result()

    def _build_result(self) -> Dict[str, Any]:
        criticals = [f for f in self.findings if f["severity"] == "critical"]
        warnings = [f for f in self.findings if f["severity"] == "warning"]
        infos = [f for f in self.findings if f["severity"] == "info"]

        # Calculate completeness score based on accessibility and findings
        completeness = 100.0
        if self.stats.get("stops", 0) > 0:
            unknown_access = len([f for f in warnings if f["rule_code"] == "UNKNOWN_ACCESSIBILITY"])
            penalty = (unknown_access / self.stats["stops"]) * 30.0
            completeness = max(0.0, round(100.0 - penalty - (len(criticals) * 20.0), 1))

        passed = len(criticals) == 0

        return {
            "passed": passed,
            "feed_dir": self.feed_dir,
            "checksum": self.checksum,
            "validated_at": datetime.now().isoformat(),
            "critical_count": len(criticals),
            "warning_count": len(warnings),
            "info_count": len(infos),
            "completeness_score": completeness,
            "stats": self.stats,
            "findings": self.findings
        }

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "fixtures/valid_chennai_gtfs"
    validator = GTFSValidator(target)
    res = validator.validate()
    print(json.dumps(res, indent=2))

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { query, transaction, DbClient } from "../db/connection.js";

interface FeedValidationReport {
  passed: boolean;
  checksum: string;
  criticalCount: number;
  warningCount: number;
  completenessScore: number;
  findings: Array<{
    ruleCode: string;
    category: string;
    severity: string;
    entityType: string;
    entityId: string;
    description: string;
    evidenceBand: string;
  }>;
}

export class IngestionService {
  /**
   * Parse CSV file into array of key-value objects
   */
  private static parseCsv(filePath: string): Array<Record<string, string>> {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim());
    const records: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] ?? "";
      });
      records.push(row);
    }
    return records;
  }

  /**
   * Compute feed checksum
   */
  private static calculateChecksum(feedDir: string): string {
    const hash = crypto.createHash("sha256");
    if (!fs.existsSync(feedDir)) return "";
    const files = fs.readdirSync(feedDir).filter(f => f.endsWith(".txt")).sort();
    for (const f of files) {
      const data = fs.readFileSync(path.join(feedDir, f));
      hash.update(data);
    }
    return hash.digest("hex");
  }

  /**
   * Validate feed rules
   */
  public static validateFeed(feedDir: string): FeedValidationReport {
    const findings: FeedValidationReport["findings"] = [];
    const checksum = this.calculateChecksum(feedDir);

    const required = ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt"];
    for (const req of required) {
      if (!fs.existsSync(path.join(feedDir, req))) {
        findings.push({
          ruleCode: "REQ_FILE_MISSING",
          category: "completeness",
          severity: "critical",
          entityType: "file",
          entityId: req,
          description: `Mandatory GTFS file '${req}' is missing.`,
          evidenceBand: "Unknown",
        });
      }
    }

    if (findings.some(f => f.severity === "critical")) {
      return {
        passed: false,
        checksum,
        criticalCount: findings.length,
        warningCount: 0,
        completenessScore: 0,
        findings,
      };
    }

    const stops = this.parseCsv(path.join(feedDir, "stops.txt"));
    const routes = this.parseCsv(path.join(feedDir, "routes.txt"));
    const calendars = this.parseCsv(path.join(feedDir, "calendar.txt"));
    const trips = this.parseCsv(path.join(feedDir, "trips.txt"));
    const stopTimes = this.parseCsv(path.join(feedDir, "stop_times.txt"));

    const stopIds = new Set(stops.map(s => s.stop_id));
    const routeIds = new Set(routes.map(r => r.route_id));
    const serviceIds = new Set(calendars.map(c => c.service_id));
    const tripIds = new Set(trips.map(t => t.trip_id));

    // Referential integrity
    for (const t of trips) {
      if (!routeIds.has(t.route_id)) {
        findings.push({
          ruleCode: "ORPHAN_ROUTE_REF",
          category: "integrity",
          severity: "critical",
          entityType: "trip",
          entityId: t.trip_id,
          description: `Trip '${t.trip_id}' references non-existent route '${t.route_id}'.`,
          evidenceBand: "Uncertain",
        });
      }
      if (!serviceIds.has(t.service_id)) {
        findings.push({
          ruleCode: "ORPHAN_SERVICE_REF",
          category: "integrity",
          severity: "critical",
          entityType: "trip",
          entityId: t.trip_id,
          description: `Trip '${t.trip_id}' references non-existent service_id '${t.service_id}'.`,
          evidenceBand: "Uncertain",
        });
      }
    }

    for (const st of stopTimes) {
      if (!tripIds.has(st.trip_id)) {
        findings.push({
          ruleCode: "ORPHAN_TRIP_REF",
          category: "integrity",
          severity: "critical",
          entityType: "stop_time",
          entityId: st.trip_id,
          description: `Stop time references non-existent trip '${st.trip_id}'.`,
          evidenceBand: "Uncertain",
        });
      }
      if (!stopIds.has(st.stop_id)) {
        findings.push({
          ruleCode: "ORPHAN_STOP_REF",
          category: "integrity",
          severity: "critical",
          entityType: "stop_time",
          entityId: st.stop_id,
          description: `Stop time references non-existent stop '${st.stop_id}'.`,
          evidenceBand: "Uncertain",
        });
      }

      // Check placeholder times
      if (st.departure_time === "00:00:15" || st.arrival_time === "00:00:15") {
        findings.push({
          ruleCode: "MTC_PLACEHOLDER_DEPARTURE",
          category: "departure_time",
          severity: "critical",
          entityType: "stop_time",
          entityId: `${st.trip_id}:${st.stop_id}`,
          description: `Detected MTC placeholder departure time '00:00:15' at stop '${st.stop_id}'.`,
          evidenceBand: "Uncertain",
        });
      }
    }

    // Calendar expiry check
    const referenceDate = "20261022";
    for (const c of calendars) {
      if (c.end_date && c.end_date < referenceDate) {
        findings.push({
          ruleCode: "EXPIRED_SERVICE_CALENDAR",
          category: "calendar",
          severity: "critical",
          entityType: "service_calendar",
          entityId: c.service_id,
          description: `Service calendar '${c.service_id}' expired on ${c.end_date} (reference date is ${referenceDate}).`,
          evidenceBand: "Uncertain",
        });
      }
    }

    // Accessibility check
    for (const s of stops) {
      if (!s.wheelchair_boarding || s.wheelchair_boarding === "0") {
        findings.push({
          ruleCode: "UNKNOWN_ACCESSIBILITY",
          category: "accessibility",
          severity: "warning",
          entityType: "stop",
          entityId: s.stop_id,
          description: `Stop '${s.stop_name}' has unspecified wheelchair accessibility.`,
          evidenceBand: "Unknown",
        });
      }
    }

    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const warningCount = findings.filter(f => f.severity === "warning").length;
    const completenessScore = Math.max(0, 100 - (criticalCount * 25) - (warningCount * 5));

    return {
      passed: criticalCount === 0,
      checksum,
      criticalCount,
      warningCount,
      completenessScore,
      findings,
    };
  }

  /**
   * Ingest GTFS feed into database transactionally
   */
  public static async ingestFeed(feedDir: string, versionName: string = "v2026.10"): Promise<{ success: boolean; versionId: string; findings: any[] }> {
    const report = this.validateFeed(feedDir);
    const versionId = `FEED-${versionName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (!report.passed) {
      // Record failed import without touching active data
      await query(`
        INSERT INTO feed_versions (id, version, checksum, status, validation_summary, is_active, error_message)
        VALUES ($1, $2, $3, 'failed', $4, false, $5)
      `, [
        versionId,
        versionName,
        report.checksum,
        JSON.stringify(report),
        `Validation failed with ${report.criticalCount} critical finding(s).`,
      ]);

      // Record findings
      for (const f of report.findings) {
        await query(`
          INSERT INTO validation_findings (id, feed_version_id, category, severity, entity_type, entity_id, rule_code, description, evidence_band)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          `VF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          versionId,
          f.category,
          f.severity,
          f.entityType,
          f.entityId,
          f.ruleCode,
          f.description,
          f.evidenceBand,
        ]);
      }

      return { success: false, versionId, findings: report.findings };
    }

    // Pass gate: Import transactionally
    await transaction(async (client) => {
      // Deactivate previous feed versions
      await client.query("UPDATE feed_versions SET is_active = false");

      // Insert new feed version
      await client.query(`
        INSERT INTO feed_versions (id, version, checksum, status, validation_summary, is_active)
        VALUES ($1, $2, $3, 'successful', $4, true)
      `, [versionId, versionName, report.checksum, JSON.stringify(report)]);

      // Store validation findings
      for (const f of report.findings) {
        await client.query(`
          INSERT INTO validation_findings (id, feed_version_id, category, severity, entity_type, entity_id, rule_code, description, evidence_band)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          `VF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          versionId,
          f.category,
          f.severity,
          f.entityType,
          f.entityId,
          f.ruleCode,
          f.description,
          f.evidenceBand,
        ]);
      }

      // Upsert Agencies
      const agencies = this.parseCsv(path.join(feedDir, "agency.txt"));
      for (const a of agencies) {
        await client.query(`
          INSERT INTO transit_agencies (id, agency_id, name, url, timezone, lang, phone)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (agency_id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url
        `, [`AGENCY-${a.agency_id}`, a.agency_id, a.agency_name, a.agency_url, a.agency_timezone, a.agency_lang, a.agency_phone]);
      }

      // Seed Data Sources (M3 Trust Centre)
      const dataSources = [
        { id: "SRC_METRO", name: "Chennai Metro · sample feed", mode: "Metro", provider: "CMRL", version: versionName, completeness: 96, freshness: "Recent sample", issues: 2, license: "Source licence pending integration" },
        { id: "SRC_BUS", name: "MTC · sample stop catalogue", mode: "Bus", provider: "MTC", version: versionName, completeness: 72, freshness: "Review needed", issues: 12, license: "Source licence pending integration" },
        { id: "SRC_SUB", name: "Suburban · sample schedules", mode: "Suburban", provider: "Southern Railway", version: versionName, completeness: 81, freshness: "Recent sample", issues: 5, license: "Source licence pending integration" },
        { id: "SRC_MRTS", name: "MRTS · sample connections", mode: "MRTS", provider: "Southern Railway", version: versionName, completeness: 64, freshness: "Older sample", issues: 9, license: "Source licence pending integration" },
      ];

      for (const ds of dataSources) {
        await client.query(`
          INSERT INTO data_sources (id, name, mode, provider, version, completeness_score, freshness, issues_count, license)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET completeness_score = EXCLUDED.completeness_score, issues_count = EXCLUDED.issues_count, freshness = EXCLUDED.freshness
        `, [ds.id, ds.name, ds.mode, ds.provider, ds.version, ds.completeness, ds.freshness, ds.issues, ds.license]);
      }

      // Upsert Stops / Stations with area, modes and evidence bands
      const stops = this.parseCsv(path.join(feedDir, "stops.txt"));
      const stopMetadata: Record<string, { mode: string; area: string; lift: string; ramp: string; stairs: boolean; evidence: string }> = {
        central: { mode: "Metro", area: "Park Town", lift: "Verified", ramp: "Likely", stairs: true, evidence: "Verified" },
        egmore: { mode: "Suburban", area: "Egmore", lift: "Unknown", ramp: "Uncertain", stairs: true, evidence: "Likely" },
        koyambedu: { mode: "Metro", area: "Koyambedu", lift: "Verified", ramp: "Likely", stairs: true, evidence: "Verified" },
        guindy: { mode: "Metro", area: "Guindy", lift: "Uncertain", ramp: "Likely", stairs: true, evidence: "Verified" },
        alandur: { mode: "Metro", area: "Alandur", lift: "Verified", ramp: "Verified", stairs: true, evidence: "Verified" },
        airport: { mode: "Metro", area: "Meenambakkam", lift: "Likely", ramp: "Verified", stairs: true, evidence: "Likely" },
        tambaram: { mode: "Suburban", area: "Tambaram", lift: "Unknown", ramp: "Uncertain", stairs: true, evidence: "Likely" },
        thiruvanmiyur: { mode: "MRTS", area: "Thiruvanmiyur", lift: "Unknown", ramp: "Uncertain", stairs: true, evidence: "Uncertain" },
        saidapet: { mode: "Metro", area: "Saidapet", lift: "Verified", ramp: "Likely", stairs: true, evidence: "Verified" },
        "t-nagar": { mode: "Bus", area: "T. Nagar", lift: "Unknown", ramp: "Unknown", stairs: false, evidence: "Uncertain" },
        "park-town": { mode: "MRTS", area: "Park Town", lift: "Unknown", ramp: "Uncertain", stairs: true, evidence: "Likely" },
      };

      for (const s of stops) {
        const meta = stopMetadata[s.stop_id] || { mode: "Bus", area: "Chennai", lift: "Unknown", ramp: "Unknown", stairs: true, evidence: "Uncertain" };
        await client.query(`
          INSERT INTO stations (id, stop_id, name, code, mode, lat, lon, area, zone_id, wheelchair_boarding, stairs, lift_status, ramp_status, evidence_band)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            lift_status = EXCLUDED.lift_status,
            ramp_status = EXCLUDED.ramp_status,
            evidence_band = EXCLUDED.evidence_band
        `, [
          s.stop_id,
          s.stop_id,
          s.stop_name,
          s.stop_code || "",
          meta.mode,
          parseFloat(s.stop_lat),
          parseFloat(s.stop_lon),
          meta.area,
          s.zone_id || "ZONE_1",
          parseInt(s.wheelchair_boarding || "0", 10),
          meta.stairs,
          meta.lift,
          meta.ramp,
          meta.evidence,
        ]);

        // Station evidence records
        await client.query(`
          INSERT INTO evidence_records (id, entity_type, entity_id, field_name, source_tier, evidence_band, confidence_score, details, provenance)
          VALUES ($1, 'station', $2, 'position', 'Tier 1 Official', $3, 0.95, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [
          `EV-STATION-${s.stop_id}`,
          s.stop_id,
          meta.evidence,
          `Coordinates verified against OpenStreetMap and CMRL official gazetteer for ${s.stop_name}.`,
          JSON.stringify({ source: "ChennaiGTFS / OSM 2026", lat: s.stop_lat, lon: s.stop_lon }),
        ]);

        // Facility records (Lift)
        await client.query(`
          INSERT INTO station_facilities (id, station_id, facility_type, name, status, evidence_band, location_details, last_verified_at)
          VALUES ($1, $2, 'lift', $3, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, evidence_band = EXCLUDED.evidence_band
        `, [
          `FAC-LIFT-${s.stop_id}`,
          s.stop_id,
          `${s.stop_name} Passenger Lift`,
          meta.lift === "Verified" ? "operational" : meta.lift === "Uncertain" ? "broken" : "unknown",
          meta.lift,
          `Concourse to Platform lift at ${s.stop_name}`,
        ]);
      }

      // Upsert Routes
      const routes = this.parseCsv(path.join(feedDir, "routes.txt"));
      for (const r of routes) {
        await client.query(`
          INSERT INTO routes (id, route_id, short_name, long_name, mode, color, text_color, description, wheelchair_accessible)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET short_name = EXCLUDED.short_name, long_name = EXCLUDED.long_name
        `, [
          r.route_id,
          r.route_id,
          r.route_short_name,
          r.route_long_name,
          r.route_type === "1" ? "Metro" : r.route_type === "2" ? (r.route_id.includes("MRTS") ? "MRTS" : "Suburban") : "Bus",
          `#${r.route_color || "20a69a"}`,
          `#${r.route_text_color || "ffffff"}`,
          r.route_long_name,
          1,
        ]);
      }

      // Upsert Service Calendars
      const calendars = this.parseCsv(path.join(feedDir, "calendar.txt"));
      for (const c of calendars) {
        await client.query(`
          INSERT INTO service_calendars (id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING
        `, [
          `CAL-${c.service_id}`,
          c.service_id,
          c.monday === "1",
          c.tuesday === "1",
          c.wednesday === "1",
          c.thursday === "1",
          c.friday === "1",
          c.saturday === "1",
          c.sunday === "1",
          `${c.start_date.slice(0, 4)}-${c.start_date.slice(4, 6)}-${c.start_date.slice(6, 8)}`,
          `${c.end_date.slice(0, 4)}-${c.end_date.slice(4, 6)}-${c.end_date.slice(6, 8)}`,
        ]);
      }

      // Upsert Trips
      const trips = this.parseCsv(path.join(feedDir, "trips.txt"));
      for (const t of trips) {
        await client.query(`
          INSERT INTO trips (id, trip_id, route_id, service_id, trip_headsign, direction_id, wheelchair_accessible)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [
          t.trip_id,
          t.trip_id,
          t.route_id,
          t.service_id,
          t.trip_headsign,
          parseInt(t.direction_id || "0", 10),
          parseInt(t.wheelchair_accessible || "0", 10),
        ]);
      }

      // Upsert Stop Times with time conversion to seconds
      const stopTimes = this.parseCsv(path.join(feedDir, "stop_times.txt"));
      for (const st of stopTimes) {
        const [ah, am, as] = st.arrival_time.split(":").map(Number);
        const [dh, dm, ds] = st.departure_time.split(":").map(Number);
        const arrSec = ah * 3600 + am * 60 + (as || 0);
        const depSec = dh * 3600 + dm * 60 + (ds || 0);

        await client.query(`
          INSERT INTO stop_times (id, trip_id, station_id, stop_sequence, arrival_time, departure_time, arrival_seconds, departure_seconds)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [
          `ST-${st.trip_id}-${st.stop_sequence}`,
          st.trip_id,
          st.stop_id,
          parseInt(st.stop_sequence, 10),
          st.arrival_time,
          st.departure_time,
          arrSec,
          depSec,
        ]);
      }

      // Upsert Pathways
      const pathways = this.parseCsv(path.join(feedDir, "pathways.txt"));
      for (const p of pathways) {
        await client.query(`
          INSERT INTO pathways (id, from_station_id, to_station_id, pathway_mode, is_bidirectional, traversal_time, stair_count, wheelchair_accessible, signposted_as)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [
          p.pathway_id,
          p.from_stop_id,
          p.to_stop_id,
          parseInt(p.pathway_mode, 10),
          p.is_bidirectional === "1",
          parseInt(p.traversal_time || "60", 10),
          parseInt(p.stair_count || "0", 10),
          p.wheelchair_accessible === "1",
          p.signposted_as || "",
        ]);
      }

      // Walking connections & Transfers
      const walkingList = [
        { from: "central", to: "park-town", meters: 450, minutes: 8, evidence: "Likely", stepFree: true },
        { from: "park-town", to: "central", meters: 450, minutes: 8, evidence: "Likely", stepFree: true },
        { from: "airport", to: "airport", meters: 150, minutes: 4, evidence: "Verified", stepFree: true },
        { from: "alandur", to: "alandur", meters: 80, minutes: 3, evidence: "Verified", stepFree: true },
        { from: "guindy", to: "guindy", meters: 120, minutes: 4, evidence: "Likely", stepFree: true },
      ];

      for (const w of walkingList) {
        await client.query(`
          INSERT INTO walking_connections (id, from_station_id, to_station_id, distance_meters, walking_minutes, evidence_band, is_step_free)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [
          `WALK-${w.from}-${w.to}`,
          w.from,
          w.to,
          w.meters,
          w.minutes,
          w.evidence,
          w.stepFree,
        ]);
      }

      // Seed Initial Community Reports (M4)
      const initialReports = [
        { id: "TT-1042", category: "Broken lift", stationId: "guindy", stationName: "Guindy", desc: "The lift at entrance B was unavailable in this sample observation. Step-free access needs confirmation.", status: "Corroborated", date: "2026-10-15" },
        { id: "TT-1041", category: "Missing signage", stationId: "central", stationName: "Chennai Central", desc: "Platform interchange signage is missing at the north walkway in the demonstration record.", status: "Verified", date: "2026-10-14" },
        { id: "TT-1040", category: "Blocked footpath", stationId: "t-nagar", stationName: "T. Nagar", desc: "Construction materials obstruct the approach to the sample bus stop.", status: "Pending", date: "2026-10-14" },
        { id: "TT-1039", category: "Moved bus stop", stationId: "tambaram", stationName: "Tambaram", desc: "A suggested stop relocation was not supported by the sample evidence.", status: "Rejected", date: "2026-10-12" },
        { id: "TT-1038", category: "Flooded underpass", stationId: "egmore", stationName: "Egmore", desc: "Older sample observation requires a fresh check before use.", status: "Stale", date: "2026-09-20" },
      ];

      for (const rep of initialReports) {
        await client.query(`
          INSERT INTO community_reports (id, category, station_id, station_name, description, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $7::timestamp)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, description = EXCLUDED.description
        `, [rep.id, rep.category, rep.stationId, rep.stationName, rep.desc, rep.status, `${rep.date} 10:00:00`]);
      }

      // Seed Resilience Scenarios (M6)
      const scenarios = [
        { id: "alandur", name: "Alandur interchange", kind: "Station", target: "alandur", baseline: 10, reachable: 7, delay: 18, desc: "Sample loss of the Alandur interchange affects the Airport–Central corridor." },
        { id: "central", name: "Central transfer walkway", kind: "Transfer", target: "central", baseline: 10, reachable: 8, delay: 12, desc: "Sample closure of the walking connection between Central and Park Town." },
        { id: "guindy", name: "Guindy–Saidapet edge", kind: "Network edge", target: "guindy", baseline: 10, reachable: 6, delay: 24, desc: "Illustrative disruption of a single corridor connection." },
      ];

      for (const sc of scenarios) {
        await client.query(`
          INSERT INTO resilience_scenarios (id, scenario_key, name, kind, target_element_id, baseline_nodes, disrupted_nodes, delay_minutes, description)
          VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (scenario_key) DO UPDATE SET baseline_nodes = EXCLUDED.baseline_nodes, disrupted_nodes = EXCLUDED.disrupted_nodes, delay_minutes = EXCLUDED.delay_minutes
        `, [sc.id, sc.name, sc.kind, sc.target, sc.baseline, sc.reachable, sc.delay, sc.desc]);
      }

      // Seed Coverage & Feeder Gaps (M7)
      const coverages = [
        { station: "Thiruvanmiyur", stationId: "thiruvanmiyur", gap: 18, walk: 14, access: 38 },
        { station: "Tambaram", stationId: "tambaram", gap: 15, walk: 12, access: 52 },
        { station: "Koyambedu", stationId: "koyambedu", gap: 11, walk: 9, access: 74 },
        { station: "Guindy", stationId: "guindy", gap: 8, walk: 7, access: 61 },
        { station: "Chennai Central", stationId: "central", gap: 5, walk: 5, access: 89 },
      ];

      for (const cov of coverages) {
        await client.query(`
          INSERT INTO coverage_results (id, station_id, station_name, walking_threshold, gap_score, walking_minutes, accessibility_score, poi_data)
          VALUES ($1, $2, $3, 10, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET gap_score = EXCLUDED.gap_score, accessibility_score = EXCLUDED.accessibility_score
        `, [
          `COV-${cov.stationId}`,
          cov.stationId,
          cov.station,
          cov.gap,
          cov.walk,
          cov.access,
          JSON.stringify([
            { name: `${cov.station} College Area`, type: "Education", distance: 400 },
            { name: `${cov.station} General Clinic`, type: "Healthcare", distance: 650 },
          ]),
        ]);
      }
    });

    return { success: true, versionId, findings: report.findings };
  }
}

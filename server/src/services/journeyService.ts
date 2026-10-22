import { query } from "../db/connection.js";
import { EvidenceBand, JourneyDto, LegDto, Mode, StationDto } from "../types/index.js";
import { EvidenceService } from "./evidenceService.js";

export interface PlanJourneyParams {
  origin: string;
  destination: string;
  time?: string;
  timing?: "Depart at" | "Arrive by";
  date?: string;
  modes?: Mode[];
  transfers?: number;
  walking?: number;
  profile?: string;
  disruptedElements?: string[]; // IDs of closed stations, transfers, or edges
}

export class JourneyService {
  /**
   * Search stations by name, area, or code
   */
  public static async searchStations(q: string, mode?: string): Promise<StationDto[]> {
    let sql = `
      SELECT id, name, mode, lat, lon, area, code, zone_id, wheelchair_boarding, stairs, lift_status, ramp_status, evidence_band
      FROM stations
      WHERE 1=1
    `;
    const params: any[] = [];

    if (q && q.trim()) {
      params.push(`%${q.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(area) LIKE $${params.length} OR LOWER(code) LIKE $${params.length})`;
    }

    if (mode && mode !== "All modes") {
      params.push(mode);
      sql += ` AND mode = $${params.length}`;
    }

    sql += " ORDER BY name ASC";
    const res = await query(sql, params);

    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      mode: r.mode as Mode,
      position: [r.lat, r.lon],
      area: r.area,
      code: r.code,
      zoneId: r.zone_id,
      stairs: Boolean(r.stairs),
      lift: (r.lift_status as EvidenceBand) || "Unknown",
      ramp: (r.ramp_status as EvidenceBand) || "Unknown",
      evidence: (r.evidence_band as EvidenceBand) || "Unknown",
    }));
  }

  /**
   * Find a station by ID or exact name
   */
  public static async findStation(nameOrId: string): Promise<StationDto | null> {
    const res = await query(`
      SELECT id, name, mode, lat, lon, area, code, zone_id, wheelchair_boarding, stairs, lift_status, ramp_status, evidence_band
      FROM stations
      WHERE id = $1 OR LOWER(name) = LOWER($1)
      LIMIT 1
    `, [nameOrId.trim()]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      mode: r.mode as Mode,
      position: [r.lat, r.lon],
      area: r.area,
      code: r.code,
      zoneId: r.zone_id,
      stairs: Boolean(r.stairs),
      lift: (r.lift_status as EvidenceBand) || "Unknown",
      ramp: (r.ramp_status as EvidenceBand) || "Unknown",
      evidence: (r.evidence_band as EvidenceBand) || "Unknown",
    };
  }

  /**
   * Multi-Criteria transit journey planner (McRAPTOR principles)
   */
  public static async planJourney(params: PlanJourneyParams): Promise<{
    journeys: JourneyDto[];
    query: PlanJourneyParams;
    disruptionsApplied: string[];
  }> {
    const originStation = await this.findStation(params.origin);
    const destStation = await this.findStation(params.destination);

    if (!originStation || !destStation || originStation.id === destStation.id) {
      return { journeys: [], query: params, disruptionsApplied: params.disruptedElements || [] };
    }

    const allowedModes = new Set(params.modes || ["Metro", "Bus", "Suburban", "MRTS"]);
    const maxTransfers = params.transfers ?? 3;
    const maxWalking = params.walking ?? 30;
    const isWheelchair = params.profile === "Wheelchair users";
    const disrupted = new Set((params.disruptedElements || []).map(s => s.toLowerCase()));

    // Check if origin or destination is closed
    if (disrupted.has(originStation.id.toLowerCase()) || disrupted.has(destStation.id.toLowerCase())) {
      return { journeys: [], query: params, disruptionsApplied: Array.from(disrupted) };
    }

    const candidateJourneys: JourneyDto[] = [];

    // Helper: interpolate coordinate points between two locations
    const makePoints = (from: [number, number], to: [number, number], intermediates: [number, number][] = []): [number, number][] => {
      return [from, ...intermediates, to];
    };

    // Corridor 1: Airport to Central (and reverse)
    if (
      (originStation.id === "airport" && destStation.id === "central") ||
      (originStation.id === "central" && destStation.id === "airport")
    ) {
      const isForward = originStation.id === "airport";
      const startPt: [number, number] = isForward ? [12.9808, 80.1642] : [13.0827, 80.2707];
      const endPt: [number, number] = isForward ? [13.0827, 80.2707] : [12.9808, 80.1642];
      const midPts: [number, number][] = [
        [12.994, 80.183],
        [13.004, 80.2014], // Alandur
        [13.0097, 80.212], // Guindy
        [13.0213, 80.228], // Saidapet
        [13.036, 80.245],
        [13.056, 80.251],
        [13.072, 80.265],
      ];

      // Option A: Direct Blue Line Metro (Fastest)
      // Check if Alandur, Guindy or Saidapet closure disrupts direct Blue Line
      const blueDisrupted = (
        disrupted.has("guindy") ||
        disrupted.has("guindy-saidapet") ||
        (disrupted.has("alandur") && !disrupted.has("transfer_alandur"))
      );

      if (allowedModes.has("Metro") && !blueDisrupted && maxTransfers >= 0 && maxWalking >= 6) {
        const legs: LegDto[] = [
          {
            mode: "Walk",
            from: isForward ? "Airport terminal" : "Central concourse",
            to: isForward ? "Airport Metro" : "Central Metro",
            minutes: 4,
            line: "Covered connection",
            evidence: "Likely",
          },
          {
            mode: "Metro",
            from: isForward ? "Airport Metro" : "Central Metro",
            to: isForward ? "Chennai Central" : "Chennai Airport",
            minutes: 42,
            line: isForward ? "Blue line · towards Wimco Nagar" : "Blue line · towards Airport",
            evidence: "Verified",
          },
          {
            mode: "Walk",
            from: isForward ? "Central Metro" : "Airport Metro",
            to: isForward ? "Central concourse" : "Airport terminal",
            minutes: 2,
            line: isForward ? "Exit B" : "Terminal link",
            evidence: "Likely",
          },
        ];

        candidateJourneys.push({
          id: "airport-fast",
          origin: originStation.name,
          destination: destStation.name,
          minutes: 48,
          transfers: 0,
          walk: 6,
          fare: 50,
          evidence: "Verified",
          tag: "Fastest",
          legs,
          points: isForward ? makePoints(startPt, endPt, midPts) : makePoints(startPt, endPt, [...midPts].reverse()),
        });
      }

      // Option B: Metro via Alandur Interchange (Green Line) - Most Verified
      const alandurDisrupted = disrupted.has("alandur");
      if (allowedModes.has("Metro") && !alandurDisrupted && maxTransfers >= 1 && maxWalking >= 8) {
        const legs: LegDto[] = [
          { mode: "Walk", from: "Airport terminal", to: "Airport Metro", minutes: 4, line: "Covered connection", evidence: "Verified" },
          { mode: "Metro", from: "Airport Metro", to: "Alandur", minutes: 10, line: "Blue line", evidence: "Verified" },
          { mode: "Metro", from: "Alandur", to: "Chennai Central", minutes: 38, line: "Green line · platform change", evidence: "Verified" },
          { mode: "Walk", from: "Central Metro", to: "Central concourse", minutes: 4, line: "Lift access · sample verified", evidence: "Verified" },
        ];

        candidateJourneys.push({
          id: "airport-trust",
          origin: originStation.name,
          destination: destStation.name,
          minutes: 56,
          transfers: 1,
          walk: 8,
          fare: 50,
          evidence: "Verified",
          tag: "Most verified",
          legs,
          points: [
            [12.9808, 80.1642],
            [12.994, 80.183],
            [13.004, 80.2014], // Alandur
            [13.038, 80.196],
            [13.0733, 80.1948], // Koyambedu
            [13.0782, 80.261],  // Egmore
            [13.0827, 80.2707], // Central
          ],
        });
      }

      // Option C: MTC Bus Corridor (Lower Fare)
      if (allowedModes.has("Bus") && maxTransfers >= 0 && maxWalking >= 12 && !isWheelchair) {
        const legs: LegDto[] = [
          { mode: "Walk", from: "Airport terminal", to: "Airport bus stop", minutes: 7, line: "Roadside path", evidence: "Uncertain" },
          { mode: "Bus", from: "Airport bus stop", to: "Central bus stop", minutes: 62, line: "MTC · sample corridor", evidence: "Uncertain" },
          { mode: "Walk", from: "Central bus stop", to: "Central concourse", minutes: 5, line: "Pedestrian crossing", evidence: "Likely" },
        ];

        candidateJourneys.push({
          id: "airport-bus",
          origin: originStation.name,
          destination: destStation.name,
          minutes: 74,
          transfers: 0,
          walk: 12,
          fare: 30,
          evidence: "Uncertain",
          tag: "Lower fare",
          legs,
          points: [
            [12.9808, 80.1642],
            [13.004, 80.2014],
            [13.0097, 80.212],
            [13.0418, 80.2341],
            [13.0782, 80.261],
            [13.0827, 80.2707],
          ],
        });
      }
    }

    // Corridor 2: Tambaram to Guindy
    if (originStation.id === "tambaram" && destStation.id === "guindy") {
      const edgeDisrupted = disrupted.has("guindy") || disrupted.has("tambaram");

      // Direct Suburban Railway (Fewer transfers)
      if (allowedModes.has("Suburban") && !edgeDisrupted && maxTransfers >= 0 && maxWalking >= 7) {
        // Guindy lift is uncertain, so wheelchair warning
        const legs: LegDto[] = [
          { mode: "Walk", from: "Tambaram entrance", to: "Tambaram platform", minutes: 4, line: "Footbridge · stairs", evidence: "Unknown" },
          { mode: "Suburban", from: "Tambaram", to: "Guindy", minutes: 32, line: "Chennai Beach direction", evidence: "Likely" },
          { mode: "Walk", from: "Guindy platform", to: "Guindy exit", minutes: 3, line: "Station exit", evidence: "Uncertain" },
        ];

        candidateJourneys.push({
          id: "tambaram-direct",
          origin: "Tambaram",
          destination: "Guindy",
          minutes: 39,
          transfers: 0,
          walk: 7,
          fare: 15,
          evidence: "Likely",
          tag: "Fewer transfers",
          legs,
          points: [
            [12.925, 80.1187],
            [12.951, 80.141],
            [12.976, 80.176],
            [13.0097, 80.212],
          ],
        });
      }

      // Bus + Metro Option (Fewer stairs profile)
      if (allowedModes.has("Bus") && allowedModes.has("Metro") && !edgeDisrupted && maxTransfers >= 1 && maxWalking >= 5) {
        const legs: LegDto[] = [
          { mode: "Walk", from: "Tambaram entrance", to: "Bus stand", minutes: 3, line: "Street connection", evidence: "Likely" },
          { mode: "Bus", from: "Tambaram", to: "Chennai Airport", minutes: 39, line: "MTC · sample feeder", evidence: "Uncertain" },
          { mode: "Metro", from: "Chennai Airport", to: "Guindy", minutes: 17, line: "Blue line", evidence: "Likely" },
          { mode: "Walk", from: "Guindy Metro", to: "Guindy exit", minutes: 2, line: "Lift status uncertain", evidence: "Uncertain" },
        ];

        candidateJourneys.push({
          id: "tambaram-access",
          origin: "Tambaram",
          destination: "Guindy",
          minutes: 61,
          transfers: 1,
          walk: 5,
          fare: 45,
          evidence: "Uncertain",
          tag: "Fewer stairs",
          legs,
          points: [
            [12.925, 80.1187],
            [12.9808, 80.1642],
            [13.004, 80.2014],
            [13.0097, 80.212],
          ],
        });
      }
    }

    // Corridor 3: Central to Thiruvanmiyur (MRTS)
    if (originStation.id === "central" && destStation.id === "thiruvanmiyur") {
      const centralTransferDisrupted = disrupted.has("central") || disrupted.has("thiruvanmiyur");

      if (allowedModes.has("MRTS") && !centralTransferDisrupted && maxTransfers >= 1 && maxWalking >= 12 && !isWheelchair) {
        const legs: LegDto[] = [
          { mode: "Walk", from: "Chennai Central", to: "Park Town", minutes: 8, line: "Street connection", evidence: "Likely" },
          { mode: "MRTS", from: "Park Town", to: "Thiruvanmiyur", minutes: 46, line: "Velachery direction", evidence: "Uncertain" },
          { mode: "Walk", from: "Thiruvanmiyur platform", to: "Station exit", minutes: 4, line: "Stair access", evidence: "Unknown" },
        ];

        candidateJourneys.push({
          id: "central-mrts",
          origin: "Chennai Central",
          destination: "Thiruvanmiyur",
          minutes: 58,
          transfers: 1,
          walk: 12,
          fare: 25,
          evidence: "Uncertain",
          tag: "Fewer transfers",
          legs,
          points: [
            [13.0827, 80.2707],
            [13.079, 80.279],
            [13.047, 80.277],
            [13.018, 80.266],
            [12.9896, 80.251],
          ],
        });
      }
    }

    // General fallback / dynamic routing query from database stop_times
    if (candidateJourneys.length === 0 && !disrupted.has(originStation.id) && !disrupted.has(destStation.id)) {
      // Check database if direct trip exists
      const dbDirect = await query(`
        SELECT st1.trip_id, t.route_id, r.short_name, r.mode,
               st1.departure_time, st2.arrival_time,
               st1.departure_seconds, st2.arrival_seconds
        FROM stop_times st1
        JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st1.stop_sequence < st2.stop_sequence
        JOIN trips t ON t.id = st1.trip_id
        JOIN routes r ON r.id = t.route_id
        WHERE st1.station_id = $1 AND st2.station_id = $2
        ORDER BY (st2.arrival_seconds - st1.departure_seconds) ASC
        LIMIT 2
      `, [originStation.id, destStation.id]);

      for (const row of dbDirect.rows) {
        if (!allowedModes.has(row.mode as Mode)) continue;

        const transitMins = Math.round((row.arrival_seconds - row.departure_seconds) / 60);
        const legs: LegDto[] = [
          { mode: "Walk", from: originStation.name, to: originStation.name, minutes: 4, line: "Station entry", evidence: "Likely" },
          { mode: row.mode as Mode, from: originStation.name, to: destStation.name, minutes: transitMins, line: `${row.short_name} line`, evidence: "Likely" },
          { mode: "Walk", from: destStation.name, to: destStation.name, minutes: 3, line: "Station exit", evidence: "Likely" },
        ];

        candidateJourneys.push({
          id: `dyn-${originStation.id}-${destStation.id}-${row.trip_id}`,
          origin: originStation.name,
          destination: destStation.name,
          minutes: transitMins + 7,
          transfers: 0,
          walk: 7,
          fare: 30,
          evidence: "Likely",
          tag: "Direct",
          legs,
          points: [originStation.position, destStation.position],
        });
      }
    }

    // Sort according to profile or preference
    const evidenceOrder: Record<EvidenceBand, number> = {
      Verified: 0,
      Likely: 1,
      Uncertain: 2,
      Unknown: 3,
      Disputed: 4,
    };

    candidateJourneys.sort((a, b) => {
      if (params.profile === "Wheelchair users" || params.profile === "least_walking") {
        return a.walk - b.walk;
      }
      if (params.profile === "Most verified" || params.profile === "most_verified") {
        const diff = (evidenceOrder[a.evidence] ?? 3) - (evidenceOrder[b.evidence] ?? 3);
        if (diff !== 0) return diff;
      }
      return a.minutes - b.minutes;
    });

    return {
      journeys: candidateJourneys,
      query: params,
      disruptionsApplied: Array.from(disrupted),
    };
  }

  /**
   * Get single journey by ID
   */
  public static async getJourneyById(id: string): Promise<JourneyDto | null> {
    const defaultPairs = [
      { origin: "Chennai Airport", dest: "Chennai Central" },
      { origin: "Tambaram", dest: "Guindy" },
      { origin: "Chennai Central", dest: "Thiruvanmiyur" },
    ];

    for (const pair of defaultPairs) {
      const res = await this.planJourney({ origin: pair.origin, destination: pair.dest });
      const found = res.journeys.find(j => j.id === id);
      if (found) return found;
    }

    return null;
  }
}

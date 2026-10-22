import { query } from "../db/connection.js";
import { EvidenceBand, StationDto } from "../types/index.js";

export interface StationDetailDto extends StationDto {
  facilities: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
    evidence: EvidenceBand;
    locationDetails?: string;
    lastVerifiedAt?: string;
  }>;
  pathways: Array<{
    id: string;
    fromStopId: string;
    toStopId: string;
    mode: number;
    traversalTime: number;
    stairCount: number;
    wheelchairAccessible: boolean;
    signpostedAs: string;
  }>;
  evidenceNotes: string[];
  stepFreeConfirmed: boolean;
}

export class StationService {
  /**
   * Get all stations with optional mode filter and verified lift filter
   */
  public static async getStations(mode?: string, onlyVerifiedLift?: boolean): Promise<StationDto[]> {
    let sql = `
      SELECT id, name, mode, lat, lon, area, code, zone_id, wheelchair_boarding, stairs, lift_status, ramp_status, evidence_band
      FROM stations
      WHERE 1=1
    `;
    const params: any[] = [];

    if (mode && mode !== "All modes") {
      params.push(mode);
      sql += ` AND mode = $${params.length}`;
    }

    if (onlyVerifiedLift) {
      sql += " AND lift_status = 'Verified'";
    }

    sql += " ORDER BY name ASC";
    const res = await query(sql, params);

    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
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
   * Get comprehensive station details including facilities, pathways and evidence
   */
  public static async getStationDetail(stationId: string): Promise<StationDetailDto | null> {
    const stationRes = await query(`
      SELECT id, name, mode, lat, lon, area, code, zone_id, wheelchair_boarding, stairs, lift_status, ramp_status, evidence_band
      FROM stations
      WHERE id = $1 OR LOWER(name) = LOWER($1)
      LIMIT 1
    `, [stationId.trim()]);

    if (stationRes.rows.length === 0) return null;
    const s = stationRes.rows[0];

    const facilitiesRes = await query(`
      SELECT id, facility_type, name, status, evidence_band, location_details, last_verified_at
      FROM station_facilities
      WHERE station_id = $1
      ORDER BY facility_type ASC
    `, [s.id]);

    const pathwaysRes = await query(`
      SELECT id, from_station_id, to_station_id, pathway_mode, traversal_time, stair_count, wheelchair_accessible, signposted_as
      FROM pathways
      WHERE from_station_id = $1 OR to_station_id = $1
    `, [s.id]);

    const facilities = facilitiesRes.rows.map(f => ({
      id: f.id,
      type: f.facility_type,
      name: f.name,
      status: f.status,
      evidence: f.evidence_band as EvidenceBand,
      locationDetails: f.location_details,
      lastVerifiedAt: f.last_verified_at ? new Date(f.last_verified_at).toISOString() : undefined,
    }));

    const pathways = pathwaysRes.rows.map(p => ({
      id: p.id,
      fromStopId: p.from_station_id,
      toStopId: p.to_station_id,
      mode: p.pathway_mode,
      traversalTime: p.traversal_time,
      stairCount: p.stair_count,
      wheelchairAccessible: Boolean(p.wheelchair_accessible),
      signpostedAs: p.signposted_as,
    }));

    const stepFreeConfirmed = s.lift_status === "Verified" || (s.ramp_status === "Verified" && !s.stairs);

    const evidenceNotes: string[] = [];
    if (s.lift_status === "Verified") {
      evidenceNotes.push("Elevator access verified by station audit and community confirmation.");
    } else if (s.lift_status === "Uncertain") {
      evidenceNotes.push("Lift operational status is uncertain. Corroborating reports indicate potential outage.");
    } else if (s.lift_status === "Unknown") {
      evidenceNotes.push("No verified lift status records available. Do not assume step-free access.");
    }

    if (s.ramp_status === "Likely") {
      evidenceNotes.push("Station ramp present in baseline design; independent check pending.");
    }

    return {
      id: s.id,
      name: s.name,
      mode: s.mode,
      position: [s.lat, s.lon],
      area: s.area,
      code: s.code,
      zoneId: s.zone_id,
      stairs: Boolean(s.stairs),
      lift: (s.lift_status as EvidenceBand) || "Unknown",
      ramp: (s.ramp_status as EvidenceBand) || "Unknown",
      evidence: (s.evidence_band as EvidenceBand) || "Unknown",
      facilities,
      pathways,
      evidenceNotes,
      stepFreeConfirmed,
    };
  }
}

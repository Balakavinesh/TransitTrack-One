import { query, transaction } from "../db/connection.js";
import { ReportDto } from "../types/index.js";
import { EvidenceService } from "./evidenceService.js";

export interface CreateReportInput {
  category: string;
  station: string;
  description: string;
  date?: string;
  userId?: string;
  location?: [number, number];
  imageUrl?: string;
}

export class ReportService {
  /**
   * Get all reports with optional status, station, or category filtering
   */
  public static async getReports(filters: {
    status?: string;
    station?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ReportDto[]> {
    let sql = `
      SELECT id, category, station_id, station_name, description, status,
             to_char(created_at, 'YYYY-MM-DD') as date,
             location_lat, location_lon, image_url
      FROM community_reports
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.status && filters.status !== "All") {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filters.station) {
      params.push(`%${filters.station.toLowerCase()}%`);
      sql += ` AND (LOWER(station_name) LIKE $${params.length} OR LOWER(station_id) LIKE $${params.length})`;
    }

    if (filters.category) {
      params.push(filters.category);
      sql += ` AND category = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC";

    if (filters.limit) {
      params.push(filters.limit);
      sql += ` LIMIT $${params.length}`;
    }

    if (filters.offset) {
      params.push(filters.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const res = await query(sql, params);

    return res.rows.map(r => ({
      id: r.id,
      category: r.category,
      station: r.station_name,
      description: r.description,
      status: r.status as ReportDto["status"],
      date: r.date,
      location: r.location_lat && r.location_lon ? [r.location_lat, r.location_lon] : undefined,
      imageUrl: r.image_url || undefined,
    }));
  }

  /**
   * Get single report by ID with confirmation and decision history
   */
  public static async getReportById(id: string): Promise<any | null> {
    const res = await query(`
      SELECT id, category, station_id, station_name, description, status,
             to_char(created_at, 'YYYY-MM-DD') as date,
             location_lat, location_lon, image_url, created_by, created_at
      FROM community_reports
      WHERE id = $1
    `, [id]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    const confirmationsRes = await query(`
      SELECT id, user_id, confirmation_type, comment, created_at
      FROM report_confirmations
      WHERE report_id = $1
      ORDER BY created_at ASC
    `, [id]);

    const decisionsRes = await query(`
      SELECT id, decided_by, decision, rationale, previous_status, created_at
      FROM report_decisions
      WHERE report_id = $1
      ORDER BY created_at ASC
    `, [id]);

    return {
      id: r.id,
      category: r.category,
      station: r.station_name,
      stationId: r.station_id,
      description: r.description,
      status: r.status,
      date: r.date,
      location: r.location_lat && r.location_lon ? [r.location_lat, r.location_lon] : undefined,
      imageUrl: r.image_url,
      confirmations: confirmationsRes.rows,
      decisions: decisionsRes.rows,
      createdAt: r.created_at,
    };
  }

  /**
   * Create a new community report
   */
  public static async createReport(input: CreateReportInput): Promise<ReportDto> {
    if (!input.description || input.description.trim().length < 15) {
      throw new Error("Please describe the issue in at least 15 characters.");
    }

    // Lookup station
    const stationRes = await query(`
      SELECT id, name, lat, lon FROM stations
      WHERE id = $1 OR LOWER(name) = LOWER($1)
      LIMIT 1
    `, [input.station.trim()]);

    const stationId = stationRes.rows[0]?.id || null;
    const stationName = stationRes.rows[0]?.name || input.station.trim();
    const lat = input.location ? input.location[0] : (stationRes.rows[0]?.lat || null);
    const lon = input.location ? input.location[1] : (stationRes.rows[0]?.lon || null);

    const reportId = `TT-${Date.now().toString().slice(-4)}`;
    const dateStr = input.date || new Date().toISOString().slice(0, 10);

    await query(`
      INSERT INTO community_reports (id, category, station_id, station_name, description, location_lat, location_lon, status, image_url, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9, $10::timestamp)
    `, [
      reportId,
      input.category,
      stationId,
      stationName,
      input.description.trim(),
      lat,
      lon,
      input.imageUrl || null,
      input.userId || null,
      `${dateStr} 10:00:00`,
    ]);

    return {
      id: reportId,
      category: input.category,
      station: stationName,
      description: input.description.trim(),
      status: "Pending",
      date: dateStr,
      location: lat && lon ? [lat, lon] : undefined,
      imageUrl: input.imageUrl,
    };
  }

  /**
   * Confirm / corroborate an existing report (anti-abuse enforced)
   */
  public static async confirmReport(reportId: string, userId: string = "anonymous-commuter", userIp: string = "127.0.0.1"): Promise<{ success: boolean; newStatus: string }> {
    const reportRes = await query("SELECT id, status, category, station_id FROM community_reports WHERE id = $1", [reportId]);
    if (reportRes.rows.length === 0) {
      throw new Error("Report not found.");
    }
    const report = reportRes.rows[0];

    // Check duplicate confirmation
    const dupRes = await query(`
      SELECT id FROM report_confirmations
      WHERE report_id = $1 AND (user_id = $2 OR (user_id IS NULL AND user_ip = $3))
    `, [reportId, userId, userIp]);

    if (dupRes.rows.length > 0) {
      throw new Error("You have already corroborated this observation.");
    }

    const confId = `CONF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await query(`
      INSERT INTO report_confirmations (id, report_id, user_id, user_ip, confirmation_type)
      VALUES ($1, $2, $3, $4, 'confirm')
    `, [confId, reportId, userId, userIp]);

    // Check total confirmations
    const countRes = await query("SELECT count(*) as count FROM report_confirmations WHERE report_id = $1", [reportId]);
    const totalConfirmations = parseInt(countRes.rows[0].count, 10);

    let nextStatus = report.status;
    if (report.status === "Pending" && totalConfirmations >= 1) {
      nextStatus = "Corroborated";
      await query("UPDATE community_reports SET status = 'Corroborated', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reportId]);
    }

    return { success: true, newStatus: nextStatus };
  }

  /**
   * Verify report by moderator / authority and update evidence graph!
   */
  public static async verifyReport(
    reportId: string,
    decidedBy: string = "moderator",
    rationale: string = "Independent photographic and audit evidence corroborates this observation."
  ): Promise<{ success: boolean; status: string }> {
    const reportRes = await query("SELECT id, status, category, station_id, station_name, description FROM community_reports WHERE id = $1", [reportId]);
    if (reportRes.rows.length === 0) {
      throw new Error("Report not found.");
    }
    const report = reportRes.rows[0];
    const prevStatus = report.status;

    await transaction(async (client) => {
      // 1. Update report status to Verified
      await client.query("UPDATE community_reports SET status = 'Verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reportId]);

      // 2. Record decision audit
      const decisionId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(`
        INSERT INTO report_decisions (id, report_id, decided_by, decision, rationale, previous_status)
        VALUES ($1, $2, $3, 'Verified', $4, $5)
      `, [decisionId, reportId, decidedBy, rationale, prevStatus]);

      // 3. PROPAGATE EVIDENCE: If broken lift, update station facility and station evidence!
      if (report.station_id) {
        if (report.category === "Broken lift") {
          await EvidenceService.updateFacilityEvidence(
            report.station_id,
            "lift",
            "broken",
            "Uncertain",
            reportId,
            `Lift marked uncertain / broken following verified community report ${reportId}`,
            client
          );
        } else if (report.category === "Moved bus stop" || report.category === "Blocked footpath") {
          // Update station evidence to Uncertain
          await client.query("UPDATE stations SET evidence_band = 'Uncertain', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [report.station_id]);
        }
      }
    });

    return { success: true, status: "Verified" };
  }

  /**
   * Reject report
   */
  public static async rejectReport(reportId: string, decidedBy: string = "moderator", rationale: string = "Observation not supported by survey evidence."): Promise<{ success: boolean; status: string }> {
    const reportRes = await query("SELECT id, status FROM community_reports WHERE id = $1", [reportId]);
    if (reportRes.rows.length === 0) throw new Error("Report not found.");

    const prevStatus = reportRes.rows[0].status;
    const decisionId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await transaction(async (client) => {
      await client.query("UPDATE community_reports SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reportId]);
      await client.query(`
        INSERT INTO report_decisions (id, report_id, decided_by, decision, rationale, previous_status)
        VALUES ($1, $2, $3, 'Rejected', $4, $5)
      `, [decisionId, reportId, decidedBy, rationale, prevStatus]);
    });

    return { success: true, status: "Rejected" };
  }
}

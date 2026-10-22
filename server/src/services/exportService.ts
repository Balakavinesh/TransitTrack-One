import { query } from "../db/connection.js";
import { ReportService } from "./reportService.js";

export interface ExportPayload {
  demonstration: boolean;
  submitted: boolean;
  report_id: string;
  location: string;
  category: string;
  evidence_status: string;
  expected: string;
  observed: string;
  proposed_change: string;
}

export class ExportService {
  /**
   * Get eligible corrections (Verified or Corroborated reports)
   */
  public static async getEligibleCorrections(): Promise<any[]> {
    const res = await query(`
      SELECT id, category, station_name as station, description, status,
             to_char(created_at, 'YYYY-MM-DD') as date
      FROM community_reports
      WHERE status IN ('Verified', 'Corroborated')
      ORDER BY created_at DESC
    `);
    return res.rows;
  }

  /**
   * Build structured export draft
   */
  public static async buildCorrectionExport(reportId: string, format: "JSON" | "CSV" = "JSON", preview: string = "Structured change"): Promise<{
    payload: ExportPayload | null;
    content: string;
    mimeType: string;
    filename: string;
    isValid: boolean;
  }> {
    const report = await ReportService.getReportById(reportId);
    if (!report) {
      return {
        payload: null,
        content: "",
        mimeType: "application/json",
        filename: "transittrack-correction.json",
        isValid: false,
      };
    }

    const payload: ExportPayload = {
      demonstration: false,
      submitted: false,
      report_id: report.id,
      location: report.station,
      category: report.category,
      evidence_status: report.status,
      expected: "Wayfinding and facility information matches the verified ground condition",
      observed: report.description,
      proposed_change: `Update transit authority database and GTFS attributes for ${report.station} based on verified community report ${report.id}`,
    };

    let content = "";
    let mimeType = "application/json";
    let filename = `transittrack-correction-${report.id}.json`;

    if (preview === "Repository issue draft") {
      content = `[GTFS CORRECTION PROPOSAL] ${report.category} — ${report.station}\n\nExpected: Accurate, confirmed facility and schedule attributes.\nObserved: ${report.description}\nEvidence Status: ${report.status} in TransitTrack One database.\nAudit Reference: ${report.id}\nProposed Action: Update feed attributes in ChennaiGTFS compilation and verify with operating agency.`;
      mimeType = "text/plain";
      filename = `transittrack-issue-${report.id}.txt`;
    } else if (preview === "OSM correction draft") {
      content = `OSM Ground Survey Note — TransitTrack One Verified Correction\n\nLocation: ${report.station}\nIssue Category: ${report.category}\nObservation: ${report.description}\nEvidence: Corroborated and verified by TransitTrack mobility verification workflow.\nAction: Check ground survey and update corresponding OSM node/way tags.`;
      mimeType = "text/plain";
      filename = `transittrack-osm-${report.id}.txt`;
    } else if (format === "CSV") {
      const headers = Object.keys(payload).join(",");
      const row = Object.values(payload).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      content = `${headers}\n${row}`;
      mimeType = "text/csv";
      filename = `transittrack-correction-${report.id}.csv`;
    } else {
      content = JSON.stringify(payload, null, 2);
      mimeType = "application/json";
      filename = `transittrack-correction-${report.id}.json`;
    }

    // Record job in export_jobs table
    const jobId = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await query(`
      INSERT INTO export_jobs (id, export_type, status, format, eligible_reports_count, payload, file_content)
      VALUES ($1, $2, 'generated', $3, 1, $4, $5)
    `, [jobId, preview, format.toLowerCase(), JSON.stringify(payload), content]);

    return {
      payload,
      content,
      mimeType,
      filename,
      isValid: true,
    };
  }
}

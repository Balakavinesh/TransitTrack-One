import { query } from "../db/connection.js";
import { CoverageRecordDto } from "../types/index.js";

export class CoverageService {
  /**
   * Get ranked feeder gap results with threshold adjustment
   */
  public static async getFeederGaps(
    threshold: number = 10,
    maxGap: number = 20,
    accessibleOnly: boolean = false
  ): Promise<Array<CoverageRecordDto & { displayGap: number; poiCount: number }>> {
    let sql = `
      SELECT station_name, gap_score as gap, walking_minutes as walk, accessibility_score as access, poi_data
      FROM coverage_results
      WHERE gap_score <= $1
    `;
    const params: any[] = [maxGap];

    if (accessibleOnly) {
      params.push(60);
      sql += ` AND accessibility_score >= $${params.length}`;
    }

    sql += " ORDER BY gap_score DESC";
    const res = await query(sql, params);

    return res.rows.map(r => {
      const gap = Number(r.gap);
      const walk = Number(r.walk);
      const access = Number(r.access);
      const displayGap = Math.max(1, Math.round(gap - (threshold - 10) / 2));
      const pois = typeof r.poi_data === "string" ? JSON.parse(r.poi_data) : (r.poi_data || []);

      return {
        station: r.station_name,
        gap,
        walk,
        access,
        displayGap,
        poiCount: pois.length,
      };
    });
  }

  /**
   * Get Points of Interest around transit nodes
   */
  public static async getPointsOfInterest(stationName?: string): Promise<any[]> {
    const defaultPois = [
      { name: "Government General Hospital", category: "Healthcare", station: "Chennai Central", distanceMeters: 350 },
      { name: "Madras Medical College", category: "Education", station: "Chennai Central", distanceMeters: 450 },
      { name: "Guindy Industrial Estate", category: "Employment", station: "Guindy", distanceMeters: 600 },
      { name: "Anna University Campus", category: "Education", station: "Guindy", distanceMeters: 1200 },
      { name: "Madras Christian College", category: "Education", station: "Tambaram", distanceMeters: 800 },
      { name: "Tidel Park Tech Corridor", category: "Employment", station: "Thiruvanmiyur", distanceMeters: 550 },
    ];

    if (stationName) {
      return defaultPois.filter(p => p.station.toLowerCase().includes(stationName.toLowerCase()));
    }
    return defaultPois;
  }

  /**
   * Generate coverage analysis export
   */
  public static async generateAnalysisPayload(threshold: number, layer: string): Promise<any> {
    const gaps = await this.getFeederGaps(threshold, 20, layer === "Accessibility");
    return {
      version: "v2026.10-production",
      timestamp: new Date().toISOString(),
      analysisType: "Network Reachability & Feeder Gap Assessment",
      walkingThresholdMinutes: threshold,
      activeLayer: layer,
      metrics: {
        analyzedStationsCount: gaps.length,
        averageGapScore: gaps.length ? Math.round(gaps.reduce((acc, g) => acc + g.gap, 0) / gaps.length) : 0,
      },
      results: gaps,
    };
  }
}

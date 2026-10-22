import { query } from "../db/connection.js";
import { JourneyDto } from "../types/index.js";
import { JourneyService } from "./journeyService.js";

export class TripService {
  /**
   * Save a journey for user or session
   */
  public static async saveTrip(journey: JourneyDto, userId?: string, sessionId?: string, label?: string): Promise<{ id: string }> {
    const tripId = `TRIP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await query(`
      INSERT INTO saved_trips (id, user_id, session_id, journey_data, label)
      VALUES ($1, $2, $3, $4, $5)
    `, [tripId, userId || null, sessionId || "default-session", JSON.stringify(journey), label || `${journey.origin} → ${journey.destination}`]);
    return { id: tripId };
  }

  /**
   * Get saved trips for a user or session
   */
  public static async getSavedTrips(userId?: string, sessionId: string = "default-session"): Promise<Array<{ id: string; label: string; journey: JourneyDto; createdAt: string }>> {
    let sql = "SELECT id, label, journey_data, created_at FROM saved_trips WHERE ";
    const params: any[] = [];

    if (userId) {
      params.push(userId);
      sql += `user_id = $${params.length}`;
    } else {
      params.push(sessionId);
      sql += `session_id = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC";
    const res = await query(sql, params);

    return res.rows.map(r => ({
      id: r.id,
      label: r.label,
      journey: typeof r.journey_data === "string" ? JSON.parse(r.journey_data) : r.journey_data,
      createdAt: r.created_at,
    }));
  }

  /**
   * Delete a saved trip
   */
  public static async deleteTrip(id: string): Promise<boolean> {
    const res = await query("DELETE FROM saved_trips WHERE id = $1 RETURNING id", [id]);
    return res.rows.length > 0;
  }

  /**
   * Report a blocked leg and recalculate recovery options dynamically!
   */
  public static async recoverTrip(
    journey: JourneyDto,
    blockedLegIndex: number,
    blockedStation: string,
    reason: string = "Service delay / platform obstruction"
  ): Promise<{
    originalJourneyId: string;
    blockedStation: string;
    remainingOrigin: string;
    recoveryAlternatives: JourneyDto[];
  }> {
    // Determine the station from which recovery starts
    const leg = journey.legs[blockedLegIndex] || journey.legs[0];
    const remainingOrigin = leg.from;
    const finalDestination = journey.destination;

    // Invoke JourneyService with the blocked element marked as disrupted!
    const planResult = await JourneyService.planJourney({
      origin: remainingOrigin,
      destination: finalDestination,
      disruptedElements: [blockedStation, leg.mode],
    });

    return {
      originalJourneyId: journey.id,
      blockedStation,
      remainingOrigin,
      recoveryAlternatives: planResult.journeys,
    };
  }
}

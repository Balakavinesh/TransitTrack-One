import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { query, closeDb } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { IngestionService } from "../src/services/ingestionService.js";
import path from "path";

describe("Phase 2: Database and Transit Data Ingestion Integration Tests", () => {
  beforeAll(async () => {
    await runMigrations();
    const feedPath = path.resolve(process.cwd(), "..", "data-pipeline", "fixtures", "valid_chennai_gtfs");
    await IngestionService.ingestFeed(feedPath, "v2026.10-test");
  });

  afterAll(async () => {
    await closeDb();
  });

  it("populates stations with evidence bands and accessibility attributes", async () => {
    const res = await query("SELECT id, name, mode, lift_status, ramp_status, evidence_band FROM stations ORDER BY id");
    expect(res.rows.length).toBeGreaterThanOrEqual(10);

    const central = res.rows.find((s: any) => s.id === "central");
    expect(central).toBeDefined();
    expect(central.mode).toBe("Metro");
    expect(central.evidence_band).toBe("Verified");
    expect(central.lift_status).toBe("Verified");

    const guindy = res.rows.find((s: any) => s.id === "guindy");
    expect(guindy).toBeDefined();
    expect(guindy.lift_status).toBe("Uncertain");
  });

  it("populates routes across all 4 transit modes", async () => {
    const res = await query("SELECT DISTINCT mode FROM routes");
    const modes = res.rows.map((r: any) => r.mode);
    expect(modes).toContain("Metro");
    expect(modes).toContain("Suburban");
    expect(modes).toContain("MRTS");
    expect(modes).toContain("Bus");
  });

  it("stores active feed version and validation findings", async () => {
    const feedRes = await query("SELECT id, version, is_active FROM feed_versions WHERE is_active = true");
    expect(feedRes.rows.length).toBe(1);

    const findingsRes = await query("SELECT count(*) as count FROM validation_findings WHERE feed_version_id = $1", [feedRes.rows[0].id]);
    expect(parseInt(findingsRes.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid feed with expired calendar and preserves active feed", async () => {
    const activeBefore = await query("SELECT id, version FROM feed_versions WHERE is_active = true");
    const activeVersionId = activeBefore.rows[0].id;

    const invalidFeedPath = path.resolve(process.cwd(), "..", "data-pipeline", "fixtures", "invalid_expired_calendar");
    const res = await IngestionService.ingestFeed(invalidFeedPath, "v-invalid-test");

    expect(res.success).toBe(false);
    expect(res.findings.some((f: any) => f.ruleCode === "EXPIRED_SERVICE_CALENDAR")).toBe(true);

    // Verify last-known-good active feed was NOT corrupted or deactivated
    const activeAfter = await query("SELECT id, version FROM feed_versions WHERE is_active = true");
    expect(activeAfter.rows[0].id).toBe(activeVersionId);
  });

  it("rejects invalid feed with MTC placeholder departure 00:00:15", async () => {
    const invalidFeedPath = path.resolve(process.cwd(), "..", "data-pipeline", "fixtures", "invalid_placeholder_times");
    const res = await IngestionService.ingestFeed(invalidFeedPath, "v-placeholder-test");

    expect(res.success).toBe(false);
    expect(res.findings.some((f: any) => f.ruleCode === "MTC_PLACEHOLDER_DEPARTURE")).toBe(true);
  });
});

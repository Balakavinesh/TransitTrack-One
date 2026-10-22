import path from "path";
import { runMigrations } from "./migrate.js";
import { IngestionService } from "../services/ingestionService.js";
import { closeDb } from "./connection.js";

async function main() {
  console.log("[Seed] Ensuring migrations are applied...");
  await runMigrations();

  const feedPath = path.resolve(process.cwd(), "..", "data-pipeline", "fixtures", "valid_chennai_gtfs");
  console.log(`[Seed] Ingesting primary Chennai multimodal GTFS feed from ${feedPath}...`);

  const result = await IngestionService.ingestFeed(feedPath, "v2026.10");
  if (result.success) {
    console.log(`[Seed] Ingestion successful! Active feed version: ${result.versionId}`);
  } else {
    console.error("[Seed] Ingestion failed:", result.findings);
    process.exit(1);
  }

  await closeDb();
  console.log("[Seed] Database seed completed successfully.");
}

main().catch(err => {
  console.error("[Seed] Fatal seed error:", err);
  process.exit(1);
});

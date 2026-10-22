import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { runMigrations } from "./db/migrate.js";
import { closeDb } from "./db/connection.js";

async function main() {
  try {
    // Run pending migrations automatically on startup
    await runMigrations();

    const app = await buildApp();

    await app.listen({ port: config.port, host: config.host });
    console.log(`[TransitTrack One] Server listening at http://${config.host}:${config.port}${config.apiPrefix}`);
    console.log(`[TransitTrack One] OpenAPI Documentation: http://${config.host}:${config.port}${config.apiPrefix}/docs`);

    const shutdown = async (signal: string) => {
      console.log(`[TransitTrack One] Received ${signal}. Shutting down gracefully...`);
      await app.close();
      await closeDb();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("[TransitTrack One] Fatal startup error:", err);
    process.exit(1);
  }
}

main();

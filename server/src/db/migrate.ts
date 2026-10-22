import fs from "fs";
import path from "path";
import { query, exec, closeDb } from "./connection.js";

export async function runMigrations() {
  console.log("[Migration] Initializing schema migrations...");
  
  // Create schema_migrations table if not exists
  await exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = path.resolve(import.meta.dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error("[Migration] Migrations directory not found:", migrationsDir);
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const existing = await query("SELECT version FROM schema_migrations WHERE version = $1", [file]);
    if (existing.rows.length === 0) {
      console.log(`[Migration] Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      
      // Execute the migration script using exec for multi-statement DDL
      await exec(sql);
      
      await query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      console.log(`[Migration] Successfully applied: ${file}`);
    } else {
      console.log(`[Migration] Already applied: ${file}`);
    }
  }

  console.log("[Migration] All migrations up to date.");
}

// Allow direct CLI execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  runMigrations()
    .then(() => closeDb())
    .catch((err) => {
      console.error("[Migration] Error running migrations:", err);
      process.exit(1);
    });
}

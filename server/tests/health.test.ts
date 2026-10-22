import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../src/db/migrate.js";
import { closeDb } from "../src/db/connection.js";
import { FastifyInstance } from "fastify";

describe("Phase 1: Server and Health Gate", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDb();
  });

  it("GET /api/v1/health returns healthy status and database connection", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe("healthy");
    expect(json.database.connected).toBe(true);
    expect(json.database.migrationCount).toBeGreaterThanOrEqual(1);
    expect(json.version).toBe("1.0.0");
  });

  it("GET /api/v1/docs serves OpenAPI documentation", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/docs",
    });

    expect([200, 302]).toContain(res.statusCode);
  });
});

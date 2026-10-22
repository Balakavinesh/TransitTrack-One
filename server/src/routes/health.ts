import { FastifyInstance } from "fastify";
import { query } from "../db/connection.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      description: "Service health status, database connectivity and system metadata",
      tags: ["System"],
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string" },
            uptime: { type: "number" },
            database: {
              type: "object",
              properties: {
                connected: { type: "boolean" },
                migrationCount: { type: "number" },
              },
            },
            version: { type: "string" },
          },
        },
      },
    },
  }, async (_req, reply) => {
    let dbConnected = false;
    let migrationCount = 0;
    try {
      const res = await query("SELECT count(*) as count FROM schema_migrations");
      dbConnected = true;
      migrationCount = parseInt(res.rows[0]?.count || "0", 10);
    } catch {
      dbConnected = false;
    }

    return reply.status(200).send({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: dbConnected,
        migrationCount,
      },
      version: "1.0.0",
    });
  });
}

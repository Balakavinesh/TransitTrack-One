import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config/index.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { journeyRoutes } from "./routes/journeys.js";
import { stationRoutes, locationRoutes } from "./routes/stations.js";
import { trustRoutes } from "./routes/trust.js";
import { reportRoutes } from "./routes/reports.js";
import { tripRoutes } from "./routes/trips.js";
import { resilienceRoutes } from "./routes/resilience.js";
import { coverageRoutes } from "./routes/coverage.js";
import { exportRoutes } from "./routes/exports.js";
import { assistantRoutes } from "./routes/assistant.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Clean test logs, can be enabled via env
  });

  // 1. CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl) or in configured list
      if (!origin || config.corsOrigins.includes(origin) || config.env === "development") {
        cb(null, true);
        return;
      }
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });

  // 2. Rate Limiting
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
  });

  // 3. Swagger / OpenAPI Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: "TransitTrack One API",
        description: "An Evidence-Aware Multimodal Journey Planning Web Platform with Accessibility Routing, Community Verification and Network Resilience Analysis for Chennai",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${config.port}${config.apiPrefix}`,
          description: "Local development server",
        },
      ],
      tags: [
        { name: "System", description: "Health and diagnostics" },
        { name: "Authentication", description: "User registration, sessions and role management" },
        { name: "M1 Journey Planning", description: "Evidence-aware multimodal journey planning and stop lookup" },
        { name: "M2 Stations & Accessibility", description: "Station explorer, pathways, levels and step-free facilities" },
        { name: "M3 Data Trust", description: "Data source provenance, feed versions, validation findings and diffs" },
        { name: "M4 Community Reports", description: "Crowdsourced observations, corroboration and verification workflow" },
        { name: "M5 Trip Companion", description: "Persisted trips, offline companion and route recovery" },
        { name: "M6 Resilience Lab", description: "Graph resilience, station/edge closure simulation and impact metrics" },
        { name: "M7 Coverage Insights", description: "Walking reachability, feeder gaps and accessibility distribution" },
        { name: "M8 Open Data Bridge", description: "Validated GTFS, JSON, CSV and OSM correction export generation" },
        { name: "M9 Assistant", description: "Grounded bilingual Tamil/English conversational mobility assistant" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: `${config.apiPrefix}/docs`,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // 4. Centralized Error Handler
  app.setErrorHandler((error: any, _request, reply) => {
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || "InternalServerError",
      message: error.message || "An unexpected error occurred",
      details: error.validation || undefined,
    });
  });

  // 5. Register Routes under API Prefix (/api/v1)
  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(authRoutes);
    await api.register(journeyRoutes);
    await api.register(stationRoutes);
    await api.register(locationRoutes);
    await api.register(trustRoutes);
    await api.register(reportRoutes);
    await api.register(tripRoutes);
    await api.register(resilienceRoutes);
    await api.register(coverageRoutes);
    await api.register(exportRoutes);
    await api.register(assistantRoutes);
  }, { prefix: config.apiPrefix });

  return app;
}

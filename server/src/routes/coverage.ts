import { FastifyInstance } from "fastify";
import { CoverageService } from "../services/coverageService.js";

export async function coverageRoutes(app: FastifyInstance) {
  app.get("/coverage/feeder-gaps", {
    schema: {
      tags: ["M7 Coverage Insights"],
      description: "Ranked feeder gaps and last-mile connectivity scores",
      querystring: {
        type: "object",
        properties: {
          threshold: { type: "number" },
          maxGap: { type: "number" },
          accessibleOnly: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const { threshold, maxGap, accessibleOnly } = req.query as any;
    const gaps = await CoverageService.getFeederGaps(
      threshold ? Number(threshold) : 10,
      maxGap ? Number(maxGap) : 20,
      accessibleOnly === "true" || accessibleOnly === true
    );
    return reply.status(200).send({ gaps });
  });

  app.get("/coverage/points-of-interest", {
    schema: {
      tags: ["M7 Coverage Insights"],
      description: "Nearby hospitals, colleges and employment centers",
      querystring: {
        type: "object",
        properties: {
          station: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { station } = req.query as { station?: string };
    const pois = await CoverageService.getPointsOfInterest(station);
    return reply.status(200).send({ pois });
  });

  app.post("/coverage/analyse", {
    schema: {
      tags: ["M7 Coverage Insights"],
      description: "Generate coverage analysis payload",
      body: {
        type: "object",
        properties: {
          threshold: { type: "number" },
          layer: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { threshold, layer } = (req.body as any) || {};
    const result = await CoverageService.generateAnalysisPayload(
      threshold ? Number(threshold) : 10,
      layer || "Reachability"
    );
    return reply.status(200).send(result);
  });
}

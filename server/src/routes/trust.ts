import { FastifyInstance } from "fastify";
import { TrustService } from "../services/trustService.js";
import { EvidenceService } from "../services/evidenceService.js";

export async function trustRoutes(app: FastifyInstance) {
  app.get("/data-sources", {
    schema: {
      tags: ["M3 Data Trust"],
      description: "List registered transit data sources with completeness and license information",
      querystring: {
        type: "object",
        properties: {
          mode: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { mode } = req.query as { mode?: string };
    const sources = await TrustService.getDataSources(mode);
    return reply.status(200).send({ sources });
  });

  app.get("/feeds", {
    schema: {
      tags: ["M3 Data Trust"],
      description: "List feed versions and import history",
    },
  }, async (_req, reply) => {
    const versions = await TrustService.getFeedVersions();
    return reply.status(200).send({ versions });
  });

  app.get("/feeds/:id/findings", {
    schema: {
      tags: ["M3 Data Trust"],
      description: "Get validation findings for a feed version",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const findings = await TrustService.getFindings(id);
    return reply.status(200).send({ findings });
  });

  app.get("/evidence/summary", {
    schema: {
      tags: ["M3 Data Trust"],
      description: "Evidence band distribution and quality metrics",
      querystring: {
        type: "object",
        properties: {
          version: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { version } = req.query as { version?: string };
    const dashboard = await TrustService.getTrustDashboard(version || "v2026.10-demo");
    return reply.status(200).send(dashboard);
  });
}

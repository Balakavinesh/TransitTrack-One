import { FastifyInstance } from "fastify";
import { ExportService } from "../services/exportService.js";

export async function exportRoutes(app: FastifyInstance) {
  app.get("/exports/eligible-corrections", {
    schema: {
      tags: ["M8 Open Data Bridge"],
      description: "List verified and corroborated community reports eligible for open data correction export",
    },
  }, async (_req, reply) => {
    const eligible = await ExportService.getEligibleCorrections();
    return reply.status(200).send({ eligible });
  });

  app.post("/exports/generate", {
    schema: {
      tags: ["M8 Open Data Bridge"],
      description: "Build validated structured correction payload (JSON, CSV, Issue draft, OSM note)",
      body: {
        type: "object",
        required: ["reportId"],
        properties: {
          reportId: { type: "string" },
          format: { type: "string", enum: ["JSON", "CSV"] },
          preview: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { reportId, format, preview } = req.body as any;
    const result = await ExportService.buildCorrectionExport(reportId, format || "JSON", preview || "Structured change");
    return reply.status(200).send(result);
  });

  app.get("/exports/:id/download", {
    schema: {
      tags: ["M8 Open Data Bridge"],
      description: "Download generated correction export file",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      querystring: {
        type: "object",
        properties: {
          format: { type: "string" },
          preview: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { format, preview } = req.query as { format?: "JSON" | "CSV"; preview?: string };

    const result = await ExportService.buildCorrectionExport(id, format || "JSON", preview || "Structured change");
    if (!result.isValid) {
      return reply.status(404).send({ error: "NotFound", message: "Export not found." });
    }

    return reply
      .header("Content-Type", result.mimeType)
      .header("Content-Disposition", `attachment; filename="${result.filename}"`)
      .send(result.content);
  });
}

import { FastifyInstance } from "fastify";
import { ResilienceService } from "../services/resilienceService.js";

export async function resilienceRoutes(app: FastifyInstance) {
  app.get("/resilience/scenarios", {
    schema: {
      tags: ["M6 Resilience Lab"],
      description: "List network resilience scenarios (station, transfer and edge closures)",
    },
  }, async (_req, reply) => {
    const scenarios = await ResilienceService.getScenarios();
    return reply.status(200).send({ scenarios });
  });

  app.post("/resilience/scenarios/:id/run", {
    schema: {
      tags: ["M6 Resilience Lab"],
      description: "Execute graph simulation for baseline or disrupted network",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      body: {
        type: "object",
        required: ["isClosed"],
        properties: {
          isClosed: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { isClosed } = req.body as { isClosed: boolean };

    try {
      const result = await ResilienceService.runScenario(id, isClosed);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: "NotFound", message: err.message });
    }
  });
}

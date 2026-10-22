import { FastifyInstance } from "fastify";
import { JourneyService } from "../services/journeyService.js";

export async function journeyRoutes(app: FastifyInstance) {
  app.post("/journeys/plan", {
    schema: {
      tags: ["M1 Journey Planning"],
      description: "Plan evidence-aware multi-criteria multimodal journeys",
      body: {
        type: "object",
        required: ["origin", "destination"],
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          time: { type: "string" },
          timing: { type: "string", enum: ["Depart at", "Arrive by"] },
          date: { type: "string" },
          modes: { type: "array", items: { type: "string" } },
          transfers: { type: "number" },
          walking: { type: "number" },
          profile: { type: "string" },
          disruptedElements: { type: "array", items: { type: "string" } },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as any;
    const result = await JourneyService.planJourney({
      origin: body.origin,
      destination: body.destination,
      time: body.time,
      timing: body.timing,
      date: body.date,
      modes: body.modes,
      transfers: body.transfers,
      walking: body.walking,
      profile: body.profile,
      disruptedElements: body.disruptedElements,
    });

    return reply.status(200).send(result);
  });

  app.get("/journeys/plan", {
    schema: {
      tags: ["M1 Journey Planning"],
      description: "Plan evidence-aware multi-criteria multimodal journeys via query parameters",
      querystring: {
        type: "object",
        required: ["origin", "destination"],
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          time: { type: "string" },
          timing: { type: "string", enum: ["Depart at", "Arrive by"] },
          date: { type: "string" },
          profile: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const q = req.query as any;
    const result = await JourneyService.planJourney({
      origin: q.origin,
      destination: q.destination,
      time: q.time,
      timing: q.timing,
      date: q.date,
      profile: q.profile,
    });

    return reply.status(200).send(result);
  });

  app.get("/journeys/:id", {
    schema: {
      tags: ["M1 Journey Planning"],
      description: "Get detailed journey by ID",
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
    const journey = await JourneyService.getJourneyById(id);
    if (!journey) {
      return reply.status(404).send({ error: "NotFound", message: `Journey '${id}' not found.` });
    }
    return reply.status(200).send({ journey });
  });
}

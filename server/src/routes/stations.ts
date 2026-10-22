import { FastifyInstance } from "fastify";
import { StationService } from "../services/stationService.js";
import { JourneyService } from "../services/journeyService.js";

export async function stationRoutes(app: FastifyInstance) {
  app.get("/stations", {
    schema: {
      tags: ["M2 Stations & Accessibility"],
      description: "List transit stations with mode and accessibility filters",
      querystring: {
        type: "object",
        properties: {
          mode: { type: "string" },
          verifiedLift: { type: "boolean" },
          q: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { mode, verifiedLift, q } = req.query as any;
    if (q) {
      const results = await JourneyService.searchStations(q, mode);
      return reply.status(200).send({ stations: results });
    }
    const results = await StationService.getStations(mode, verifiedLift === "true" || verifiedLift === true);
    return reply.status(200).send({ stations: results });
  });

  app.get("/stations/search", {
    schema: {
      tags: ["M2 Stations & Accessibility"],
      description: "Search stations by name, area or code",
      querystring: {
        type: "object",
        required: ["q"],
        properties: {
          q: { type: "string" },
          mode: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { q, mode } = req.query as { q: string; mode?: string };
    const results = await JourneyService.searchStations(q, mode);
    return reply.status(200).send({ stations: results });
  });

  app.get("/stations/:id", {
    schema: {
      tags: ["M2 Stations & Accessibility"],
      description: "Get detailed station accessibility, facility audit, and pathways",
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
    const station = await StationService.getStationDetail(id);
    if (!station) {
      return reply.status(404).send({ error: "NotFound", message: `Station '${id}' not found.` });
    }
    return reply.status(200).send({ station });
  });
}

export async function locationRoutes(app: FastifyInstance) {
  app.get("/locations/search", {
    schema: {
      tags: ["M1 Journey Planning"],
      description: "Search locations and autocomplete stations",
      querystring: {
        type: "object",
        required: ["q"],
        properties: {
          q: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { q } = req.query as { q: string };
    const stations = await JourneyService.searchStations(q);
    const locations = stations.map(s => ({
      name: s.name,
      area: s.area,
      mode: s.mode,
      coordinates: s.position,
    }));
    return reply.status(200).send({ locations });
  });
}

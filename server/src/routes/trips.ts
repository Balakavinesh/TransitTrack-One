import { FastifyInstance } from "fastify";
import { TripService } from "../services/tripService.js";
import { AuthService } from "../services/authService.js";

export async function tripRoutes(app: FastifyInstance) {
  app.get("/trips", {
    schema: {
      tags: ["M5 Trip Companion"],
      description: "Get saved journeys for the current commuter or session",
      querystring: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId } = req.query as { sessionId?: string };
    let userId: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) userId = decoded.sub;
    }

    const trips = await TripService.getSavedTrips(userId, sessionId || "default-session");
    return reply.status(200).send({ trips });
  });

  app.post("/trips", {
    schema: {
      tags: ["M5 Trip Companion"],
      description: "Persist a journey to saved trips",
      body: {
        type: "object",
        required: ["journey"],
        properties: {
          journey: { type: "object" },
          label: { type: "string" },
          sessionId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as any;
    let userId: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) userId = decoded.sub;
    }

    const res = await TripService.saveTrip(body.journey, userId, body.sessionId, body.label);
    return reply.status(201).send(res);
  });

  app.delete("/trips/:id", {
    schema: {
      tags: ["M5 Trip Companion"],
      description: "Remove a saved trip",
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
    const success = await TripService.deleteTrip(id);
    return reply.status(200).send({ success });
  });

  app.post("/trips/recover", {
    schema: {
      tags: ["M5 Trip Companion"],
      description: "Recalculate journey recovery alternatives upon encountering a disruption or blocked leg",
      body: {
        type: "object",
        required: ["journey", "blockedStation"],
        properties: {
          journey: { type: "object" },
          blockedLegIndex: { type: "number" },
          blockedStation: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as any;
    const result = await TripService.recoverTrip(
      body.journey,
      body.blockedLegIndex ?? 0,
      body.blockedStation,
      body.reason
    );
    return reply.status(200).send(result);
  });
}

import { FastifyInstance } from "fastify";
import { ReportService } from "../services/reportService.js";
import { AuthService } from "../services/authService.js";

export async function reportRoutes(app: FastifyInstance) {
  app.get("/reports", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "List community observations and problem reports",
      querystring: {
        type: "object",
        properties: {
          status: { type: "string" },
          station: { type: "string" },
          category: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" },
        },
      },
    },
  }, async (req, reply) => {
    const filters = req.query as any;
    const reports = await ReportService.getReports(filters);
    return reply.status(200).send({ reports });
  });

  app.get("/reports/:id", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "Get report details, corroboration status and decision history",
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
    const report = await ReportService.getReportById(id);
    if (!report) {
      return reply.status(404).send({ error: "NotFound", message: `Report '${id}' not found.` });
    }
    return reply.status(200).send({ report });
  });

  app.post("/reports", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "Submit a new community observation or infrastructure report",
      body: {
        type: "object",
        required: ["category", "station", "description"],
        properties: {
          category: { type: "string" },
          station: { type: "string" },
          description: { type: "string", minLength: 15 },
          date: { type: "string" },
          location: { type: "array", items: { type: "number" } },
          imageUrl: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as any;
    let userId: string | undefined;

    // Optional user authentication
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) userId = decoded.sub;
    }

    try {
      const report = await ReportService.createReport({
        category: body.category,
        station: body.station,
        description: body.description,
        date: body.date,
        location: body.location,
        imageUrl: body.imageUrl,
        userId,
      });
      return reply.status(201).send({ report });
    } catch (err: any) {
      return reply.status(400).send({ error: "BadRequest", message: err.message });
    }
  });

  app.post("/reports/:id/confirm", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "Corroborate an observation (with duplicate confirmation protection)",
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
    let userId = "anonymous-commuter";

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) userId = decoded.sub;
    }

    try {
      const res = await ReportService.confirmReport(id, userId, req.ip);
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: "BadRequest", message: err.message });
    }
  });

  app.post("/reports/:id/verify", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "Verify report and propagate evidence to the network and station facilities",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      body: {
        type: "object",
        properties: {
          rationale: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as any) || {};

    let decidedBy = "community-moderator";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) decidedBy = decoded.fullName || decoded.email;
    }

    try {
      const res = await ReportService.verifyReport(id, decidedBy, body.rationale);
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: "BadRequest", message: err.message });
    }
  });

  app.post("/reports/:id/reject", {
    schema: {
      tags: ["M4 Community Reports"],
      description: "Reject an unsupported or inaccurate report",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      body: {
        type: "object",
        properties: {
          rationale: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as any) || {};

    let decidedBy = "community-moderator";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const decoded = AuthService.verifyToken(authHeader.slice(7));
      if (decoded) decidedBy = decoded.fullName || decoded.email;
    }

    try {
      const res = await ReportService.rejectReport(id, decidedBy, body.rationale);
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: "BadRequest", message: err.message });
    }
  });
}

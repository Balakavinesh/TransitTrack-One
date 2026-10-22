import { FastifyInstance } from "fastify";
import { AuthService } from "../services/authService.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", {
    schema: {
      tags: ["Authentication"],
      description: "Register a new TransitTrack commuter or contributor account",
      body: {
        type: "object",
        required: ["email", "password", "fullName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          fullName: { type: "string", minLength: 2 },
          role: { type: "string", enum: ["user", "contributor"] },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password, fullName, role } = req.body as any;
    try {
      const result = await AuthService.register(email, password, fullName, role || "user");
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: "BadRequest", message: err.message });
    }
  });

  app.post("/auth/login", {
    schema: {
      tags: ["Authentication"],
      description: "Sign in with email and password",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body as any;
    try {
      const result = await AuthService.login(email, password);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(401).send({ error: "Unauthorized", message: err.message });
    }
  });

  app.get("/auth/me", {
    schema: {
      tags: ["Authentication"],
      description: "Get authenticated user profile from token",
    },
  }, async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Unauthorized", message: "Bearer token required" });
    }

    const token = authHeader.slice(7);
    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
      return reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
    }

    const user = await AuthService.getUserById(decoded.sub);
    if (!user) {
      return reply.status(404).send({ error: "NotFound", message: "User not found" });
    }

    return reply.status(200).send({ user });
  });
}

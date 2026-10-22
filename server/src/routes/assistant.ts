import { FastifyInstance } from "fastify";
import { AssistantService } from "../services/assistantService.js";

export async function assistantRoutes(app: FastifyInstance) {
  app.post("/assistant/chat", {
    schema: {
      tags: ["M9 Assistant"],
      description: "Ask mobility, accessibility and evidence questions in Tamil or English",
      body: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", minLength: 1, maxLength: 500 },
          language: { type: "string", enum: ["en", "ta"] },
          sessionId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { message, language, sessionId } = req.body as any;
    try {
      const response = await AssistantService.answer(message, language || "en", sessionId);
      return reply.status(200).send(response);
    } catch (err: any) {
      return reply.status(500).send({ error: "AssistantError", message: err.message });
    }
  });
}

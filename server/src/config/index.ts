import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  apiPrefix: "/api/v1",
  databaseUrl: process.env.DATABASE_URL || "",
  // If no DATABASE_URL is provided, we use in-process PGlite database persisted at server/data/transittrack.db
  dbDataDir: process.env.DB_DATA_DIR || path.resolve(process.cwd(), "data", "transittrack.db"),
  jwtSecret: process.env.JWT_SECRET || "transittrack-one-dev-secret-key-32chars-min!",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173").split(","),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "gemini-2.5-flash",
};

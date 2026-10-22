import { z } from 'zod';

export const HealthCheckSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative(),
  /** Short public reason when down (e.g. "timeout"); never a raw driver error. */
  reason: z.string().optional(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

/**
 * `ok`: every check up. `degraded`: API serving with reduced capability (used once
 * the router snapshot exists, SPEC §5). `down`: a critical dependency is unavailable.
 */
export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/** Router snapshot of the active feed version (SPEC §5: missing → degraded, journeys 503). */
export const RouterCheckSchema = z.object({
  status: z.enum(['ready', 'missing', 'no_active_version', 'unknown']),
  feedVersionId: z.number().int().optional(),
  builtAt: z.string().datetime().optional(),
  ageSec: z.number().nonnegative().optional(),
  plannable: z.object({ first: z.string(), last: z.string() }).optional(),
});
export type RouterCheck = z.infer<typeof RouterCheckSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.literal('transittrack-api'),
  version: z.string(),
  uptimeSec: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: HealthCheckSchema,
    router: RouterCheckSchema.optional(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

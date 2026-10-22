import { z } from 'zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** RFC 9457 problem details, extended with the request ID used in our logs. */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string(),
  requestId: z.string(),
  /** Field-level validation errors (400 responses only). */
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** Extension member of a 409: the existing resource the request duplicates. */
  existingId: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

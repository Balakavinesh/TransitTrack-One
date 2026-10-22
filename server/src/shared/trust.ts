import { z } from 'zod';

/**
 * Schedule trust labels, per SPEC §3.1. Every journey leg carries exactly one.
 * How labels are assigned (feed age thresholds, calendar coverage, projection) is
 * implemented in the router; this module only defines the vocabulary.
 */
export const TRUST_LABELS = ['current', 'aging', 'stale', 'projected', 'unknown'] as const;

export const TrustLabelSchema = z.enum(TRUST_LABELS);
export type TrustLabel = z.infer<typeof TrustLabelSchema>;

/**
 * Severity of each label, least to most severe: the router's journey label is the worst
 * transit leg in this order (pre-Phase 6 decision, 2026-10-20). `projected` is the most severe
 * because the published timetable does not apply to the date at all. Single source for the
 * router and the web app.
 */
export const TRUST_LABEL_SEVERITY: Readonly<Record<TrustLabel, number>> = {
  current: 0,
  aging: 1,
  stale: 2,
  unknown: 3,
  projected: 4,
};

/** Geometry quality of a leg's drawn shape (SPEC §3.1 ingredient checks). */
export const GEOMETRY_QUALITIES = ['track', 'straight-line', 'none'] as const;
export const GeometryQualitySchema = z.enum(GEOMETRY_QUALITIES);
export type GeometryQuality = z.infer<typeof GeometryQualitySchema>;

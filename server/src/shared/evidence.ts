import { z } from 'zod';

/**
 * Shared Mobility Evidence Graph — Bands of evidence quality.
 *
 * Verified: confirmed by direct official audit or corroborated by trusted field verification.
 * Likely: derived from recent valid feed data without conflicting reports.
 * Uncertain: aging/stale schedules, unverified inferences, or conflicting reports.
 * Unknown: missing data. By principle, unknown must NEVER be treated as accessible or inaccessible by default.
 */
export const EVIDENCE_BANDS = ['verified', 'likely', 'uncertain', 'unknown'] as const;
export const EvidenceBandSchema = z.enum(EVIDENCE_BANDS);
export type EvidenceBand = z.infer<typeof EvidenceBandSchema>;

export const SOURCE_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4'] as const;
export const SourceTierSchema = z.enum(SOURCE_TIERS);
export type SourceTier = z.infer<typeof SourceTierSchema>;

export const ENTITY_TYPES = [
  'stop',
  'station',
  'entrance',
  'pathway',
  'transfer',
  'trip',
  'route',
  'facility',
] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Freshness decay half-life in days per entity kind.
 * Station coordinates change rarely (half-life ~365 days);
 * timetables change seasonally (half-life ~60 days);
 * facility operational state (lifts, ramps) changes quickly (half-life ~7 days);
 * temporary conditions (waterlogging, blockage) expire in hours (half-life ~0.25 days = 6h).
 */
export const FRESHNESS_POLICIES = {
  station_location: { halfLifeDays: 365, maxAgeDays: 730 },
  timetable_schedule: { halfLifeDays: 60, maxAgeDays: 180 },
  pathway_infrastructure: { halfLifeDays: 180, maxAgeDays: 365 },
  facility_operational: { halfLifeDays: 7, maxAgeDays: 30 },
  temporary_condition: { halfLifeDays: 0.25, maxAgeDays: 2 },
} as const;

export type FreshnessPolicyKey = keyof typeof FRESHNESS_POLICIES;

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  entityType: EntityTypeSchema,
  entityId: z.string(),
  sourceTier: SourceTierSchema,
  sourceId: z.string(),
  sourceName: z.string(),
  observedAt: z.string(), // ISO timestamp
  lastVerifiedAt: z.string().nullable(),
  freshnessPolicy: z.string(),
  freshnessScore: z.number().min(0).max(1), // 1.0 (fresh) -> 0.0 (decayed)
  completenessScore: z.number().min(0).max(1),
  consistencyScore: z.number().min(0).max(1),
  verificationStatus: z.enum(['pending', 'corroborated', 'verified', 'rejected', 'stale']),
  evidenceBand: EvidenceBandSchema,
  supportingReportIds: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

/**
 * Access Profiles for M2
 */
export const ACCESS_PROFILES = [
  'standard',
  'wheelchair',
  'minimal_walking',
  'elderly',
  'prams_luggage',
  'low_vision',
] as const;

export const AccessProfileSchema = z.enum(ACCESS_PROFILES);
export type AccessProfile = z.infer<typeof AccessProfileSchema>;

export interface AccessProfileConstraints {
  id: AccessProfile;
  label: string;
  description: string;
  stepFreeRequired: boolean;
  maxWalkingDistanceM: number;
  maxStairRounds: number;
  preferElevators: boolean;
  preferRamps: boolean;
  requiresTactilePaving: boolean;
}

export const PROFILE_CONSTRAINTS: Record<AccessProfile, AccessProfileConstraints> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'No specific mobility restrictions.',
    stepFreeRequired: false,
    maxWalkingDistanceM: 1000,
    maxStairRounds: 99,
    preferElevators: false,
    preferRamps: false,
    requiresTactilePaving: false,
  },
  wheelchair: {
    id: 'wheelchair',
    label: 'Wheelchair user',
    description: 'Confirmed step-free paths only (ramps or functioning lifts; no stairs).',
    stepFreeRequired: true,
    maxWalkingDistanceM: 800,
    maxStairRounds: 0,
    preferElevators: true,
    preferRamps: true,
    requiresTactilePaving: false,
  },
  minimal_walking: {
    id: 'minimal_walking',
    label: 'Minimal walking',
    description: 'Limits walking distance to ≤ 400m and prioritizes minimal transfers.',
    stepFreeRequired: false,
    maxWalkingDistanceM: 400,
    maxStairRounds: 99,
    preferElevators: true,
    preferRamps: false,
    requiresTactilePaving: false,
  },
  elderly: {
    id: 'elderly',
    label: 'Elderly passenger',
    description: 'Avoids steep stairs, minimizes walking, and prefers lifts/ramps.',
    stepFreeRequired: false,
    maxWalkingDistanceM: 500,
    maxStairRounds: 1,
    preferElevators: true,
    preferRamps: true,
    requiresTactilePaving: false,
  },
  prams_luggage: {
    id: 'prams_luggage',
    label: 'Prams or heavy luggage',
    description: 'Prefers step-free or ramped access; avoids long flights of stairs.',
    stepFreeRequired: false,
    maxWalkingDistanceM: 700,
    maxStairRounds: 1,
    preferElevators: true,
    preferRamps: true,
    requiresTactilePaving: false,
  },
  low_vision: {
    id: 'low_vision',
    label: 'Low vision',
    description: 'Prefers stations with verified tactile paving, direct transfers, and clear wayfinding.',
    stepFreeRequired: false,
    maxWalkingDistanceM: 600,
    maxStairRounds: 2,
    preferElevators: false,
    preferRamps: true,
    requiresTactilePaving: true,
  },
};

/** Station accessibility feature representation */
export interface StationAccessibility {
  stopId: string;
  stationName: string;
  hasElevator: boolean | null;
  hasRamp: boolean | null;
  hasTactilePaving: boolean | null;
  hasAccessibleToilet: boolean | null;
  stepFreeAccessBand: EvidenceBand;
  pathwayCount: number;
  entranceCount: number;
  knownLimitations: string[];
  evidenceRecord: EvidenceRecord;
}

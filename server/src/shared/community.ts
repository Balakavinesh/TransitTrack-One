/** Community disruption reports (SPEC F7). Shared by the API, the worker and the web app. */
export const DISRUPTION_CATEGORIES = [
  'stop_unavailable',
  'route_diversion',
  'service_not_observed',
  'station_access_issue',
  'waterlogging',
  'other',
  // TransitTrack One extended categories (M4):
  'moved_stop',
  'missing_stop',
  'incorrect_route',
  'broken_lift',
  'broken_ramp',
  'blocked_footpath',
  'flooded_underpass',
  'missing_sign',
  'poorly_lit_approach',
  'general_accessibility',
] as const;
export type DisruptionCategory = (typeof DISRUPTION_CATEGORIES)[number];

export const DISRUPTION_STATUSES = [
  'unverified',
  'pending',
  'corroborated',
  'under_review',
  'verified',
  'rejected',
  'stale',
  'expired',
] as const;
export type DisruptionStatus = (typeof DISRUPTION_STATUSES)[number];

/** Statuses that are still in force (until `expires_at`). */
export const ACTIVE_DISRUPTION_STATUSES = [
  'unverified',
  'pending',
  'corroborated',
  'under_review',
  'verified',
] as const;

/** Default lifetime from the observation time (SPEC F7): waterlogging 6 h, others 24 h. */
export const DISRUPTION_DEFAULT_EXPIRY_HOURS: Record<DisruptionCategory, number> = {
  stop_unavailable: 24,
  route_diversion: 24,
  service_not_observed: 24,
  station_access_issue: 24,
  waterlogging: 6,
  other: 24,
  moved_stop: 168,
  missing_stop: 168,
  incorrect_route: 72,
  broken_lift: 72,
  broken_ramp: 72,
  blocked_footpath: 24,
  flooded_underpass: 6,
  missing_sign: 168,
  poorly_lit_approach: 168,
  general_accessibility: 72,
};

/** A moderator may extend a report to at most this long after now. */
export const DISRUPTION_MAX_EXPIRY_HOURS = 7 * 24;
/** An observation may be at most this old when reported, and at most this far in the future. */
export const DISRUPTION_MAX_OBSERVATION_AGE_HOURS = 24;
export const DISRUPTION_CLOCK_SKEW_MIN = 5;
export const DISRUPTION_DESCRIPTION_MAX = 500;

/** Moderation actions and the statuses they lead to. */
export const MODERATION_ACTIONS = {
  review: 'under_review',
  verify: 'verified',
  reject: 'rejected',
  expire: 'expired',
} as const satisfies Record<string, DisruptionStatus>;
export type ModerationAction = keyof typeof MODERATION_ACTIONS;

/** Allowed status transitions (SPEC F7: unverified → under_review → verified | rejected; expired). */
export const DISRUPTION_TRANSITIONS: Record<DisruptionStatus, readonly DisruptionStatus[]> = {
  unverified: ['pending', 'corroborated', 'under_review', 'verified', 'rejected', 'expired'],
  pending: ['corroborated', 'under_review', 'verified', 'rejected', 'expired'],
  corroborated: ['under_review', 'verified', 'rejected', 'expired'],
  under_review: ['verified', 'rejected', 'expired'],
  verified: ['stale', 'expired'],
  rejected: [],
  stale: ['expired'],
  expired: [],
};

/** Shown with every community report: they are never operator alerts. */
export const COMMUNITY_REPORT_NOTICE =
  'Community report from a TransitTrack user. Not an official operator alert; it does not change the published timetable.';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 1024;

export const SAVED_PLACES_MAX = 20;
export const SAVED_JOURNEYS_MAX = 20;
export const SEARCH_HISTORY_MAX = 50;
export const SUBSCRIPTIONS_MAX = 50;

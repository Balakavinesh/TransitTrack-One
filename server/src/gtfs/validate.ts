import { parseIsoDate } from './date.js';
import { FindingCollector, type Finding, type ValidationStatus } from './findings.js';
import { loadFeed } from './load.js';
import type { GtfsFeed } from './model.js';
import { checkCalendars } from './rules/calendar-rules.js';
import type { RuleInput, ValidationContext } from './rules/context.js';
import {
  checkDuplicateStops,
  checkPlaceholderTimes,
  checkShapes,
  checkText,
  checkUnusedStops,
} from './rules/quality.js';
import {
  checkCoordinates,
  checkDuplicates,
  checkAgencyIds,
  checkFieldValues,
  checkReferences,
  checkTripTimes,
} from './rules/structure.js';
import { openFeedSource } from './source.js';
import { buildTripIndex, type TripIndex } from './trip-index.js';
import { DEFAULT_ZIP_LIMITS, type ZipInspection, type ZipLimits } from './zip.js';

/** Runs every post-load rule on an already-loaded feed. Returns the trip index it built. */
export function validateFeed(
  feed: GtfsFeed,
  ctx: ValidationContext,
  findings: FindingCollector,
): TripIndex | null {
  const importDay = parseIsoDate(ctx.importDate);
  if (importDay === null) throw new Error(`importDate "${ctx.importDate}" is not YYYY-MM-DD`);

  const tripIndex = feed.stopTimes ? buildTripIndex(feed.stopTimes) : null;
  const input: RuleInput = { feed, ctx, importDay, tripIndex, findings };

  checkFieldValues(input);
  checkAgencyIds(input);
  checkCoordinates(input);
  checkDuplicates(input);
  checkReferences(input);
  checkTripTimes(input);
  checkCalendars(input);
  checkPlaceholderTimes(input);
  checkShapes(input);
  checkUnusedStops(input);
  checkDuplicateStops(input);
  checkText(input);
  return tripIndex;
}

export interface ValidationResult {
  status: ValidationStatus;
  findings: Finding[];
  /** Null if the source could not be opened (e.g. unsafe zip). */
  feed: GtfsFeed | null;
  tripIndex: TripIndex | null;
  zip?: ZipInspection;
}

/** Opens a zip or directory, loads it, and runs every rule. */
export async function validateGtfs(
  path: string,
  ctx: ValidationContext,
  options: { zipLimits?: ZipLimits; maxSamples?: number } = {},
): Promise<ValidationResult> {
  const findings = new FindingCollector(options.maxSamples);
  const opened = await openFeedSource(path, options.zipLimits ?? DEFAULT_ZIP_LIMITS);

  if (!opened.source) {
    for (const violation of opened.zip?.violations ?? []) {
      findings.add('E_ZIP_UNSAFE', { message: violation });
    }
    return {
      status: findings.status(),
      findings: findings.list(),
      feed: null,
      tripIndex: null,
      ...(opened.zip && { zip: opened.zip }),
    };
  }

  try {
    const feed = await loadFeed(opened.source, findings);
    const tripIndex = validateFeed(feed, ctx, findings);
    return {
      status: findings.status(),
      findings: findings.list(),
      feed,
      tripIndex,
      ...(opened.zip && { zip: opened.zip }),
    };
  } finally {
    opened.source.close();
  }
}

import { buildServiceCalendars, serviceDateRange } from '../calendar.js';
import { formatIsoDate, parseIsoDate } from '../date.js';
import type { RuleInput } from './context.js';

/** W_STALE_CALENDAR, W_CALENDAR_FAR_FUTURE and W_FEED_AGE. */
export function checkCalendars(input: RuleInput): void {
  const { feed, ctx, importDay, findings } = input;
  const farFutureLimit = importDay + Math.round(ctx.farFutureYears * 365.25);

  for (const service of buildServiceCalendars(feed).values()) {
    const range = serviceDateRange(service);
    if (!range) continue;
    if (range.last < importDay) {
      findings.add('W_STALE_CALENDAR', {
        file: service.weekly ? 'calendar.txt' : 'calendar_dates.txt',
        message: `service "${service.serviceId}" last runs on ${formatIsoDate(range.last)}, before ${ctx.importDate}`,
      });
    }
    if (range.last > farFutureLimit) {
      findings.add('W_CALENDAR_FAR_FUTURE', {
        file: service.weekly ? 'calendar.txt' : 'calendar_dates.txt',
        message: `service "${service.serviceId}" runs until ${formatIsoDate(range.last)}, more than ${ctx.farFutureYears} years after ${ctx.importDate}`,
      });
    }
  }

  if (ctx.feedUpdatedAt === undefined) return;
  const updated = parseIsoDate(ctx.feedUpdatedAt);
  if (updated === null) return;
  const age = importDay - updated;
  if (age > ctx.trust.currentMaxAgeDays) {
    const band = age > ctx.trust.agingMaxAgeDays ? 'stale' : 'aging';
    findings.add('W_FEED_AGE', {
      message: `feed last updated ${ctx.feedUpdatedAt}: ${age} days before ${ctx.importDate} (${band}; current ≤ ${ctx.trust.currentMaxAgeDays} d, aging ≤ ${ctx.trust.agingMaxAgeDays} d)`,
    });
  }
}

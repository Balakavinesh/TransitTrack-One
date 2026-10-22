import {
  WEEKDAY_COLUMNS,
  dayOfWeek,
  formatIsoDate,
  parseGtfsDate,
  type DayNumber,
} from './date.js';
import { records, type GtfsFeed } from './model.js';

export interface ServiceCalendar {
  serviceId: string;
  /** From calendar.txt; absent for calendar_dates-only services. */
  weekly?: { days: boolean[]; start: DayNumber; end: DayNumber };
  added: Set<DayNumber>;
  removed: Set<DayNumber>;
}

/** Builds per-service calendars, skipping rows whose dates do not parse (rules report those). */
export function buildServiceCalendars(feed: GtfsFeed): Map<string, ServiceCalendar> {
  const services = new Map<string, ServiceCalendar>();
  const get = (serviceId: string): ServiceCalendar => {
    let s = services.get(serviceId);
    if (!s) {
      s = { serviceId, added: new Set(), removed: new Set() };
      services.set(serviceId, s);
    }
    return s;
  };

  for (const { v } of records(feed, 'calendar.txt')) {
    const start = parseGtfsDate(v['start_date'] ?? '');
    const end = parseGtfsDate(v['end_date'] ?? '');
    const serviceId = v['service_id'] ?? '';
    if (start === null || end === null) {
      get(serviceId);
      continue;
    }
    const days = WEEKDAY_COLUMNS.map((d) => v[d] === '1');
    get(serviceId).weekly = { days, start, end };
  }

  for (const { v } of records(feed, 'calendar_dates.txt')) {
    const day = parseGtfsDate(v['date'] ?? '');
    if (day === null) continue;
    const s = get(v['service_id'] ?? '');
    if (v['exception_type'] === '1') s.added.add(day);
    else if (v['exception_type'] === '2') s.removed.add(day);
  }
  return services;
}

export function isServiceActive(service: ServiceCalendar, day: DayNumber): boolean {
  if (service.removed.has(day)) return false;
  if (service.added.has(day)) return true;
  const weekly = service.weekly;
  if (!weekly || day < weekly.start || day > weekly.end) return false;
  return weekly.days[dayOfWeek(day)] === true;
}

export function activeServicesOn(services: Map<string, ServiceCalendar>, day: DayNumber): string[] {
  return [...services.values()].filter((s) => isServiceActive(s, day)).map((s) => s.serviceId);
}

/** First and last date on which the service can run (weekly range ∪ added dates). */
export function serviceDateRange(
  service: ServiceCalendar,
): { first: DayNumber; last: DayNumber } | null {
  const candidates = [...service.added];
  if (
    service.weekly &&
    service.weekly.days.some(Boolean) &&
    service.weekly.start <= service.weekly.end
  ) {
    candidates.push(service.weekly.start, service.weekly.end);
  }
  if (candidates.length === 0) return null;
  return { first: Math.min(...candidates), last: Math.max(...candidates) };
}

export type DayType = 'weekday' | 'saturday' | 'sunday';

/** SPEC §3.2 day types: Monday–Friday are one type; Saturday and Sunday are their own. */
export function dayTypeOf(day: DayNumber): DayType {
  const dow = dayOfWeek(day);
  if (dow === 5) return 'saturday';
  if (dow === 6) return 'sunday';
  return 'weekday';
}

/** Union of all services' date ranges, or null if no service can ever run. */
export function feedDateRange(
  services: Map<string, ServiceCalendar>,
): { first: DayNumber; last: DayNumber } | null {
  let first = Infinity;
  let last = -Infinity;
  for (const service of services.values()) {
    const range = serviceDateRange(service);
    if (!range) continue;
    first = Math.min(first, range.first);
    last = Math.max(last, range.last);
  }
  return Number.isFinite(first) ? { first, last } : null;
}

/**
 * SPEC §3.2 projection reference: the most recent date inside the feed's validity range with
 * the same day type as `day` on which at least one service runs. Returns null when the date
 * is already covered (no projection needed) or when no such reference date exists.
 */
export function projectionReferenceDate(
  services: Map<string, ServiceCalendar>,
  day: DayNumber,
): DayNumber | null {
  if (activeServicesOn(services, day).length > 0) return null;
  const range = feedDateRange(services);
  if (!range) return null;
  const type = dayTypeOf(day);
  for (let d = Math.min(day, range.last); d >= range.first; d--) {
    if (dayTypeOf(d) === type && activeServicesOn(services, d).length > 0) return d;
  }
  return null;
}

const DAY_TYPE_NAMES: Record<DayType, string> = {
  weekday: 'weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/** SPEC §3.2 label for every leg or departure that uses a projected pattern. */
export function projectionMessage(reference: DayNumber): string {
  return `Projected from the timetable valid until ${formatIsoDate(reference)}`;
}

export type ServiceDateStatus =
  | { kind: 'covered'; services: string[] }
  | { kind: 'projected'; from: DayNumber; services: string[]; message: string }
  | {
      kind: 'unavailable';
      reason: 'no_verified_schedule_for_day_type' | 'projection_disabled' | 'no_service';
      dayType: DayType;
      message: string;
    };

/**
 * What the timetable can honestly say about one service date (SPEC §3.2, maintainer decision
 * of 2026-10-19): either the calendar covers it, or it is projected from the most recent
 * in-range date of the SAME day type, or it is unavailable. Weekday service is never
 * projected onto a Sunday.
 */
export function serviceDateStatus(
  services: Map<string, ServiceCalendar>,
  day: DayNumber,
  options: { allowProjection: boolean },
): ServiceDateStatus {
  const active = activeServicesOn(services, day);
  if (active.length > 0) return { kind: 'covered', services: active };

  const dayType = dayTypeOf(day);
  const range = feedDateRange(services);
  if (range && day >= range.first && day <= range.last) {
    return {
      kind: 'unavailable',
      reason: 'no_service',
      dayType,
      message: 'No scheduled service on this date',
    };
  }
  if (!options.allowProjection) {
    return {
      kind: 'unavailable',
      reason: 'projection_disabled',
      dayType,
      message: 'Only schedules valid for this date are shown, and none are',
    };
  }
  const ref = projectionReferenceDate(services, day);
  if (ref === null) {
    return {
      kind: 'unavailable',
      reason: 'no_verified_schedule_for_day_type',
      dayType,
      message: `No verified ${DAY_TYPE_NAMES[dayType]} schedule available`,
    };
  }
  return {
    kind: 'projected',
    from: ref,
    services: activeServicesOn(services, ref),
    message: projectionMessage(ref),
  };
}

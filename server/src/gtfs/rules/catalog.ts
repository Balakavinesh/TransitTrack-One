export type Severity = 'error' | 'warning';

export interface RuleInfo {
  /** `error` blocks activation of a feed version; `warning` is shown but does not block. */
  severity: Severity;
  title: string;
  description: string;
}

/** Every validation rule. Codes are stable: they are stored with findings and shown in the UI. */
export const RULES = {
  // ---- Blocking ----------------------------------------------------------------------------
  E_ZIP_UNSAFE: {
    severity: 'error',
    title: 'Zip archive failed safety checks',
    description:
      'Archive exceeds size, entry-count or compression-ratio limits, or contains an unsafe path (absolute, drive letter, "..").',
  },
  E_MISSING_FILE: {
    severity: 'error',
    title: 'Required file missing',
    description:
      'agency, stops, routes, trips and stop_times are required, plus calendar.txt or calendar_dates.txt.',
  },
  E_MISSING_COLUMN: {
    severity: 'error',
    title: 'Required column missing',
    description: 'A file is missing a column that TransitTrack requires.',
  },
  E_MALFORMED_CSV: {
    severity: 'error',
    title: 'File is not valid CSV',
    description: 'The CSV parser could not read the file (for example, an unterminated quote).',
  },
  E_UNPARSABLE_TIME: {
    severity: 'error',
    title: 'Unparsable or missing stop time',
    description:
      'arrival_time/departure_time is not H:MM:SS, or is empty at the first or last stop of a trip.',
  },
  E_UNPARSABLE_DATE: {
    severity: 'error',
    title: 'Unparsable date',
    description: 'A calendar or calendar_dates date is not a valid YYYYMMDD date.',
  },
  E_INVALID_FIELD: {
    severity: 'error',
    title: 'Invalid field value',
    description:
      'A typed field has an impossible value (e.g. non-numeric stop_sequence or coordinate, weekday flag not 0/1, start_date after end_date).',
  },
  E_DANGLING_REFERENCE: {
    severity: 'error',
    title: 'Reference to a missing record',
    description:
      'trips.route_id, trips.service_id, stop_times.trip_id, stop_times.stop_id or stops.parent_station points at an ID that does not exist.',
  },
  E_DUPLICATE_ID: {
    severity: 'error',
    title: 'Duplicate primary key',
    description: 'Two rows share a primary key (e.g. stop_id, or trip_id + stop_sequence).',
  },
  E_MISSING_AGENCY_ID: {
    severity: 'error',
    title: 'agency_id missing in a multi-agency feed',
    description:
      'With more than one agency, every routes.txt and fare_attributes.txt row must name its agency_id (GTFS reference; MobilityData missing_required_agency_id).',
  },
  E_COORD_OUTSIDE_BBOX: {
    severity: 'error',
    title: 'Coordinates outside the Chennai region',
    description:
      'A stop lies outside the configured bounding box (default lat 12.4–13.6, lon 79.6–80.6).',
  },

  // ---- Warnings ----------------------------------------------------------------------------
  W_EMPTY_ROW: {
    severity: 'warning',
    title: 'Row with only empty values',
    description:
      'A row such as ",,," carries no data. It is skipped, as upstream ChennaiGTFS and the MobilityData validator (empty_row) do.',
  },
  W_NON_INCREASING_TIMES: {
    severity: 'warning',
    title: 'Times go backwards along a trip',
    description:
      'Along stop_sequence, a time is earlier than the previous one (or departure is before arrival). Equal consecutive times are counted separately as a statistic, not flagged.',
  },
  W_TRIP_TOO_FEW_STOP_TIMES: {
    severity: 'warning',
    title: 'Trip has fewer than 2 stop times',
    description: 'A trip in trips.txt has 0 or 1 stop_times rows, so it cannot carry a passenger.',
  },
  W_STALE_CALENDAR: {
    severity: 'warning',
    title: 'Calendar ended before the import date',
    description: 'A service has no active dates on or after the import date.',
  },
  W_CALENDAR_FAR_FUTURE: {
    severity: 'warning',
    title: 'Calendar end date implausibly far in the future',
    description:
      'A service ends years after the import date (e.g. 2170). The calendar then says nothing about how long the timetable is really valid; trust must rest on feed age.',
  },
  W_FEED_AGE: {
    severity: 'warning',
    title: 'Feed older than the "current" threshold',
    description:
      'Days since the source last updated exceed TRUST_CURRENT_MAX_AGE_DAYS (aging) or TRUST_AGING_MAX_AGE_DAYS (stale).',
  },
  W_PLACEHOLDER_TIMES: {
    severity: 'warning',
    title: 'Possible placeholder departure times',
    description:
      'At least 1 % of trips share an identical first departure time (e.g. 00:00:15), which usually means a filler value.',
  },
  W_SHAPE_QUALITY: {
    severity: 'warning',
    title: 'Zero-length or straight-line shape',
    description:
      'A shape has under 2 points or ~0 m length, or has about as many points as its trips have stops (stop-to-stop straight lines, not track geometry).',
  },
  W_STOP_WITHOUT_TRIPS: {
    severity: 'warning',
    title: 'Stop not served by any trip',
    description: 'A boarding stop (location_type 0) never appears in stop_times.txt.',
  },
  W_DUPLICATE_STOPS: {
    severity: 'warning',
    title: 'Possible duplicate stops',
    description:
      'Two boarding stops have the same normalised name within 30 m. Often legitimate (opposite sides of a road), so this is informational for curation.',
  },
  W_DANGLING_OPTIONAL_REFERENCE: {
    severity: 'warning',
    title: 'Optional reference to a missing record',
    description:
      'trips.shape_id, routes.agency_id, transfers (stops, routes, trips), pathways or fare_rules reference an ID that does not exist. Transfer rows with an unknown route or trip are applied conservatively only; rows with an unknown stop are not imported.',
  },
  W_TRANSFER_INCOMPLETE_RULE: {
    severity: 'warning',
    title: 'Incomplete transfer rule',
    description:
      'A transfers.txt row has transfer_type 2 without a min_transfer_time, or an unusable min_transfer_time. The router applies such a row conservatively only (it never relaxes another rule).',
  },
  W_MARKUP_IN_TEXT: {
    severity: 'warning',
    title: 'HTML/script markup in feed text',
    description:
      'A value contains markup such as <script>. Feed text is untrusted input: always escape it before display.',
  },
  W_ID_WHITESPACE: {
    severity: 'warning',
    title: 'ID with leading or trailing whitespace',
    description: 'An ID such as "test " differs from its trimmed form, which breaks naive joins.',
  },
} as const satisfies Record<string, RuleInfo>;

export type RuleCode = keyof typeof RULES;

/**
 * The subset of the GTFS Schedule reference (https://gtfs.org/documentation/schedule/reference/)
 * that TransitTrack loads and checks. Conditionally required columns that we depend on
 * (e.g. stop coordinates, stop_times arrival/departure) are treated as required.
 */
export interface FileSpec {
  required: boolean;
  requiredColumns: readonly string[];
  /** Columns that together must be unique, if any. */
  primaryKey?: readonly string[];
}

export const GTFS_FILES = {
  'agency.txt': {
    required: true,
    requiredColumns: ['agency_name', 'agency_url', 'agency_timezone'],
    primaryKey: ['agency_id'],
  },
  'stops.txt': {
    required: true,
    requiredColumns: ['stop_id', 'stop_lat', 'stop_lon'],
    primaryKey: ['stop_id'],
  },
  'routes.txt': {
    required: true,
    requiredColumns: ['route_id', 'route_type'],
    primaryKey: ['route_id'],
  },
  'trips.txt': {
    required: true,
    requiredColumns: ['route_id', 'service_id', 'trip_id'],
    primaryKey: ['trip_id'],
  },
  'stop_times.txt': {
    required: true,
    requiredColumns: ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    primaryKey: ['trip_id', 'stop_sequence'],
  },
  'calendar.txt': {
    required: false,
    requiredColumns: [
      'service_id',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
      'start_date',
      'end_date',
    ],
    primaryKey: ['service_id'],
  },
  'calendar_dates.txt': {
    required: false,
    requiredColumns: ['service_id', 'date', 'exception_type'],
    primaryKey: ['service_id', 'date'],
  },
  'shapes.txt': {
    required: false,
    requiredColumns: ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
    primaryKey: ['shape_id', 'shape_pt_sequence'],
  },
  'transfers.txt': {
    required: false,
    requiredColumns: ['from_stop_id', 'to_stop_id', 'transfer_type'],
  },
  'pathways.txt': {
    required: false,
    requiredColumns: [
      'pathway_id',
      'from_stop_id',
      'to_stop_id',
      'pathway_mode',
      'is_bidirectional',
    ],
    primaryKey: ['pathway_id'],
  },
  'fare_attributes.txt': {
    required: false,
    requiredColumns: ['fare_id', 'price', 'currency_type', 'payment_method', 'transfers'],
    primaryKey: ['fare_id'],
  },
  'fare_rules.txt': { required: false, requiredColumns: ['fare_id'] },
  'feed_info.txt': {
    required: false,
    requiredColumns: ['feed_publisher_name', 'feed_publisher_url', 'feed_lang'],
  },
} as const satisfies Record<string, FileSpec>;

export type GtfsFileName = keyof typeof GTFS_FILES;

export function isKnownFile(name: string): name is GtfsFileName {
  return Object.hasOwn(GTFS_FILES, name);
}

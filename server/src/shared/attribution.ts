/**
 * Attribution shown in the UI footer and on the Data Quality page (honesty rule 8).
 * Wording follows each source's stated terms as recorded in SPEC §2.
 */
export interface Attribution {
  id: 'chennai-gtfs' | 'openstreetmap' | 'openfreemap' | 'open-meteo';
  /** Text shown to users. */
  text: string;
  href: string;
  licence: string;
  licenceHref: string;
}

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    id: 'chennai-gtfs',
    text: 'Timetable data: UngalSoththu / ChennaiGTFS',
    href: 'https://github.com/ungalsoththu/ChennaiGTFS',
    licence: 'ODbL',
    licenceHref: 'https://opendatacommons.org/licenses/odbl/',
  },
  {
    id: 'openstreetmap',
    text: '© OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL',
    licenceHref: 'https://opendatacommons.org/licenses/odbl/',
  },
  {
    id: 'openfreemap',
    text: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    href: 'https://openfreemap.org',
    licence: 'Provided as-is',
    licenceHref: 'https://openfreemap.org',
  },
  {
    id: 'open-meteo',
    text: 'Weather data by Open-Meteo.com',
    href: 'https://open-meteo.com',
    licence: 'CC BY 4.0',
    licenceHref: 'https://creativecommons.org/licenses/by/4.0/',
  },
] as const;

export const NOT_OFFICIAL_NOTICE =
  'TransitTrack is an independent open-source project. It is not an official service of MTC, CMRL, Southern Railway or CUMTA.';

/** Scheduled times are never presented as live, expected or predicted (honesty rule 2). */
export const SCHEDULED_ONLY_NOTICE =
  'All times are scheduled times from published timetables. No live or real-time data is available.';

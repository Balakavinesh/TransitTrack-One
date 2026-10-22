/** Phase 7 (SPEC F8–F11): shared wording and limits. */

/** Rain advisories are advisories only: never "flood risk", never "safe" (SPEC F8). */
export const RAIN_ADVISORY_NOTICE =
  'Weather forecast from Open-Meteo for the places and hours of this journey. It is an advisory, not a flood warning, and it does not change the journey.';

/** Coordinates are rounded to this grid so nearby journeys share one forecast (SPEC F8). */
export const WEATHER_GRID_DEG = 0.05;
/** A cached forecast is used for this long. */
export const WEATHER_CACHE_MIN = 30;
/** Verified waterlogging reports within this distance of a journey's stops are mentioned. */
export const WATERLOGGING_NEAR_M = 500;

export const EMISSIONS_NOTICE =
  'Coarse CO₂ estimate per passenger from published average factors (India GHG Program, 2015). Bus distances are straight lines between stops × a detour factor because MTC publishes no route shapes. Metro: no documented factor, so no estimate.';

/** Reachability bands in minutes (SPEC F10). */
export const REACHABILITY_BANDS = [30, 45, 60] as const;
/** H3 resolution of the reachability grid (SPEC F10). */
export const REACHABILITY_H3_RESOLUTION = 9;

export const CHANGELOG_NOTICE =
  'Changes between versions of the published ChennaiGTFS files. They show what the published data says, which may differ from real service: MTC data was collected by scraping, and IDs can change between versions.';

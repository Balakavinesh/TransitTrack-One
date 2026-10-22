import { z } from 'zod';

/** Travel modes shown to users. */
export const MODES = ['bus', 'metro', 'suburban_rail'] as const;
export const ModeSchema = z.enum(MODES);
export type Mode = z.infer<typeof ModeSchema>;

/**
 * Mode per agency code (the unified feed's ID prefix). The mode comes from the agency, not
 * from `route_type`: Southern Railway's suburban feed publishes `route_type = 1` (metro) for
 * all its routes (dataset audit, 2026-10-19), which would show suburban trains as metro.
 * The raw `route_type` is still returned next to the mode.
 */
export const AGENCY_MODES: Readonly<Record<string, Mode>> = {
  MTC: 'bus',
  CMRL: 'metro',
  SRR: 'suburban_rail',
};

/** Agency codes of each mode (for `?mode=` filters). */
export function agenciesForMode(mode: Mode): string[] {
  return Object.entries(AGENCY_MODES)
    .filter(([, m]) => m === mode)
    .map(([agency]) => agency);
}

export function modeOfAgency(agencyCode: string): Mode | null {
  return AGENCY_MODES[agencyCode] ?? null;
}

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTIONS,
  HealthResponseSchema,
  ProblemDetailsSchema,
  TRUST_LABELS,
  TrustLabelSchema,
} from './index.js';

describe('trust labels', () => {
  it('contains exactly the five labels from SPEC §3.1', () => {
    expect(TRUST_LABELS).toEqual(['current', 'aging', 'stale', 'projected', 'unknown']);
  });

  it('rejects labels that would imply live data', () => {
    expect(TrustLabelSchema.safeParse('live').success).toBe(false);
    expect(TrustLabelSchema.safeParse('expected').success).toBe(false);
  });
});

describe('attributions', () => {
  it('covers ChennaiGTFS, OpenStreetMap, OpenFreeMap and Open-Meteo', () => {
    expect(ATTRIBUTIONS.map((a) => a.id)).toEqual([
      'chennai-gtfs',
      'openstreetmap',
      'openfreemap',
      'open-meteo',
    ]);
  });

  it('attributes ChennaiGTFS under ODbL', () => {
    const gtfs = ATTRIBUTIONS.find((a) => a.id === 'chennai-gtfs');
    expect(gtfs?.licence).toBe('ODbL');
    expect(gtfs?.text).toContain('UngalSoththu / ChennaiGTFS');
  });
});

describe('ProblemDetailsSchema', () => {
  it('requires requestId and instance', () => {
    const base = { type: 'about:blank', title: 'Not Found', status: 404 };
    expect(ProblemDetailsSchema.safeParse(base).success).toBe(false);
    expect(
      ProblemDetailsSchema.safeParse({ ...base, instance: '/api/v1/x', requestId: 'abc' }).success,
    ).toBe(true);
  });
});

describe('HealthResponseSchema', () => {
  it('accepts a down database with a reason', () => {
    const parsed = HealthResponseSchema.safeParse({
      status: 'down',
      service: 'transittrack-api',
      version: '0.0.0',
      uptimeSec: 1,
      timestamp: new Date().toISOString(),
      checks: { database: { status: 'down', latencyMs: 2000, reason: 'timeout' } },
    });
    expect(parsed.success).toBe(true);
  });
});

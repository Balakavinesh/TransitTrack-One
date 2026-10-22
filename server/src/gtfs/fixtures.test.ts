import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationContext } from './rules/context.js';
import { RULES } from './rules/catalog.js';
import { listFixtures, materializeFixture } from './testing.js';
import { validateGtfs } from './validate.js';

const ctx: ValidationContext = { ...DEFAULT_VALIDATION_OPTIONS, importDate: '2026-10-19' };
const fixtures = listFixtures();
const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c()));
});

async function validateFixture(name: string, context: ValidationContext = ctx) {
  const { dir, cleanup } = await materializeFixture(name);
  cleanups.push(cleanup);
  return validateGtfs(dir, context);
}

describe('fixture catalogue', () => {
  it('has a fixture for every rule except E_ZIP_UNSAFE and W_FEED_AGE (tested separately)', () => {
    const covered = new Set(fixtures.flatMap((f) => f.expect));
    const missing = Object.keys(RULES).filter(
      (code) => !covered.has(code) && code !== 'E_ZIP_UNSAFE' && code !== 'W_FEED_AGE',
    );
    expect(missing).toEqual([]);
  });

  it('only expects known rule codes', () => {
    for (const f of fixtures)
      for (const code of f.expect) expect(Object.keys(RULES)).toContain(code);
  });
});

describe('valid-minimal', () => {
  it('passes with no findings at all', async () => {
    const result = await validateFixture('valid-minimal');
    expect(result.findings).toEqual([]);
    expect(result.status).toBe('passed');
  });

  it('loads stop times past midnight as seconds above 86 400', async () => {
    const { feed } = await validateFixture('valid-minimal');
    const st = feed!.stopTimes!;
    expect(Math.max(...st.arrival)).toBe(90_600); // 25:10:00
    expect(feed!.files['stop_times.txt']!.rowCount).toBe(13);
  });
});

describe.each(fixtures.filter((f) => f.name !== 'valid-minimal'))('fixture $name', (fixture) => {
  it(`triggers ${fixture.expect.join(', ')} — ${fixture.description}`, async () => {
    const result = await validateFixture(fixture.name);
    const codes = result.findings.map((f) => f.code);
    for (const code of fixture.expect) expect(codes).toContain(code);

    // No blocking error other than the ones the fixture is about.
    const unexpectedErrors = result.findings.filter(
      (f) => f.severity === 'error' && !fixture.expect.includes(f.code),
    );
    expect(unexpectedErrors).toEqual([]);

    const expectsError = fixture.expect.some(
      (c) => RULES[c as keyof typeof RULES].severity === 'error',
    );
    expect(result.status).toBe(expectsError ? 'failed' : 'passed_with_warnings');
  });
});

describe('transfer-incomplete-rule', () => {
  it('names each unknown stop, route and trip and each incomplete minimum time', async () => {
    const result = await validateFixture('transfer-incomplete-rule');
    const messages = (code: string) =>
      result.findings.find((f) => f.code === code)?.samples.map((s) => s.message) ?? [];
    expect(messages('W_DANGLING_OPTIONAL_REFERENCE')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('from_stop_id "MTC-S9"'),
        expect.stringContaining('from_route_id "MTC-R9"'),
        expect.stringContaining('from_trip_id "MTC-T9"'),
      ]),
    );
    expect(messages('W_TRANSFER_INCOMPLETE_RULE')).toEqual([
      'transfer_type 2 without min_transfer_time',
      'min_transfer_time "abc" is not a non-negative integer',
    ]);
  });
});

describe('W_FEED_AGE', () => {
  it.each([
    ['2026-10-10', null],
    ['2026-09-01', 'aging'],
    ['2026-03-25', 'stale'],
  ])('feed updated %s → %s', async (updated, band) => {
    const result = await validateFixture('valid-minimal', { ...ctx, feedUpdatedAt: updated });
    const finding = result.findings.find((f) => f.code === 'W_FEED_AGE');
    if (band === null) expect(finding).toBeUndefined();
    else expect(finding?.samples[0]?.message).toContain(`(${band};`);
  });
});

describe('finding details', () => {
  it('names the field and row for a dangling reference', async () => {
    const result = await validateFixture('dangling-route');
    const finding = result.findings.find((f) => f.code === 'E_DANGLING_REFERENCE');
    expect(finding?.samples[0]).toMatchObject({
      file: 'trips.txt',
      row: 3,
      message: 'route_id "MTC-R9" is not in routes.txt',
    });
  });

  it('counts placeholder clusters by trip', async () => {
    const result = await validateFixture('placeholder-times');
    const finding = result.findings.find((f) => f.code === 'W_PLACEHOLDER_TIMES');
    expect(finding?.count).toBe(2);
    expect(finding?.samples[0]?.message).toContain('00:00:15');
  });

  it('respects a custom bounding box', async () => {
    const result = await validateFixture('valid-minimal', {
      ...ctx,
      bbox: { minLat: 13.02, minLon: 80.0, maxLat: 13.1, maxLon: 80.3 },
    });
    expect(result.findings.find((f) => f.code === 'E_COORD_OUTSIDE_BBOX')?.count).toBeGreaterThan(
      0,
    );
  });
});

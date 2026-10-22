import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FindingCollector } from './findings.js';
import { diffSummaries, groupByNumber, summarizeFeed, type FeedSummary } from './history.js';
import { loadFeed } from './load.js';
import { openDirectorySource } from './source.js';
import { materializeFixture } from './testing.js';

const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  await Promise.all(cleanups.map((c) => c()));
});

async function summarize(mutate?: (dir: string) => void): Promise<FeedSummary> {
  const { dir, cleanup } = await materializeFixture('valid-minimal');
  cleanups.push(cleanup);
  mutate?.(dir);
  const source = await openDirectorySource(dir);
  const feed = await loadFeed(source, new FindingCollector());
  return summarizeFeed(feed, source);
}

const edit = (dir: string, file: string, fn: (text: string) => string) =>
  writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));

describe('summarizeFeed', () => {
  it('counts trips per day of week from calendar.txt and Monday first/last departures', async () => {
    const s = await summarize();
    const byId = Object.fromEntries(s.routes.map((r) => [r.routeId, r]));
    // MTC-WK runs every day; CMRL-WD Monday–Saturday.
    expect(byId['MTC-R1']!.tripsByDay).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(byId['CMRL-R1']!.tripsByDay).toEqual([2, 2, 2, 2, 2, 2, 0]);
    expect(byId['MTC-R1']).toMatchObject({
      firstDepartureSec: 6 * 3600,
      lastDepartureSec: 23 * 3600 + 50 * 60,
    });
    // Two CMRL departures at 08:00:30 and 08:10:30: a 10-minute peak headway.
    expect(byId['CMRL-R1']!.peakHeadwayMin).toBe(10);
    // No MTC departure between 08:00 and 10:00.
    expect(byId['MTC-R1']!.peakHeadwayMin).toBeNull();
    expect(s.stats).toMatchObject({
      routes: 2,
      trips: 5,
      frequencyBasedTrips: 0,
      tripsWithPlaceholderTimes: 0,
    });
  });

  it('counts each departure of a frequency-based trip', async () => {
    const s = await summarize((dir) =>
      writeFileSync(
        join(dir, 'frequencies.txt'),
        'trip_id,start_time,end_time,headway_secs\nCMRL-T1,08:00:00,09:00:00,600\n',
      ),
    );
    const cmrl = s.routes.find((r) => r.routeId === 'CMRL-R1')!;
    // CMRL-T1 → 6 departures (08:00 … 08:50), plus CMRL-T2.
    expect(cmrl.tripsByDay[0]).toBe(7);
    expect(s.stats.frequencyBasedTrips).toBe(1);
  });

  it('leaves placeholder first departures (not on a whole minute) out of times and headways', async () => {
    const s = await summarize((dir) => {
      edit(dir, 'stop_times.txt', (t) =>
        t
          .replace('MTC-T1,06:00:00,06:00:00', 'MTC-T1,00:00:15,00:00:15')
          .replace('MTC-T2,07:00:00,07:00:00', 'MTC-T2,00:00:15,00:00:15'),
      );
    });
    expect(s.stats.tripsWithPlaceholderTimes).toBe(2);
    expect(s.stats.placeholderTimes).toEqual(['00:00:15']);
    const mtc = s.routes.find((r) => r.routeId === 'MTC-R1')!;
    expect(mtc.tripsByDay[0]).toBe(3);
    expect(mtc.firstDepartureSec).toBe(23 * 3600 + 50 * 60);
  });
});

describe('diffSummaries', () => {
  it('reports added, removed and moved stops, route numbers and service changes', async () => {
    const before = await summarize();
    const after = await summarize((dir) => {
      // Move MTC-S2 ~111 m north; add a stop; drop CMRL-ST2? (keep stations, add one stop).
      edit(dir, 'stops.txt', (t) =>
        t.replace('MTC-S2,Beta Bus Stop,13.0100,80.2100', 'MTC-S2,Beta Bus Stop,13.0110,80.2100'),
      );
      appendFileSync(join(dir, 'stops.txt'), 'MTC-S9,New Stop,13.0300,80.2300,0,\n');
      // A fourth MTC trip, and route 1A renumbered to 1B in a new route id.
      appendFileSync(join(dir, 'trips.txt'), 'MTC-R1,MTC-WK,MTC-T4,Gamma,\n');
      appendFileSync(
        join(dir, 'stop_times.txt'),
        'MTC-T4,09:00:00,09:00:00,MTC-S1,1\nMTC-T4,09:10:00,09:10:00,MTC-S2,2\n',
      );
    });
    const d = diffSummaries(before, after);
    expect(d.stops.added.map((s) => s.stopId)).toEqual(['MTC-S9']);
    expect(d.stops.removed).toEqual([]);
    expect(d.stops.moved.map((m) => [m.after.stopId, m.meters])).toEqual([['MTC-S2', 111]]);
    expect(d.routesById).toMatchObject({ added: [], removed: [], kept: 2 });
    const change = d.changedRoutes.find((c) => c.number === '1A')!;
    expect(change.mondayTripsDelta).toBe(1);
    expect(change.before.tripsByDay[0]).toBe(3);
    expect(change.after.tripsByDay[0]).toBe(4);
    expect(d.totals.after.mondayTrips - d.totals.before.mondayTrips).toBe(1);
    // CMRL did not change, so it is not listed.
    expect(d.changedRoutes.map((c) => c.number)).toEqual(['1A']);
  });

  it('compares by route number when route ids change between versions', () => {
    const r = (routeId: string, shortName: string, monday: number) => ({
      routeId,
      shortName,
      longName: null,
      tripsByDay: [monday, 0, 0, 0, 0, 0, 0],
      firstDepartureSec: null,
      lastDepartureSec: null,
      peakHeadwayMin: null,
    });
    const d = diffSummaries(
      { routes: [r('100', '21G', 10), r('101', '21G', 5)], stops: [] },
      { routes: [r('900', '21G', 15)], stops: [] },
    );
    expect(d.routesById).toMatchObject({ added: ['900'], removed: ['100', '101'] });
    expect(d.routesByNumber).toMatchObject({ added: [], removed: [], kept: 1 });
    expect(d.changedRoutes).toEqual([]);
    expect(groupByNumber([r('100', '21G', 10), r('101', '21G', 5)]).get('21G')!.tripsByDay[0]).toBe(
      15,
    );
  });
});

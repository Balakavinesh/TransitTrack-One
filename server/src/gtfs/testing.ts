/**
 * Test helpers shared by packages that need GTFS fixtures (`@transittrack/gtfs/testing`).
 * Fixtures live in `tests/fixtures/gtfs/<name>/`: a `fixture.json` plus files that override
 * the `extends` base; `remove` drops base files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildZip } from './zip-write.js';

export { buildZip, type ZipEntrySpec } from './zip-write.js';

export interface FixtureMeta {
  name: string;
  description: string;
  extends?: string;
  remove?: string[];
  /** Rule codes this fixture must trigger. */
  expect: string[];
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'tests', 'fixtures'))) return dir;
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Repository root with tests/fixtures not found above ' + start);
    dir = parent;
  }
}

export const FIXTURES_DIR = join(findRepoRoot(process.cwd()), 'tests', 'fixtures', 'gtfs');
/** Per-agency feeds for the unified-build tests (see its README). */
export const COMPONENT_FIXTURES_DIR = join(
  findRepoRoot(process.cwd()),
  'tests',
  'fixtures',
  'gtfs-components',
);

export function listFixtures(): FixtureMeta[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      ...(JSON.parse(readFileSync(join(FIXTURES_DIR, d.name, 'fixture.json'), 'utf8')) as Omit<
        FixtureMeta,
        'name'
      >),
    }));
}

/** Copies a fixture (with its base) into a fresh temp directory and returns the path. */
export async function materializeFixture(
  name: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const meta = listFixtures().find((f) => f.name === name);
  if (!meta) throw new Error(`unknown fixture ${name}`);
  const dir = await mkdtemp(join(tmpdir(), `gtfs-${name}-`));

  const copyTxt = async (from: string) => {
    for (const file of readdirSync(from).filter((f) => f.endsWith('.txt'))) {
      await copyFile(join(from, file), join(dir, file));
    }
  };
  if (meta.extends) await copyTxt(join(FIXTURES_DIR, meta.extends));
  for (const file of meta.remove ?? []) await rm(join(dir, file), { force: true });
  await copyTxt(join(FIXTURES_DIR, name));

  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Zips every .txt file of a directory into `outPath`. */
export async function zipDirectory(dir: string, outPath: string): Promise<void> {
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => ({ name: f, data: readFileSync(join(dir, f)) }));
  await writeFile(outPath, buildZip(entries));
}

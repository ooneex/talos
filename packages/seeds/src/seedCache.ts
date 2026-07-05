import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ISeed } from "./types";

/**
 * Per-seed run cache for `seed:run`.
 *
 * Unlike migrations, seeds have no database table recording what has run, so
 * this cache is the only record that a seed already ran: a seed whose `run`
 * code is unchanged since its last successful run — for the same target
 * environment — is skipped without touching the database. One JSON file per
 * seed lives under `var/cache/seeds/`, so editing a single seed invalidates
 * only that seed's entry (unlike a per-module cache, which any change would
 * drop).
 *
 * The fingerprint includes the active environment (`APP_ENV`), so seeding a
 * different environment is always a miss. Like any cache decoupled from live
 * database state it can go stale if the database is reset out of band — `--drop`
 * and `--no-cache` bypass it for that reason.
 */

export const SEED_CACHE_VERSION = 1;

// Fallback cache location, relative to `process.cwd()`, used only when `run` is
// invoked directly (not through the CLI). The `seed:run` command instead passes
// an explicit per-module directory under the workspace root via `--cache-dir`
// (see `SEEDS_CACHE_DIR` in packages/cli/src/monorepo.ts).
const CACHE_SUBPATH = join("var", "cache", "seeds");

export type SeedCacheEntryType = {
  version: number;
  name: string;
  hash: string;
  ranAt: string;
};

/** Directory holding one cache file per successfully-run seed. */
export const seedCacheDir = (rootDir: string = process.cwd()): string => join(rootDir, CACHE_SUBPATH);

const cacheFile = (dir: string, name: string): string => join(dir, `${name.replace(/[^\w.-]+/g, "-")}.json`);

/**
 * Fingerprint a seed: its name and the source of its `run` method, scoped to
 * the active environment. Any change to the seed's code (or to the environment
 * it targets) yields a new hash and therefore a cache miss.
 */
export const computeSeedHash = (seed: ISeed, env?: string): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(
    [
      `version=${SEED_CACHE_VERSION}`,
      `name=${seed.constructor.name}`,
      `env=${env ?? ""}`,
      `run=${seed.run.toString()}`,
    ].join("\n"),
  );
  return hasher.digest("hex");
};

/**
 * True when seed `name` has a cache entry matching `hash` — i.e. it ran
 * successfully and its code is unchanged. Reads never throw: a missing or
 * unreadable entry is simply a miss.
 */
export const isSeedCached = async (dir: string, name: string, hash: string): Promise<boolean> => {
  try {
    const file = Bun.file(cacheFile(dir, name));
    if (!(await file.exists())) return false;
    const entry: SeedCacheEntryType = await file.json();
    return entry.hash === hash;
  } catch {
    return false;
  }
};

/** Record a successful run so seed `name` can be skipped next time. Never throws. */
export const writeSeedCache = async (dir: string, name: string, hash: string): Promise<void> => {
  try {
    const entry: SeedCacheEntryType = {
      version: SEED_CACHE_VERSION,
      name,
      hash,
      ranAt: new Date().toISOString(),
    };
    await Bun.write(cacheFile(dir, name), JSON.stringify(entry, null, 2));
  } catch {}
};

/** Drop seed `name`'s cache entry so the next `seed:run` re-runs it. Never throws. */
export const deleteSeedCache = async (dir: string, name: string): Promise<void> => {
  try {
    await rm(cacheFile(dir, name), { force: true });
  } catch {}
};

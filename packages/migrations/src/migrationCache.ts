import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { IMigration } from "./types";

/**
 * Per-migration (per-version) run cache for `migration:up`.
 *
 * The database `migrations` table stays the source of truth for what has been
 * applied; this cache is only a fast path. It lets `up` skip re-checking — and,
 * when every migration is already recorded, skip opening a database connection
 * altogether — for migrations whose code is unchanged since their last
 * successful apply. One JSON file per version lives under
 * `var/cache/migrations/`, so editing a single migration invalidates only that
 * migration's entry (unlike a per-module cache, which any change would drop).
 *
 * The fingerprint includes the target database URL and table name, so pointing
 * at a different database is always a miss. Like any cache decoupled from live
 * database state it can go stale if the database is reset out of band — `--drop`
 * and `--no-cache` bypass it for that reason, and `migration:down` deletes the
 * entry it rolls back.
 */

export const MIGRATION_CACHE_VERSION = 1;

export type MigrationCacheEntryType = {
  version: number;
  id: string;
  hash: string;
  appliedAt: string;
};

/** Directory holding one cache file per applied migration version. */
export const migrationCacheDir = (rootDir: string = process.cwd()): string =>
  join(rootDir, "var", "cache", "migrations");

const cacheFile = (dir: string, id: string): string => join(dir, `${id.replace(/[^\w.-]+/g, "-")}.json`);

/**
 * Fingerprint a migration: its version and the source of its `up`/`down`
 * methods, scoped to the target database. Any change to the migration's code (or
 * to the database it targets) yields a new hash and therefore a cache miss.
 */
export const computeMigrationHash = (migration: IMigration, tableName: string, databaseUrl?: string): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(
    [
      `version=${MIGRATION_CACHE_VERSION}`,
      `id=${migration.getVersion()}`,
      `table=${tableName}`,
      `db=${databaseUrl ?? ""}`,
      `up=${migration.up.toString()}`,
      `down=${migration.down.toString()}`,
    ].join("\n"),
  );
  return hasher.digest("hex");
};

/**
 * True when version `id` has a cache entry matching `hash` — i.e. it was applied
 * successfully and its code is unchanged. Reads never throw: a missing or
 * unreadable entry is simply a miss.
 */
export const isMigrationCached = async (dir: string, id: string, hash: string): Promise<boolean> => {
  try {
    const file = Bun.file(cacheFile(dir, id));
    if (!(await file.exists())) return false;
    const entry: MigrationCacheEntryType = await file.json();
    return entry.hash === hash;
  } catch {
    return false;
  }
};

/** Record a successful apply so version `id` can be skipped next time. Never throws. */
export const writeMigrationCache = async (dir: string, id: string, hash: string): Promise<void> => {
  try {
    const entry: MigrationCacheEntryType = {
      version: MIGRATION_CACHE_VERSION,
      id,
      hash,
      appliedAt: new Date().toISOString(),
    };
    await Bun.write(cacheFile(dir, id), JSON.stringify(entry, null, 2));
  } catch {}
};

/** Drop version `id`'s cache entry (e.g. after a rollback) so the next `up` re-applies it. Never throws. */
export const deleteMigrationCache = async (dir: string, id: string): Promise<void> => {
  try {
    await rm(cacheFile(dir, id), { force: true });
  } catch {}
};

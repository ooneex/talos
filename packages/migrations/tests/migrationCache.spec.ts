import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { SQL, TransactionSQL } from "bun";
import {
  computeMigrationHash,
  deleteMigrationCache,
  isMigrationCached,
  MIGRATION_CACHE_VERSION,
  migrationCacheDir,
  writeMigrationCache,
} from "@/migrationCache";
import type { IMigration } from "@/types";

const noop = async (_tx: TransactionSQL, _sql: SQL) => {};

const makeMigration = (version: string, up: IMigration["up"] = noop, down: IMigration["down"] = noop): IMigration => ({
  getVersion: () => version,
  getDependencies: () => [],
  up,
  down,
});

describe("migrationCacheDir", () => {
  test("should default to var/cache/migrations under the current working directory", () => {
    expect(migrationCacheDir()).toBe(join(process.cwd(), "var", "cache", "migrations"));
  });

  test("should honor an explicit root directory", () => {
    expect(migrationCacheDir("/tmp/app")).toBe(join("/tmp/app", "var", "cache", "migrations"));
  });
});

describe("computeMigrationHash", () => {
  test("should be stable for the same migration, table and database", () => {
    const migration = makeMigration("20240101120000");
    const a = computeMigrationHash(migration, "migrations", "postgres://a");
    const b = computeMigrationHash(migration, "migrations", "postgres://a");
    expect(a).toBe(b);
  });

  test("should change when the migration code changes", () => {
    const one = makeMigration("20240101120000", async (tx) => {
      await tx`CREATE TABLE one ()`;
    });
    const two = makeMigration("20240101120000", async (tx) => {
      await tx`CREATE TABLE two ()`;
    });
    const a = computeMigrationHash(one, "migrations", "postgres://a");
    const b = computeMigrationHash(two, "migrations", "postgres://a");
    expect(a).not.toBe(b);
  });

  test("should change when the target database changes", () => {
    const migration = makeMigration("20240101120000");
    const a = computeMigrationHash(migration, "migrations", "postgres://a");
    const b = computeMigrationHash(migration, "migrations", "postgres://b");
    expect(a).not.toBe(b);
  });

  test("should change when the table name changes", () => {
    const migration = makeMigration("20240101120000");
    const a = computeMigrationHash(migration, "migrations", "postgres://a");
    const b = computeMigrationHash(migration, "schema_migrations", "postgres://a");
    expect(a).not.toBe(b);
  });
});

describe("migration cache entries", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = join(process.cwd(), ".temp", `migration-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("should miss before anything is written", async () => {
    expect(await isMigrationCached(cacheDir, "20240101120000", "abc")).toBe(false);
  });

  test("should hit after a matching write and store the entry shape", async () => {
    await writeMigrationCache(cacheDir, "20240101120000", "abc");

    expect(await isMigrationCached(cacheDir, "20240101120000", "abc")).toBe(true);

    const entry = await Bun.file(join(cacheDir, "20240101120000.json")).json();
    expect(entry.version).toBe(MIGRATION_CACHE_VERSION);
    expect(entry.id).toBe("20240101120000");
    expect(entry.hash).toBe("abc");
    expect(typeof entry.appliedAt).toBe("string");
  });

  test("should miss when the stored hash differs from the current one", async () => {
    await writeMigrationCache(cacheDir, "20240101120000", "abc");

    expect(await isMigrationCached(cacheDir, "20240101120000", "xyz")).toBe(false);
  });

  test("should miss after the entry is deleted", async () => {
    await writeMigrationCache(cacheDir, "20240101120000", "abc");
    await deleteMigrationCache(cacheDir, "20240101120000");

    expect(await isMigrationCached(cacheDir, "20240101120000", "abc")).toBe(false);
  });

  test("should treat deleting a missing entry as a no-op", async () => {
    await expect(deleteMigrationCache(cacheDir, "does-not-exist")).resolves.toBeUndefined();
  });
});

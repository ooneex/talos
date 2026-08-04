import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
import { computeMigrationHash, isMigrationCached, migrationCacheDir, writeMigrationCache } from "./migrationCache";
import { COLORS, colorize, formatDuration, runLogger, SYMBOLS } from "./runLogger";
import type { IMigration } from "./types";

type UpOptionsType = {
  drop?: boolean;
  noCache?: boolean;
  cacheDir?: string | undefined;
};

// biome-ignore lint/suspicious/noExplicitAny: trust me
const run = async (migration: IMigration, tx: any, sql: SQL): Promise<void> => {
  const dependencies = await migration.getDependencies();

  for (const dependency of dependencies) {
    const dep = container.get(dependency);
    await run(dep, tx, sql);
  }

  await migration.up(tx, sql);
};

const readOptions = (): UpOptionsType => {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      drop: {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
      "cache-dir": {
        type: "string",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  return {
    drop: Boolean(values.drop),
    noCache: Boolean(values["no-cache"]),
    cacheDir: values["cache-dir"] as string | undefined,
  };
};

const logNoMigrationsAndExit = (): never => {
  runLogger.persist(colorize(`${SYMBOLS.skipped} No migrations found`, COLORS.dim));
  process.exit(0);
};

const buildSqlClient = (databaseUrl?: string): SQL => {
  return new SQL({
    url: databaseUrl,
    max: 5,
    idleTimeout: 0,
    maxLifetime: 0,
    connectionTimeout: 30,
    prepare: false,
  });
};

const warmMigrationCache = async (
  migrations: IMigration[],
  tableName: string,
  databaseUrl: string | undefined,
  cacheDir: string,
  cacheEnabled: boolean,
): Promise<{
  hashById: Map<string, string>;
  cachedIds: Set<string>;
}> => {
  const hashById = new Map<string, string>();
  const cachedIds = new Set<string>();

  if (!cacheEnabled) {
    return { hashById, cachedIds };
  }

  await Promise.all(
    migrations.map(async (migration) => {
      const id = migration.getVersion();
      const hash = computeMigrationHash(migration, tableName, databaseUrl);
      hashById.set(id, hash);
      if (await isMigrationCached(cacheDir, id, hash)) {
        cachedIds.add(id);
      }
    }),
  );

  return { hashById, cachedIds };
};

const logCachedMigrationsAndExit = (migrations: IMigration[]): never => {
  for (const migration of migrations) {
    runLogger.persist(
      colorize(`${SYMBOLS.success} `, COLORS.success) +
        migration.getVersion() +
        colorize("  up to date (cached)", COLORS.dim),
    );
  }

  process.exit(0);
};

const cacheAppliedMigration = async (
  cacheEnabled: boolean,
  cacheDir: string,
  hashById: Map<string, string>,
  id: string,
): Promise<void> => {
  const hash = hashById.get(id);
  if (cacheEnabled && hash) {
    await writeMigrationCache(cacheDir, id, hash);
  }
};

const runMigration = async (
  sql: SQL,
  migration: IMigration,
  tableName: string,
  cacheEnabled: boolean,
  cacheDir: string,
  hashById: Map<string, string>,
): Promise<void> => {
  const id = migration.getVersion();
  const startedAt = performance.now();

  await sql.begin(async (tx) => {
    await run(migration, tx, sql);
    await tx`INSERT INTO ${sql(tableName)} (id) VALUES (${id})`;
  });

  runLogger.persist(
    colorize(`${SYMBOLS.success} `, COLORS.success) +
      id +
      colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
  );

  await cacheAppliedMigration(cacheEnabled, cacheDir, hashById, id);
};

const handleDrop = async (sql: SQL): Promise<void> => {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  runLogger.persist(colorize(`${SYMBOLS.success} Database dropped`, COLORS.success));
};

const handleEmptyMigrations = async (sql: SQL): Promise<never> => {
  runLogger.persist(colorize(`${SYMBOLS.skipped} No migrations found`, COLORS.dim));
  await sql.close();
  process.exit(0);
};

export const up = async (config?: { databaseUrl?: string; tableName?: string; cacheDir?: string }): Promise<void> => {
  const options = readOptions();
  const tableName = config?.tableName || "migrations";
  const databaseUrl = config?.databaseUrl || Bun.env.DATABASE_URL;
  const migrations = getMigrations();

  if (migrations.length === 0 && !options.drop) {
    logNoMigrationsAndExit();
  }

  // Per-version run cache: a migration whose code is unchanged since its last
  // successful apply is skipped without touching the database. `--drop` resets
  // the database (so a hit would wrongly skip the rebuild) and `--no-cache` is
  // the escape hatch — both disable it. Entries live under `var/cache/migrations`.
  const cacheEnabled = !options.drop && !options.noCache;
  // The runner (`migration:up`) passes an explicit, per-module cache directory
  // under the workspace root; fall back to the cwd-relative default when `up` is
  // invoked directly.
  const cacheDir = config?.cacheDir || options.cacheDir || migrationCacheDir();
  const { hashById, cachedIds } = await warmMigrationCache(migrations, tableName, databaseUrl, cacheDir, cacheEnabled);

  // Fast path: when every migration is already recorded as applied and
  // unchanged, there is nothing to run — skip opening a database connection.
  if (cachedIds.size === migrations.length) {
    logCachedMigrationsAndExit(migrations);
  }

  const sql = buildSqlClient(databaseUrl);

  if (options.drop) {
    await handleDrop(sql);
  }

  if (migrations.length === 0) {
    await handleEmptyMigrations(sql);
  }

  await createMigrationTable(sql, tableName);

  for (const migration of migrations) {
    const id = migration.getVersion();

    if (cachedIds.has(id)) {
      runLogger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) + id + colorize("  up to date (cached)", COLORS.dim),
      );
      continue;
    }

    const entities = await sql`SELECT * FROM ${sql(tableName)} WHERE id = ${id}`;

    if (entities.length > 0) {
      // Applied on a previous run (e.g. before this cache existed, or by another
      // process). Record it so the next run skips even the lookup.
      await cacheAppliedMigration(cacheEnabled, cacheDir, hashById, id);
      continue;
    }

    const startedAt = performance.now();
    try {
      await runMigration(sql, migration, tableName, cacheEnabled, cacheDir, hashById);
    } catch (error: unknown) {
      runLogger.persist(
        colorize(`${SYMBOLS.error} `, COLORS.error) +
          id +
          colorize("  failed", COLORS.error) +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );
      const detail = (error as IException)?.message ?? String(error);
      runLogger.persist(...detail.split("\n").map((line) => `${colorize("┃", COLORS.error)} ${line}`));
      await sql.close({ timeout: 0 });
      process.exit(1);
    }
  }

  await sql.close();
};

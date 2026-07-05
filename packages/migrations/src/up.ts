import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
import { computeMigrationHash, isMigrationCached, migrationCacheDir, writeMigrationCache } from "./migrationCache";
import { COLORS, colorize, formatDuration, runLogger, SYMBOLS } from "./runLogger";
import type { IMigration } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: trust me
const run = async (migration: IMigration, tx: any, sql: SQL): Promise<void> => {
  const dependencies = await migration.getDependencies();

  for (const dependency of dependencies) {
    const dep = container.get(dependency);
    await run(dep, tx, sql);
  }

  await migration.up(tx, sql);
};

export const up = async (config?: { databaseUrl?: string; tableName?: string; cacheDir?: string }): Promise<void> => {
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

  const tableName = config?.tableName || "migrations";
  const databaseUrl = config?.databaseUrl || Bun.env.DATABASE_URL;

  const logger = runLogger;

  const migrations = getMigrations();

  if (migrations.length === 0 && !values.drop) {
    logger.persist(colorize(`${SYMBOLS.skipped} No migrations found`, COLORS.dim));
    process.exit(0);
  }

  // Per-version run cache: a migration whose code is unchanged since its last
  // successful apply is skipped without touching the database. `--drop` resets
  // the database (so a hit would wrongly skip the rebuild) and `--no-cache` is
  // the escape hatch — both disable it. Entries live under `var/cache/migrations`.
  const cacheEnabled = !values.drop && !values["no-cache"];
  // The runner (`migration:up`) passes an explicit, per-module cache directory
  // under the workspace root; fall back to the cwd-relative default when `up` is
  // invoked directly.
  const cacheDir = config?.cacheDir || (values["cache-dir"] as string | undefined) || migrationCacheDir();
  const hashById = new Map<string, string>();
  const cachedIds = new Set<string>();

  if (cacheEnabled) {
    for (const migration of migrations) {
      const id = migration.getVersion();
      const hash = computeMigrationHash(migration, tableName, databaseUrl);
      hashById.set(id, hash);
      if (await isMigrationCached(cacheDir, id, hash)) {
        cachedIds.add(id);
      }
    }

    // Fast path: when every migration is already recorded as applied and
    // unchanged, there is nothing to run — skip opening a database connection.
    if (cachedIds.size === migrations.length) {
      for (const migration of migrations) {
        logger.persist(
          colorize(`${SYMBOLS.success} `, COLORS.success) +
            migration.getVersion() +
            colorize("  up to date (cached)", COLORS.dim),
        );
      }
      process.exit(0);
    }
  }

  const sql = new SQL({
    url: databaseUrl,

    // Connection pool settings.
    // Migrations run sequentially (one transaction at a time), so a small
    // pool is enough — a single reusable connection avoids the cost of
    // opening/closing a connection per query while keeping headroom for the
    // dependency resolution queries.
    max: 5, // Maximum connections in pool
    idleTimeout: 0, // Keep connections open for the whole migration run
    maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
    connectionTimeout: 30, // Timeout when establishing new connections

    // Migration statements differ on every run, so caching named prepared
    // statements on the server adds overhead without a reuse benefit.
    prepare: false,
  });

  if (values.drop) {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    logger.persist(colorize(`${SYMBOLS.success} Database dropped`, COLORS.success));
  }

  if (migrations.length === 0) {
    logger.persist(colorize(`${SYMBOLS.skipped} No migrations found`, COLORS.dim));
    await sql.close();
    process.exit(0);
  }

  await createMigrationTable(sql, tableName);

  for (const migration of migrations) {
    const id = migration.getVersion();
    const migrationName = id;

    if (cachedIds.has(id)) {
      logger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) + migrationName + colorize("  up to date (cached)", COLORS.dim),
      );
      continue;
    }

    const entities = await sql`SELECT * FROM ${sql(tableName)} WHERE id = ${id}`;

    if (entities.length > 0) {
      // Applied on a previous run (e.g. before this cache existed, or by another
      // process). Record it so the next run skips even the lookup.
      const hash = hashById.get(id);
      if (cacheEnabled && hash) {
        await writeMigrationCache(cacheDir, id, hash);
      }
      continue;
    }

    const startedAt = performance.now();
    try {
      await sql.begin(async (tx) => {
        await run(migration, tx, sql);
        await tx`INSERT INTO ${sql(tableName)} (id) VALUES (${id})`;
      });

      logger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) +
          migrationName +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );

      // Only cache once the transaction has committed successfully.
      const hash = hashById.get(id);
      if (cacheEnabled && hash) {
        await writeMigrationCache(cacheDir, id, hash);
      }
    } catch (error: unknown) {
      logger.persist(
        colorize(`${SYMBOLS.error} `, COLORS.error) +
          migrationName +
          colorize("  failed", COLORS.error) +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );
      const detail = (error as IException)?.message ?? String(error);
      logger.persist(...detail.split("\n").map((line) => `${colorize("┃", COLORS.error)} ${line}`));
      await sql.close({ timeout: 0 });
      process.exit(1);
    }
  }

  await sql.close();
};

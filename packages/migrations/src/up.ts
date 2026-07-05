import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
import { computeMigrationHash, isMigrationCached, migrationCacheDir, writeMigrationCache } from "./migrationCache";
import { terminalLogger } from "./terminalLogger";
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

export const up = async (config?: { databaseUrl?: string; tableName?: string }): Promise<void> => {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      drop: {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  const tableName = config?.tableName || "migrations";
  const databaseUrl = config?.databaseUrl || Bun.env.DATABASE_URL;

  const logger = terminalLogger;

  const migrations = getMigrations();

  if (migrations.length === 0 && !values.drop) {
    logger.info("No migrations found\n");
    process.exit(0);
  }

  // Per-version run cache: a migration whose code is unchanged since its last
  // successful apply is skipped without touching the database. `--drop` resets
  // the database (so a hit would wrongly skip the rebuild) and `--no-cache` is
  // the escape hatch — both disable it. Entries live under `var/cache/migrations`.
  const cacheEnabled = !values.drop && !values["no-cache"];
  const cacheDir = migrationCacheDir();
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
        logger.success(`Migration ${migration.getVersion()} up to date (cached)\n`);
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
    logger.info("Database dropped\n");
  }

  if (migrations.length === 0) {
    logger.info("No migrations found\n");
    await sql.close();
    process.exit(0);
  }

  await createMigrationTable(sql, tableName);

  for (const migration of migrations) {
    const id = migration.getVersion();
    const migrationName = id;

    if (cachedIds.has(id)) {
      logger.success(`Migration ${migrationName} up to date (cached)\n`);
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

    try {
      await sql.begin(async (tx) => {
        await run(migration, tx, sql);
        await tx`INSERT INTO ${sql(tableName)} (id) VALUES (${id})`;
        logger.success(`Migration ${migrationName} completed\n`);
      });

      // Only cache once the transaction has committed successfully.
      const hash = hashById.get(id);
      if (cacheEnabled && hash) {
        await writeMigrationCache(cacheDir, id, hash);
      }
    } catch (error: unknown) {
      logger.error(`Migration ${migrationName} failed\n`);
      logger.error(error as IException);
      await sql.close({ timeout: 0 });
      process.exit(1);
    }
  }

  await sql.close();
};

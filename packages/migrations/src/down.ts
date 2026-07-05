import { parseArgs } from "node:util";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
import { deleteMigrationCache, migrationCacheDir } from "./migrationCache";
import { terminalLogger } from "./terminalLogger";

export const down = async (config?: {
  databaseUrl?: string;
  tableName?: string;
  version?: string;
  cacheDir?: string;
}): Promise<void> => {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      version: {
        type: "string",
      },
      "cache-dir": {
        type: "string",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  const tableName = config?.tableName || "migrations";
  const version = config?.version || (values.version as string | undefined);
  // Mirror `up`'s cache directory so the entry is dropped from where it was
  // written; fall back to the cwd-relative default for direct invocation.
  const cacheDir = config?.cacheDir || (values["cache-dir"] as string | undefined) || migrationCacheDir();

  const sql = new SQL({
    url: config?.databaseUrl || Bun.env.DATABASE_URL,

    // Connection pool settings.
    // Migrations roll back sequentially (one transaction at a time), so a small
    // pool is enough — a single reusable connection avoids the cost of
    // opening/closing a connection per query while keeping headroom for the
    // lookup queries.
    max: 5, // Maximum connections in pool
    idleTimeout: 0, // Keep connections open for the whole rollback run
    maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
    connectionTimeout: 30, // Timeout when establishing new connections

    // Migration statements differ on every run, so caching named prepared
    // statements on the server adds overhead without a reuse benefit.
    prepare: false,
  });

  const logger = terminalLogger;

  await createMigrationTable(sql, tableName);

  const applied = await sql`SELECT id FROM ${sql(tableName)}`;
  const appliedIds = new Set<string>(applied.map((row: { id: string }) => row.id));

  if (appliedIds.size === 0) {
    logger.info("No migrations to roll back\n");
    await sql.close();
    process.exit(0);
  }

  // Roll back in reverse order of application (newest first).
  const migrations = getMigrations().reverse();

  let targets = migrations.filter((migration) => appliedIds.has(migration.getVersion()));

  if (version) {
    const target = targets.find((migration) => migration.getVersion() === version);

    if (!target) {
      logger.info(`Migration ${version} is not applied\n`);
      await sql.close();
      process.exit(0);
    }

    targets = [target];
  } else {
    // Without a version, roll back only the most recently applied migration.
    targets = targets.slice(0, 1);
  }

  for (const migration of targets) {
    const id = migration.getVersion();
    const migrationName = id;

    try {
      await sql.begin(async (tx) => {
        await migration.down(tx, sql);
        await tx`DELETE FROM ${sql(tableName)} WHERE id = ${id}`;
        logger.success(`Migration ${migrationName} rolled back\n`);
      });

      // Drop the up-cache entry so the next `migration:up` re-applies it instead
      // of treating the rolled-back migration as still up to date.
      await deleteMigrationCache(cacheDir, id);
    } catch (error: unknown) {
      logger.error(`Migration ${migrationName} rollback failed\n`);
      logger.error(error as IException);
      await sql.close({ timeout: 0 });
      process.exit(1);
    }
  }

  await sql.close();
};

import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
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
    },
    strict: false,
    allowPositionals: true,
  });

  const tableName = config?.tableName || "migrations";

  const sql = new SQL({
    url: config?.databaseUrl || Bun.env.DATABASE_URL,

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

  const logger = terminalLogger;

  if (values.drop) {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    logger.info("Database dropped\n");
  }

  const migrations = getMigrations();

  if (migrations.length === 0) {
    logger.info("No migrations found\n");
    await sql.close();
    process.exit(0);
  }

  await createMigrationTable(sql, tableName);

  for (const migration of migrations) {
    const id = migration.getVersion();

    const entities = await sql`SELECT * FROM ${sql(tableName)} WHERE id = ${id}`;

    if (entities.length > 0) {
      continue;
    }

    const migrationName = id;

    try {
      await sql.begin(async (tx) => {
        await run(migration, tx, sql);
        await tx`INSERT INTO ${sql(tableName)} (id) VALUES (${id})`;
        logger.success(`Migration ${migrationName} completed\n`);
      });
    } catch (error: unknown) {
      logger.error(`Migration ${migrationName} failed\n`);
      logger.error(error as IException);
      await sql.close({ timeout: 0 });
      process.exit(1);
    }
  }

  await sql.close();
};

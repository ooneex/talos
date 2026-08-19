import { parseArgs } from "node:util";
import type { IException } from "@talosjs/exception";
import { SQL } from "bun";
import { createMigrationTable } from "./createMigrationTable";
import { getMigrations } from "./getMigrations";
import { COLORS, colorize, formatDuration, runLogger, SYMBOLS } from "./runLogger";
import type { IMigration } from "./types";

type UpOptionsType = {
  drop?: boolean;
};

const readOptions = (): UpOptionsType => {
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

  return {
    drop: Boolean(values.drop),
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

const runMigration = async (sql: SQL, migration: IMigration, tableName: string): Promise<void> => {
  const id = migration.getVersion();
  const startedAt = performance.now();

  // Only this migration's own `up()` runs here. Its dependencies are registered
  // migrations too, already applied on their own turn by the loop below —
  // replaying them would re-issue their DDL against a schema that has it, and
  // die on "relation already exists".
  await sql.begin(async (tx) => {
    await migration.up(tx, sql);
    await tx`INSERT INTO ${sql(tableName)} (id) VALUES (${id})`;
  });

  runLogger.persist(
    colorize(`${SYMBOLS.success} `, COLORS.success) +
      id +
      colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
  );
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

export const up = async (config?: { databaseUrl?: string; tableName?: string }): Promise<void> => {
  const options = readOptions();
  const tableName = config?.tableName || "migrations";
  const databaseUrl = config?.databaseUrl || Bun.env.DATABASE_URL;
  const migrations = getMigrations();

  if (migrations.length === 0 && !options.drop) {
    logNoMigrationsAndExit();
  }

  const sql = buildSqlClient(databaseUrl);

  if (options.drop) {
    await handleDrop(sql);
  }

  if (migrations.length === 0) {
    await handleEmptyMigrations(sql);
  }

  await createMigrationTable(sql, tableName);

  // The `migrations` table is the only record of what has been applied. Every
  // run asks the database rather than a cache, so a schema reset or a rollback
  // done out of band is always seen.
  for (const migration of migrations) {
    const id = migration.getVersion();
    const entities = await sql`SELECT * FROM ${sql(tableName)} WHERE id = ${id}`;

    if (entities.length > 0) {
      continue;
    }

    const startedAt = performance.now();
    try {
      await runMigration(sql, migration, tableName);
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

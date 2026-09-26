import type { SQL } from "bun";
import type { IMigrationDatabase, IMigrationDataSource } from "./types";

/**
 * Fingerprint of the database a run targets.
 *
 * A URL wins, because that is the connection string Postgres is opened with. Otherwise the
 * dialect and database name (or sqlite file) keep two databases from sharing a cache entry.
 */
export const databaseIdentity = (source: IMigrationDataSource): string => {
  const { type, url, database } = source.options;

  if (url) {
    return url;
  }

  if (database) {
    return `${type}:${database}`;
  }

  return type;
};

export type MigrationConnectionType = {
  sql: SQL;
  /** Returns the pool. A timeout force-closes a failed run instead of waiting out a stuck connection. */
  close: (timeout?: number) => Promise<void>;
};

/** Opens the database's pool. The caller closes it when the run finishes. */
export const openMigrationDatabase = async (source: IMigrationDataSource): Promise<MigrationConnectionType> => {
  if (!source.isInitialized) {
    await source.initialize();
  }

  return {
    sql: source.client,
    close: async (timeout?: number) => {
      if (!source.isInitialized) {
        return;
      }

      if (timeout !== undefined) {
        await source.client.close({ timeout });
        source.isInitialized = false;

        return;
      }

      await source.destroy();
    },
  };
};

/** The data source `database.getSource()` returns for this run. */
export const migrationSource = (database: IMigrationDatabase, name?: string): IMigrationDataSource => {
  if (name === undefined) {
    return database.getSource();
  }

  return database.getSource(name);
};

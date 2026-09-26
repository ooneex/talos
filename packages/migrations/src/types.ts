import type { SQL, TransactionSQL } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type MigrationClassType = new (...args: any[]) => IMigration;

export interface IMigration {
  up: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  down: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  getVersion: () => string;
  getDependencies: () => Promise<MigrationClassType[]> | MigrationClassType[];
}

/**
 * The connection a migration run borrows from an application database.
 *
 * `getSource()` builds it; `initialize()` opens the pool and `client` is the Bun SQL handle the
 * statements run on. Postgres and SQLite data sources both satisfy this.
 */
export interface IMigrationDataSource {
  readonly options: {
    readonly type: string;
    readonly url?: string;
    readonly database?: string;
  };
  isInitialized: boolean;
  readonly client: SQL;
  initialize: () => Promise<unknown>;
  destroy: () => Promise<void>;
}

/** An application database, such as `MainDatabase`, that can open the connection migrations run against. */
export interface IMigrationDatabase {
  getSource: (name?: string) => IMigrationDataSource;
}

/** What `up` and `down` need to reach the database they change. */
export type MigrationConfigType = {
  database: IMigrationDatabase;
  /** Forwarded to `database.getSource()` when that database takes a connection name or file path. */
  name?: string;
  tableName?: string;
  cacheDir?: string;
};

export type MigrationDownConfigType = MigrationConfigType & {
  version?: string;
};

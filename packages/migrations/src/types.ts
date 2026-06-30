import type { SQL, TransactionSQL } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type MigrationClassType = new (...args: any[]) => IMigration;

export interface IMigration {
  up: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  down: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  getVersion: () => string;
  getDependencies: () => Promise<MigrationClassType[]> | MigrationClassType[];
}

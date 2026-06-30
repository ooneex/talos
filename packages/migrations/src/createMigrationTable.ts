import type { SQL } from "bun";

export const createMigrationTable = async (sql: SQL, tableName: string): Promise<void> => {
  await sql.begin(async (tx) => {
    await tx`CREATE TABLE IF NOT EXISTS ${sql(tableName)} (id VARCHAR(20) PRIMARY KEY)`;
  });
};

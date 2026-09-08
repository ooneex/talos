import { type Client, type Config, createClient, type InValue } from "@libsql/client";
import type { ReservedSQL } from "bun";
import type {
  DatabaseClientType,
  DatabaseTypeType,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
  TursoDataSourceOptionsType,
} from "../../types";
import { TransactionsNotSupportedError } from "../errors";
import { AbstractSqliteDriver } from "./SqliteDriver";

const tursoValue = (value: unknown): InValue => {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    value instanceof ArrayBuffer ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return JSON.stringify(value);
};

export const tursoConfig = (options: TursoDataSourceOptionsType): Config => ({
  ...options.extra,
  url: options.url,
  ...(options.authToken !== undefined && { authToken: options.authToken }),
  ...(options.syncUrl !== undefined && { syncUrl: options.syncUrl }),
  ...(options.syncInterval !== undefined && { syncInterval: options.syncInterval }),
  ...(options.concurrency !== undefined && { concurrency: options.concurrency }),
  ...(options.timeout !== undefined && { timeout: options.timeout }),
  ...(options.intMode !== undefined && { intMode: options.intMode }),
});

/** Turso/libSQL driver using the SQLite dialect and the official TypeScript client. */
export class TursoDriver extends AbstractSqliteDriver<Client> {
  public override readonly type: DatabaseTypeType = "turso";
  public override readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;

  public override createParameter(_index: number): string {
    return "?";
  }

  public override createClient(): Client {
    return createClient(tursoConfig(this.options as TursoDataSourceOptionsType));
  }

  public override async connect(client: DatabaseClientType): Promise<void> {
    await this.afterConnect(client);
  }

  public override async disconnect(client: DatabaseClientType): Promise<void> {
    (client as Client).close();
  }

  public override async afterConnect(client: DatabaseClientType): Promise<void> {
    await (client as Client).execute("SELECT 1");
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const result = await (client as Client).execute({ sql, args: parameters.map(tursoValue) });

    return {
      records: result.rows as unknown as Row[],
      affected: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid ?? null,
    };
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }
}

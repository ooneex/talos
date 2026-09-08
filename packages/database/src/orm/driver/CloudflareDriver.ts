import type { ReservedSQL } from "bun";
import type {
  CloudflareDataSourceOptionsType,
  CloudflareValueType,
  DatabaseClientType,
  DatabaseTypeType,
  ICloudflareDatabase,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
} from "../../types";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../errors";
import { AbstractSqliteDriver } from "./SqliteDriver";

const cloudflareValue = (value: unknown): CloudflareValueType => {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof ArrayBuffer
  ) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
  }

  if (typeof value === "bigint") {
    const number = Number(value);

    if (Number.isSafeInteger(number)) {
      return number;
    }

    throw new DriverFeatureNotSupportedError("cloudflare", "BigInt values outside JavaScript's safe integer range");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
};

/** Cloudflare Worker database binding driver using the SQLite dialect. */
export class CloudflareDriver extends AbstractSqliteDriver<ICloudflareDatabase> {
  public override readonly type: DatabaseTypeType = "cloudflare";
  public override readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;

  public override createParameter(index: number): string {
    return `?${index + 1}`;
  }

  public override createClient(): ICloudflareDatabase {
    return (this.options as CloudflareDataSourceOptionsType).client;
  }

  public override async connect(client: DatabaseClientType): Promise<void> {
    await this.afterConnect(client);
  }

  public override async disconnect(_client: DatabaseClientType): Promise<void> {}

  public override async afterConnect(client: DatabaseClientType): Promise<void> {
    await (client as ICloudflareDatabase).prepare("SELECT 1").run();
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const prepared = (client as ICloudflareDatabase).prepare(sql);
    const statement = parameters.length > 0 ? prepared.bind(...parameters.map(cloudflareValue)) : prepared;
    const result = await statement.run<Row>();
    const records = result.results ?? [];

    return {
      records,
      affected: result.meta?.changes ?? records.length,
      lastInsertRowid: result.meta?.last_row_id ?? null,
    };
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }
}

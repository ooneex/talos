import { RedisClient, type RedisOptions, type ReservedSQL } from "bun";
import type {
  DatabaseClientType,
  DatabaseTypeType,
  ObjectLiteralType,
  QueryResultType,
  RedisDataSourceOptionsType,
  TransactionIsolationLevelType,
} from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../errors";
import type { QueryRunner } from "../QueryRunner";
import { AbstractDriver } from "./AbstractDriver";

const REDIS_DELETE_BATCH_SIZE = 1_000;

const redisArgument = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value ?? "");
};

/** Bun-native RESP driver for Redis, Valkey and Dragonfly. */
export class RedisDriver extends AbstractDriver {
  public readonly type: DatabaseTypeType = "redis";
  public readonly supportsReturning = false;
  public readonly supportsIlike = false;
  public readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;
  public readonly supportsCreateIndexIfNotExists = false;
  public override readonly supportsIndexes = false;
  public override readonly supportsUniqueConstraints = false;
  public override readonly supportsForeignKeys = false;

  public normalizeType(_column: ColumnMetadata): string {
    return this.unsupported("relational column types");
  }

  public generatedColumnDefinition(_column: ColumnMetadata): string | undefined {
    return this.unsupported("generated relational columns");
  }

  public isInlinePrimaryKey(_column: ColumnMetadata): boolean {
    return this.unsupported("relational primary keys");
  }

  public currentTimestamp(): string {
    return this.unsupported("SQL timestamp expressions");
  }

  public buildLimitOffset(_limit?: number, _offset?: number): string {
    return this.unsupported("SQL pagination");
  }

  public buildCountDistinct(_expressions: string[]): string {
    return this.unsupported("SQL aggregates");
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }

  public createClient(): RedisClient {
    const options = this.options as RedisDataSourceOptionsType;
    const redisOptions: RedisOptions = {
      ...(options.connectionTimeout !== undefined && { connectionTimeout: options.connectionTimeout }),
      ...(options.idleTimeout !== undefined && { idleTimeout: options.idleTimeout }),
      ...(options.autoReconnect !== undefined && { autoReconnect: options.autoReconnect }),
      ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
      ...(options.enableOfflineQueue !== undefined && { enableOfflineQueue: options.enableOfflineQueue }),
      ...(options.enableAutoPipelining !== undefined && { enableAutoPipelining: options.enableAutoPipelining }),
      ...(options.tls !== undefined && { tls: options.tls }),
    };

    return new RedisClient(options.url, redisOptions);
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    command: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    if (/\s/.test(command)) {
      throw new DriverFeatureNotSupportedError(this.type, "SQL queries");
    }

    const result: unknown = await (client as RedisClient).send(command, parameters.map(redisArgument));
    const records = result === null ? [] : Array.isArray(result) ? (result as Row[]) : [result as Row];

    return {
      records,
      affected: typeof result === "number" ? result : records.length,
      lastInsertRowid: null,
    };
  }

  public async afterConnect(_client: DatabaseClientType): Promise<void> {}

  public async listTables(runner: QueryRunner): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";

    do {
      const result = await runner.query<string | string[]>("SCAN", [cursor, "COUNT", REDIS_DELETE_BATCH_SIZE]);
      const nextCursor = result.records[0];
      const batch = result.records[1];

      cursor = typeof nextCursor === "string" ? nextCursor : "0";

      if (Array.isArray(batch)) {
        keys.push(...batch);
      }
    } while (cursor !== "0");

    return keys;
  }

  public async dropAllTables(runner: QueryRunner, keys: string[]): Promise<void> {
    for (let index = 0; index < keys.length; index += REDIS_DELETE_BATCH_SIZE) {
      await runner.query("DEL", keys.slice(index, index + REDIS_DELETE_BATCH_SIZE));
    }
  }

  private unsupported(feature: string): never {
    throw new DriverFeatureNotSupportedError(this.type, feature);
  }
}

import { type ClickHouseClient, type ClickHouseClientConfigOptions, createClient } from "@clickhouse/client";
import type { ReservedSQL } from "bun";
import type {
  ClickHouseDataSourceOptionsType,
  DatabaseClientType,
  DatabaseTypeType,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
} from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../errors";
import type { QueryRunner } from "../QueryRunner";
import { AbstractDriver, typeName } from "./AbstractDriver";

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  int: "Int32",
  int2: "Int16",
  int4: "Int32",
  int8: "Int64",
  integer: "Int32",
  tinyint: "Int8",
  smallint: "Int16",
  mediumint: "Int32",
  bigint: "Int64",
  serial: "Int32",
  bigserial: "Int64",
  rowid: "Int64",
  bool: "Bool",
  boolean: "Bool",
  float: "Float64",
  float4: "Float32",
  float8: "Float64",
  double: "Float64",
  "double precision": "Float64",
  real: "Float64",
  date: "Date",
  datetime: "DateTime64(3)",
  datetime2: "DateTime64(3)",
  datetimeoffset: "DateTime64(3)",
  timestamp: "DateTime64(3)",
  timestamptz: "DateTime64(3)",
  "timestamp with time zone": "DateTime64(3)",
  "timestamp without time zone": "DateTime64(3)",
  "timestamp with local time zone": "DateTime64(3)",
  uuid: "UUID",
  json: "JSON",
  jsonb: "JSON",
  "simple-json": "String",
  "simple-array": "String",
  enum: "String",
  "simple-enum": "String",
  bytea: "String",
  blob: "String",
  tinyblob: "String",
  mediumblob: "String",
  longblob: "String",
  binary: "String",
  varbinary: "String",
};

const STRING_TYPES: ReadonlySet<string> = new Set([
  "string",
  "text",
  "tinytext",
  "mediumtext",
  "longtext",
  "citext",
  "varchar",
  "varchar2",
  "nvarchar",
  "nvarchar2",
  "character varying",
  "varying character",
  "char varying",
  "character",
  "native character",
  "char",
  "nchar",
  "national varchar",
  "national char",
  "fixedstring",
]);

const RESULT_QUERY = /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN|EXISTS)\b/i;
const UPDATE_QUERY = /^\s*UPDATE\s+(.+?)\s+SET\s+/i;
const DELETE_QUERY = /^\s*DELETE\s+FROM\s+(.+?)\s+WHERE\s+/i;
const SQL_TOKEN_PATTERN =
  /('(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|\\.|[^`\\])*`|--[^\r\n]*|\/\*[\s\S]*?\*\/)|\$(\d+)/g;
const LEADING_COMMENTS = /^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)+/;

type BoundQueryType = { query: string; queryParams: Record<string, unknown> };

const clickHouseParameterType = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "Nullable(String)";
  }

  if (typeof value === "boolean") {
    return "Bool";
  }

  if (typeof value === "bigint") {
    return value < 0n ? "Int64" : "UInt64";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? "Int64" : "Float64";
  }

  if (value instanceof Date) {
    return "DateTime64(3)";
  }

  if (Array.isArray(value)) {
    const member = value.find((item) => item !== null && item !== undefined);

    return `Array(${clickHouseParameterType(member)})`;
  }

  return "String";
};

const clickHouseParameterValue = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").replace("Z", "");
  }

  if (Array.isArray(value)) {
    return value.map(clickHouseParameterValue);
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
};

export const bindClickHouseParameters = (sql: string, parameters: unknown[] = []): BoundQueryType => {
  const queryParams: Record<string, unknown> = {};
  const query = sql.replace(
    SQL_TOKEN_PATTERN,
    (placeholder, quoted: string | undefined, rawIndex: string | undefined) => {
      if (quoted !== undefined || rawIndex === undefined) {
        return placeholder;
      }

      const index = Number(rawIndex) - 1;

      if (index < 0 || index >= parameters.length) {
        return placeholder;
      }

      const key = `p${index + 1}`;
      const value = parameters[index];

      queryParams[key] = clickHouseParameterValue(value);

      return `{${key}:${clickHouseParameterType(value)}}`;
    },
  );

  return { query, queryParams };
};

const mutationQuery = (sql: string): string => {
  if (UPDATE_QUERY.test(sql)) {
    return sql.replace(UPDATE_QUERY, "ALTER TABLE $1 UPDATE ");
  }

  if (DELETE_QUERY.test(sql)) {
    return sql.replace(DELETE_QUERY, "ALTER TABLE $1 DELETE WHERE ");
  }

  return sql;
};

const returnsRows = (sql: string): boolean => RESULT_QUERY.test(sql.replace(LEADING_COMMENTS, ""));

export class ClickHouseDriver extends AbstractDriver {
  public readonly type: DatabaseTypeType = "clickhouse";
  public readonly supportsReturning = false;
  public readonly supportsIlike = true;
  public readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;
  public readonly supportsCreateIndexIfNotExists = false;
  public override readonly supportsIndexes = false;
  public override readonly supportsUniqueConstraints = false;
  public override readonly supportsForeignKeys = false;

  public normalizeType(column: ColumnMetadata): string {
    const name = typeName(column.type);
    let base: string;

    if (column.type === Number) {
      base = "Int32";
    } else if (column.type === String) {
      base = "String";
    } else if (column.type === Boolean) {
      base = "Bool";
    } else if (column.type === Date) {
      base = "DateTime64(3)";
    } else if (name === "decimal" || name === "numeric" || name === "dec" || name === "fixed") {
      base = `Decimal(${column.precision ?? 18},${column.scale ?? 2})`;
    } else {
      base = TYPE_ALIASES[name] ?? (STRING_TYPES.has(name) ? "String" : name);
    }

    if (column.isArray) {
      return `Array(${base})`;
    }

    return column.isNullable ? `Nullable(${base})` : base;
  }

  public generatedColumnDefinition(column: ColumnMetadata): string | undefined {
    if (column.generationStrategy === "uuid") {
      return "UUID DEFAULT generateUUIDv4()";
    }

    return column.isGenerated ? this.normalizeType(column) : undefined;
  }

  public isInlinePrimaryKey(_column: ColumnMetadata): boolean {
    return false;
  }

  public currentTimestamp(): string {
    return "now64(3)";
  }

  public buildLimitOffset(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return "";
    }

    return `LIMIT ${limit ?? 18446744073709551615n}${offset !== undefined ? ` OFFSET ${offset}` : ""}`;
  }

  public buildCountDistinct(expressions: string[]): string {
    return expressions.length === 1 ? `uniqExact(${expressions[0]})` : `uniqExact(tuple(${expressions.join(", ")}))`;
  }

  public override ignoreConflictClause(): string {
    return "";
  }

  public override upsertClause(
    _tablePath: string,
    _conflictColumns: string[],
    _updateColumns: string[],
    _skipUpdateIfNoValuesChanged?: boolean,
  ): string {
    throw new DriverFeatureNotSupportedError(this.type, "upserts");
  }

  public override get supportsDefaultValues(): boolean {
    return false;
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }

  public override tableSuffix(primaryColumns: string[]): string {
    const orderBy =
      primaryColumns.length > 0 ? `(${primaryColumns.map((column) => this.escape(column)).join(", ")})` : "tuple()";

    return `ENGINE = MergeTree ORDER BY ${orderBy}`;
  }

  public createClient(): ClickHouseClient {
    const options = this.options as ClickHouseDataSourceOptionsType;
    const config: ClickHouseClientConfigOptions = { ...options.extra };

    config.url = options.url ?? config.url ?? "http://localhost:8123";
    config.username = options.username ?? config.username ?? "default";
    config.password = options.password ?? config.password ?? "";
    config.database = options.database ?? config.database ?? "default";

    if (options.requestTimeoutMS !== undefined) {
      config.request_timeout = options.requestTimeoutMS;
    }

    if (options.poolSize !== undefined) {
      config.max_open_connections = options.poolSize;
    }

    if (options.compression !== undefined) {
      config.compression = options.compression;
    }

    if (options.clickhouseSettings !== undefined) {
      config.clickhouse_settings = options.clickhouseSettings;
    }

    return createClient(config);
  }

  public override async connect(client: DatabaseClientType): Promise<void> {
    await this.afterConnect(client);
  }

  public async afterConnect(client: DatabaseClientType): Promise<void> {
    const result = await (client as ClickHouseClient).ping({ select: true });

    if (!result.success) {
      throw result.error;
    }
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const clickhouse = client as ClickHouseClient;
    const transformed = mutationQuery(sql);
    const { query, queryParams } = bindClickHouseParameters(transformed, parameters);

    if (returnsRows(query)) {
      const result = await clickhouse.query({ query, format: "JSONEachRow", query_params: queryParams });
      const records = await result.json<Row>();

      return { records, affected: records.length, lastInsertRowid: null };
    }

    const result = await clickhouse.command({
      query,
      query_params: queryParams,
      ...(transformed !== sql ? { clickhouse_settings: { mutations_sync: "1" } } : {}),
    });

    return {
      records: [],
      affected: Number(result.summary?.written_rows ?? 0),
      lastInsertRowid: null,
    };
  }

  public async listTables(runner: QueryRunner): Promise<string[]> {
    const result = await runner.query<{ name: string }>(
      "SELECT name FROM system.tables WHERE database = currentDatabase() AND is_temporary = 0",
    );

    return result.records.map((row) => row.name);
  }

  public async dropAllTables(runner: QueryRunner, tableNames: string[]): Promise<void> {
    for (const tableName of tableNames) {
      await runner.query(`DROP TABLE IF EXISTS ${this.escape(tableName)}`);
    }
  }

  protected override prepareDate(value: Date): unknown {
    return value.toISOString().replace("T", " ").replace("Z", "");
  }
}

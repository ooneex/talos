import type { ReservedSQL, SQL } from "bun";
import type {
  DatabaseClientType,
  DatabaseTypeType,
  DataSourceOptionsType,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
} from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import type { QueryRunner } from "../QueryRunner";
import { isBooleanType, isDateTimeType, isDateType, isIntegerType, isJsonType, isNumericType } from "./columnTypes";

/** What a database driver exposes to the data source, builders, schema tool and hydration layer. */
export interface IDriver {
  readonly type: DatabaseTypeType;
  readonly options: DataSourceOptionsType;
  /** `INSERT ... RETURNING` is available. */
  readonly supportsReturning: boolean;
  /** A native case-insensitive `ILIKE` exists. */
  readonly supportsIlike: boolean;
  /** Connections can be reserved out of the pool for imperative transactions. */
  readonly supportsReservedConnections: boolean;
  readonly supportsTransactions: boolean;
  readonly supportsCreateIndexIfNotExists: boolean;
  readonly supportsIndexes: boolean;
  readonly supportsUniqueConstraints: boolean;
  readonly supportsForeignKeys: boolean;
  /** How many values one statement should bind at most; multi-row statements are split to stay below it. */
  readonly maxBoundParameters: number;
  escape: (identifier: string) => string;
  escapePath: (tableName: string, schema?: string | undefined) => string;
  createParameter: (index: number) => string;
  /** A cast suffix (`::jsonb`) a bound value needs for the column, empty when none is needed. */
  parameterCast: (column?: ColumnMetadata) => string;
  /** Converts an entity value into what Bun can bind for this database. */
  prepareParameter: (value: unknown, column?: ColumnMetadata) => unknown;
  /** Converts a raw database value into the entity property value. */
  hydrateValue: (value: unknown, column: ColumnMetadata) => unknown;
  normalizeType: (column: ColumnMetadata) => string;
  normalizeDefault: (column: ColumnMetadata) => string | undefined;
  /** Full type clause of a generated primary column (`SERIAL`, `INTEGER PRIMARY KEY AUTOINCREMENT`, ...). */
  generatedColumnDefinition: (column: ColumnMetadata) => string | undefined;
  /** Whether `generatedColumnDefinition` already declares the primary key inline. */
  isInlinePrimaryKey: (column: ColumnMetadata) => boolean;
  currentTimestamp: () => string;
  buildIlike: (left: string, right: string) => string;
  buildLimitOffset: (limit?: number, offset?: number) => string;
  buildCountDistinct: (expressions: string[]) => string;
  insertKeyword: (ignoreConflicts: boolean) => string;
  ignoreConflictClause: () => string;
  /** The `ON CONFLICT ... DO UPDATE` / `ON DUPLICATE KEY UPDATE` tail of an upsert; identifiers escaped. */
  upsertClause: (
    tablePath: string,
    conflictColumns: string[],
    updateColumns: string[],
    skipUpdateIfNoValuesChanged?: boolean,
  ) => string;
  /** Whether `INSERT INTO t DEFAULT VALUES` is the way to insert a row of defaults. */
  readonly supportsDefaultValues: boolean;
  /** Whether the `DEFAULT` keyword may stand in for a value inside `VALUES (...)`. */
  readonly supportsDefaultKeyword: boolean;
  truncateStatement: (tablePath: string) => string;
  /** The statements that open a transaction at the requested isolation level. */
  beginTransactionStatements: (isolationLevel?: TransactionIsolationLevelType) => string[];
  tableSuffix: (primaryColumns: string[]) => string;
  createClient: () => DatabaseClientType;
  connect: (client: DatabaseClientType) => Promise<void>;
  disconnect: (client: DatabaseClientType) => Promise<void>;
  query: <Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters?: unknown[],
  ) => Promise<QueryResultType<Row>>;
  afterConnect: (client: DatabaseClientType) => Promise<void>;
  listTables: (runner: QueryRunner) => Promise<string[]>;
  dropAllTables: (runner: QueryRunner, tableNames: string[]) => Promise<void>;
}

/** SQLite's `CURRENT_TIMESTAMP` and MySQL's `DATETIME` come back without a zone; they are UTC. */
const ZONELESS_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

export { typeName } from "./columnTypes";

export const isBooleanColumn = (column: ColumnMetadata): boolean => isBooleanType(column.type);
export const isDateTimeColumn = (column: ColumnMetadata): boolean => isDateTimeType(column.type);
export const isDateColumn = (column: ColumnMetadata): boolean => isDateType(column.type);
export const isJsonColumn = (column: ColumnMetadata): boolean => isJsonType(column.type);
export const isIntegerColumn = (column: ColumnMetadata): boolean => isIntegerType(column.type);
export const isNumericColumn = (column: ColumnMetadata): boolean => isNumericType(column.type);

export const toDate = (value: unknown): unknown => {
  if (value instanceof Date || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    return ZONELESS_DATETIME.test(value) ? new Date(`${value.replace(" ", "T")}Z`) : new Date(value);
  }

  return value;
};

export const toDateString = (value: unknown): unknown => {
  if (!(value instanceof Date)) {
    return value;
  }

  return value.toISOString().slice(0, 10);
};

export const toBoolean = (value: unknown): unknown => {
  if (value === null || value === undefined || typeof value === "boolean") {
    return value;
  }

  return value === 1 || value === "1" || value === "t" || value === "true" || value === 1n;
};

export const parseJson = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Shared behaviour of every dialect. Subclasses fill in the identifiers, the DDL vocabulary and the
 * Bun client configuration.
 */
export abstract class AbstractDriver implements IDriver {
  public abstract readonly type: DatabaseTypeType;
  public abstract readonly supportsReturning: boolean;
  public abstract readonly supportsIlike: boolean;
  public abstract readonly supportsReservedConnections: boolean;
  public readonly supportsTransactions: boolean = true;
  public abstract readonly supportsCreateIndexIfNotExists: boolean;
  public readonly supportsIndexes: boolean = true;
  public readonly supportsUniqueConstraints: boolean = true;
  public readonly supportsForeignKeys: boolean = true;
  /**
   * Network databases are round-trip bound, so statements are made as large as the protocol comfortably
   * allows (PostgreSQL and MySQL accept 65535 values).
   */
  public readonly maxBoundParameters: number = 16000;

  public constructor(public readonly options: DataSourceOptionsType) {}

  public abstract normalizeType(column: ColumnMetadata): string;
  public abstract generatedColumnDefinition(column: ColumnMetadata): string | undefined;
  public abstract isInlinePrimaryKey(column: ColumnMetadata): boolean;
  public abstract currentTimestamp(): string;
  public abstract buildLimitOffset(limit?: number, offset?: number): string;
  public abstract buildCountDistinct(expressions: string[]): string;
  public abstract createClient(): DatabaseClientType;
  public abstract afterConnect(client: DatabaseClientType): Promise<void>;
  public abstract listTables(runner: QueryRunner): Promise<string[]>;
  public abstract dropAllTables(runner: QueryRunner, tableNames: string[]): Promise<void>;

  public escape(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  public escapePath(tableName: string, schema?: string | undefined): string {
    return schema ? `${this.escape(schema)}.${this.escape(tableName)}` : this.escape(tableName);
  }

  public createParameter(index: number): string {
    return `$${index + 1}`;
  }

  public parameterCast(_column?: ColumnMetadata): string {
    return "";
  }

  public prepareParameter(value: unknown, column?: ColumnMetadata): unknown {
    const transformed = column ? column.transformTo(value) : value;

    if (transformed === undefined || transformed === null) {
      return null;
    }

    if (transformed instanceof Date) {
      return column && isDateColumn(column) ? toDateString(transformed) : this.prepareDate(transformed);
    }

    if (
      typeof transformed === "string" ||
      typeof transformed === "number" ||
      typeof transformed === "bigint" ||
      typeof transformed === "boolean" ||
      transformed instanceof Uint8Array
    ) {
      return transformed;
    }

    if (Array.isArray(transformed)) {
      if (column?.type === "simple-array") {
        return transformed.join(",");
      }

      // An array bound to a JSON column is a document; anywhere else it is a database array.
      return column && !column.isArray ? JSON.stringify(transformed) : this.prepareArray(transformed);
    }

    return JSON.stringify(transformed);
  }

  public hydrateValue(value: unknown, column: ColumnMetadata): unknown {
    let hydrated: unknown = value === undefined ? null : value;

    if (hydrated !== null) {
      switch (column.hydrationKind) {
        case "array":
          hydrated = this.hydrateArray(hydrated, column);
          break;
        case "boolean":
          hydrated = toBoolean(hydrated);
          break;
        case "datetime":
          hydrated = toDate(hydrated);
          break;
        case "date":
          hydrated = toDateString(hydrated);
          break;
        case "json":
          hydrated = parseJson(hydrated);
          break;
        case "simple-array":
          hydrated = typeof hydrated === "string" ? (hydrated === "" ? [] : hydrated.split(",")) : hydrated;
          break;
        case "integer":
          if (typeof hydrated === "string" && Number.isSafeInteger(Number(hydrated))) {
            hydrated = Number(hydrated);
          }
          break;
        default:
          break;
      }
    }

    return column.transformers.length === 0 ? hydrated : column.transformFrom(hydrated);
  }

  public normalizeDefault(column: ColumnMetadata): string | undefined {
    const value = column.default;

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "function") {
      return String((value as () => unknown)());
    }

    if (value === null) {
      return "NULL";
    }

    if (typeof value === "boolean") {
      return this.booleanLiteral(value);
    }

    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }

    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  public buildIlike(left: string, right: string): string {
    return this.supportsIlike ? `${left} ILIKE ${right}` : `LOWER(${left}) LIKE LOWER(${right})`;
  }

  public insertKeyword(_ignoreConflicts: boolean): string {
    return "INSERT INTO";
  }

  public ignoreConflictClause(): string {
    return "ON CONFLICT DO NOTHING";
  }

  public upsertClause(
    tablePath: string,
    conflictColumns: string[],
    updateColumns: string[],
    skipUpdateIfNoValuesChanged = false,
  ): string {
    if (updateColumns.length === 0) {
      return `ON CONFLICT (${conflictColumns.join(", ")}) DO NOTHING`;
    }

    const assignments = updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ");
    const guard = skipUpdateIfNoValuesChanged
      ? ` WHERE ${updateColumns.map((column) => this.isDistinctFrom(`${tablePath}.${column}`, `EXCLUDED.${column}`)).join(" OR ")}`
      : "";

    return `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${assignments}${guard}`;
  }

  public get supportsDefaultValues(): boolean {
    return true;
  }

  public get supportsDefaultKeyword(): boolean {
    return true;
  }

  /** Null-safe inequality. */
  protected isDistinctFrom(left: string, right: string): string {
    return `${left} IS DISTINCT FROM ${right}`;
  }

  public truncateStatement(tablePath: string): string {
    return `TRUNCATE TABLE ${tablePath}`;
  }

  public beginTransactionStatements(isolationLevel?: TransactionIsolationLevelType): string[] {
    return [`START TRANSACTION${isolationLevel ? ` ISOLATION LEVEL ${isolationLevel}` : ""}`];
  }

  public tableSuffix(_primaryColumns: string[]): string {
    return "";
  }

  public async connect(client: DatabaseClientType): Promise<void> {
    await (client as SQL).connect();
    await this.afterConnect(client);
  }

  public async disconnect(client: DatabaseClientType): Promise<void> {
    await client.close();
  }

  public async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const result = (await (client as SQL | ReservedSQL).unsafe(sql, parameters as never)) as BunResultType;

    return normalizeBunResult<Row>(result);
  }

  protected booleanLiteral(value: boolean): string {
    return value ? "true" : "false";
  }

  protected prepareDate(value: Date): unknown {
    return value;
  }

  protected prepareArray(values: unknown[]): unknown {
    return JSON.stringify(values);
  }

  protected hydrateArray(value: unknown, column: ColumnMetadata): unknown {
    let items = typeof value === "string" ? parseJson(value) : value;

    // Bun decodes PostgreSQL integer arrays into typed arrays; entities hold plain arrays.
    if (ArrayBuffer.isView(items) && !(items instanceof DataView)) {
      items = Array.from(items as unknown as ArrayLike<unknown>);
    }

    if (!Array.isArray(items)) {
      return items;
    }

    if (isBooleanColumn(column)) {
      return items.map(toBoolean);
    }

    if (isDateTimeColumn(column)) {
      return items.map(toDate);
    }

    if (isNumericColumn(column)) {
      return items.map((item) => (typeof item === "string" && item !== "" ? Number(item) : item));
    }

    return items;
  }

  /** The `LENGTH`, `(precision, scale)` and `[]` suffixes shared by every dialect. */
  protected typeSuffix(column: ColumnMetadata, base: string): string {
    let type = base;

    if (column.length !== undefined && column.length !== "") {
      type += `(${column.length})`;
    } else if (column.precision !== undefined && column.precision !== null && column.scale !== undefined) {
      type += `(${column.precision},${column.scale})`;
    } else if (column.precision !== undefined && column.precision !== null) {
      type += `(${column.precision})`;
    }

    return type;
  }
}

type BunResultType = unknown[] & {
  count?: number | null;
  command?: string | null;
  lastInsertRowid?: number | bigint | null;
  affectedRows?: number | null;
};

const WRITE_COMMANDS: ReadonlySet<string> = new Set(["INSERT", "UPDATE", "DELETE"]);

const normalizeBunResult = <Row>(result: BunResultType): QueryResultType<Row> => {
  const records = (Array.isArray(result) ? result : Array.from(result)) as Row[];
  const command = result.command ?? "";
  const affected = WRITE_COMMANDS.has(command)
    ? (result.affectedRows ?? result.count ?? records.length)
    : records.length;

  return {
    records,
    affected: Number(affected ?? 0),
    lastInsertRowid: result.lastInsertRowid ?? null,
  };
};

import { SQL } from "bun";
import type { DatabaseTypeType, MysqlDataSourceOptionsType, TransactionIsolationLevelType } from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import type { QueryRunner } from "../QueryRunner";
import { AbstractDriver, typeName } from "./AbstractDriver";

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  integer: "int",
  int4: "int",
  int2: "smallint",
  int8: "bigint",
  boolean: "tinyint",
  bool: "tinyint",
  timestamptz: "datetime",
  timestamp: "datetime",
  "timestamp with time zone": "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with local time zone": "datetime",
  datetime2: "datetime",
  datetimeoffset: "datetime",
  uuid: "varchar",
  jsonb: "json",
  "simple-json": "text",
  "simple-array": "text",
  "simple-enum": "varchar",
  "character varying": "varchar",
  character: "char",
  "double precision": "double",
  numeric: "decimal",
  number: "decimal",
  real: "double",
  bytea: "blob",
  citext: "text",
  serial: "int",
  bigserial: "bigint",
  rowid: "int",
  string: "varchar",
};

const DEFAULT_LENGTHS: Readonly<Record<string, string>> = {
  varchar: "255",
  char: "1",
  binary: "1",
  varbinary: "255",
};

export class MysqlDriver extends AbstractDriver {
  public readonly type: DatabaseTypeType;
  public readonly supportsReturning = false;
  public readonly supportsIlike = false;
  public readonly supportsReservedConnections = true;
  public readonly supportsCreateIndexIfNotExists = false;

  public constructor(options: MysqlDataSourceOptionsType) {
    super(options);
    this.type = options.type;
  }

  public override escape(identifier: string): string {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }

  public normalizeType(column: ColumnMetadata): string {
    const name = typeName(column.type);
    let base: string;

    if (column.type === Number) {
      base = "int";
    } else if (column.type === String) {
      base = "varchar";
    } else if (column.type === Boolean) {
      base = "tinyint";
    } else if (column.type === Date) {
      base = "datetime";
    } else if (name === "enum" && column.enum) {
      return `enum(${column.enum.map((member) => `'${String(member).replace(/'/g, "''")}'`).join(", ")})`;
    } else {
      base = TYPE_ALIASES[name] ?? name;
    }

    if (column.isArray) {
      return "json";
    }

    if (name === "boolean" || name === "bool" || column.type === Boolean) {
      return "tinyint(1)";
    }

    if (name === "uuid") {
      return "varchar(36)";
    }

    if (base === "datetime" && column.precision === undefined) {
      return "datetime(6)";
    }

    if (column.length === undefined && DEFAULT_LENGTHS[base]) {
      return `${base}(${DEFAULT_LENGTHS[base]})`;
    }

    return this.typeSuffix(column, base);
  }

  public generatedColumnDefinition(column: ColumnMetadata): string | undefined {
    switch (column.generationStrategy) {
      case "increment":
      case "rowid":
      case "identity":
        return `${typeName(column.type) === "bigint" ? "bigint" : "int"} AUTO_INCREMENT`;
      case "uuid":
        return "varchar(36)";
      default:
        return undefined;
    }
  }

  public isInlinePrimaryKey(_column: ColumnMetadata): boolean {
    return false;
  }

  public currentTimestamp(): string {
    return "CURRENT_TIMESTAMP(6)";
  }

  public buildLimitOffset(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return "";
    }

    // MySQL refuses OFFSET without LIMIT; the maximum unsigned bigint means no limit.
    return `LIMIT ${limit ?? "18446744073709551615"}${offset !== undefined ? ` OFFSET ${offset}` : ""}`;
  }

  public buildCountDistinct(expressions: string[]): string {
    return `COUNT(DISTINCT ${expressions.join(", ")})`;
  }

  public override insertKeyword(ignoreConflicts: boolean): string {
    return ignoreConflicts ? "INSERT IGNORE INTO" : "INSERT INTO";
  }

  public override ignoreConflictClause(): string {
    return "";
  }

  public override beginTransactionStatements(isolationLevel?: TransactionIsolationLevelType): string[] {
    return isolationLevel
      ? [`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`, "START TRANSACTION"]
      : ["START TRANSACTION"];
  }

  /** MySQL picks the conflicting unique key itself; the conflict columns are not part of the syntax. */
  public override upsertClause(_tablePath: string, _conflictColumns: string[], updateColumns: string[]): string {
    if (updateColumns.length === 0) {
      return "";
    }

    return `ON DUPLICATE KEY UPDATE ${updateColumns.map((column) => `${column} = VALUES(${column})`).join(", ")}`;
  }

  public override get supportsDefaultValues(): boolean {
    return false;
  }

  public createClient(): SQL {
    const options = this.options as MysqlDataSourceOptionsType;
    const extra = { ...options.extra };

    return new SQL({
      adapter: "mysql",
      ...(options.url
        ? { url: options.url }
        : {
            hostname: options.host ?? "localhost",
            port: options.port ?? 3306,
            username: options.username ?? "root",
            password: options.password ?? "",
            database: options.database ?? "mysql",
          }),
      max: options.poolSize ?? (extra.max as number | undefined) ?? 10,
      ...(options.connectTimeoutMS !== undefined && { connectionTimeout: Math.ceil(options.connectTimeoutMS / 1000) }),
      ...(options.ssl !== undefined && { tls: options.ssl }),
      ...(options.bigint !== undefined && { bigint: options.bigint }),
      ...extra,
    } as ConstructorParameters<typeof SQL>[0]);
  }

  public async afterConnect(_client: SQL): Promise<void> {}

  public async listTables(runner: QueryRunner): Promise<string[]> {
    const result = await runner.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );

    return result.records.map((row) => row.name);
  }

  public async dropAllTables(runner: QueryRunner, tableNames: string[]): Promise<void> {
    await runner.query("SET FOREIGN_KEY_CHECKS = 0");

    try {
      for (const tableName of tableNames) {
        await runner.query(`DROP TABLE IF EXISTS ${this.escape(tableName)}`);
      }
    } finally {
      await runner.query("SET FOREIGN_KEY_CHECKS = 1");
    }
  }

  protected override booleanLiteral(value: boolean): string {
    return value ? "1" : "0";
  }
}

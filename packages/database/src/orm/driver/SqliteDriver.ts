import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SQL } from "bun";
import type {
  DatabaseClientType,
  DatabaseTypeType,
  SqliteDataSourceOptionsType,
  TransactionIsolationLevelType,
} from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import type { QueryRunner } from "../QueryRunner";
import { AbstractDriver, typeName } from "./AbstractDriver";

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  timestamptz: "datetime",
  timestamp: "datetime",
  "timestamp with time zone": "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with local time zone": "datetime",
  datetime2: "datetime",
  datetimeoffset: "datetime",
  uuid: "varchar",
  json: "text",
  jsonb: "text",
  "simple-json": "text",
  "simple-array": "text",
  "simple-enum": "varchar",
  enum: "varchar",
  bytea: "blob",
  "character varying": "varchar",
  "double precision": "double",
  bool: "boolean",
  serial: "integer",
  bigserial: "integer",
  rowid: "integer",
  string: "varchar",
};

const MEMORY = ":memory:";

/** Strips the `sqlite://`, `sqlite:` and `file:` prefixes Bun also understands, leaving a bare path. */
export const sqliteFilename = (database: string): string => {
  const stripped = database.replace(/^(sqlite|file):(\/\/)?/, "");

  return stripped === "" || stripped === MEMORY ? MEMORY : stripped;
};

export class SqliteDriver extends AbstractDriver {
  public readonly type: DatabaseTypeType = "sqlite";
  public readonly supportsReturning = true;
  public readonly supportsIlike = false;
  public readonly supportsReservedConnections = false;
  public readonly supportsCreateIndexIfNotExists = true;
  /**
   * SQLite compiles every new statement text and the cost grows with the number of values, while short
   * statements of a fixed shape repeat their text and come out of the statement cache. Around a hundred
   * values per statement measured fastest by a wide margin.
   */
  public override readonly maxBoundParameters: number = 100;

  public normalizeType(column: ColumnMetadata): string {
    const name = typeName(column.type);
    let base: string;

    if (column.type === Number) {
      base = "integer";
    } else if (column.type === String) {
      base = "varchar";
    } else if (column.type === Boolean) {
      base = "boolean";
    } else if (column.type === Date) {
      base = "datetime";
    } else {
      base = TYPE_ALIASES[name] ?? name;
    }

    // Arrays and JSON are stored as text; SQLite has no native type for either.
    return column.isArray ? "text" : this.typeSuffix(column, base);
  }

  public generatedColumnDefinition(column: ColumnMetadata): string | undefined {
    switch (column.generationStrategy) {
      case "increment":
      case "rowid":
      case "identity":
        return "integer PRIMARY KEY AUTOINCREMENT";
      case "uuid":
        return "varchar(36)";
      default:
        return undefined;
    }
  }

  public isInlinePrimaryKey(column: ColumnMetadata): boolean {
    return column.isGenerated && column.generationStrategy !== "uuid";
  }

  public currentTimestamp(): string {
    return "CURRENT_TIMESTAMP";
  }

  public buildLimitOffset(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return "";
    }

    // SQLite refuses OFFSET without LIMIT; -1 means no limit.
    return `LIMIT ${limit ?? -1}${offset !== undefined ? ` OFFSET ${offset}` : ""}`;
  }

  public buildCountDistinct(expressions: string[]): string {
    return `COUNT(DISTINCT ${expressions.join(" || '|' || ")})`;
  }

  public override truncateStatement(tablePath: string): string {
    return `DELETE FROM ${tablePath}`;
  }

  /** SQLite transactions are always serializable; the requested level is accepted and ignored. */
  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    return ["BEGIN"];
  }

  public createClient(): SQL {
    const options = this.options as SqliteDataSourceOptionsType;
    const filename = sqliteFilename(options.database);

    if (filename !== MEMORY) {
      mkdirSync(dirname(filename), { recursive: true });
    }

    return new SQL({
      adapter: "sqlite",
      filename,
      readonly: options.readonly ?? false,
      create: true,
      ...options.extra,
    });
  }

  public async afterConnect(client: DatabaseClientType): Promise<void> {
    const options = this.options as SqliteDataSourceOptionsType;
    const busyTimeout = options.busyTimeout ?? options.timeout;
    const sql = client as SQL;

    if (options.foreignKeys !== false) {
      await sql.unsafe("PRAGMA foreign_keys = ON");
    }

    if (options.enableWAL && sqliteFilename(options.database) !== MEMORY) {
      await sql.unsafe("PRAGMA journal_mode = WAL");
    }

    if (busyTimeout !== undefined) {
      await sql.unsafe(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyTimeout))}`);
    }
  }

  public async listTables(runner: QueryRunner): Promise<string[]> {
    const result = await runner.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );

    return result.records.map((row) => row.name);
  }

  public async dropAllTables(runner: QueryRunner, tableNames: string[]): Promise<void> {
    await runner.query("PRAGMA foreign_keys = OFF");

    try {
      for (const tableName of tableNames) {
        await runner.query(`DROP TABLE IF EXISTS ${this.escape(tableName)}`);
      }
    } finally {
      await runner.query("PRAGMA foreign_keys = ON");
    }
  }

  public override get supportsDefaultKeyword(): boolean {
    return false;
  }

  protected override booleanLiteral(value: boolean): string {
    return value ? "1" : "0";
  }

  protected override prepareDate(value: Date): unknown {
    return value.toISOString();
  }

  protected override isDistinctFrom(left: string, right: string): string {
    return `${left} IS NOT ${right}`;
  }
}

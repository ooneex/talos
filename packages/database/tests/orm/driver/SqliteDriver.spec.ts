import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SQL } from "bun";
import type { ColumnType } from "../../../src";
import { SqliteDriver, sqliteFilename } from "../../../src/orm/driver/SqliteDriver";
import { createSqliteDataSource } from "../../fixtures/entities";
import { fakeColumn } from "../../fixtures/metadata";

const driver = new SqliteDriver({ type: "sqlite", database: ":memory:" });

/** The single value a `PRAGMA name` query reports (its column is not always called `name`). */
const pragma = async (client: SQL, name: string): Promise<unknown> => {
  const rows = (await client.unsafe(`PRAGMA ${name}`)) as Record<string, unknown>[];

  return Object.values(rows[0] ?? {})[0];
};

describe("sqliteFilename", () => {
  test("should strip the URL prefixes Bun accepts and normalise the memory database", () => {
    expect(sqliteFilename("sqlite://var/db.sqlite")).toBe("var/db.sqlite");
    expect(sqliteFilename("sqlite:var/db.sqlite")).toBe("var/db.sqlite");
    expect(sqliteFilename("file:///tmp/db.sqlite")).toBe("/tmp/db.sqlite");
    expect(sqliteFilename("/tmp/db.sqlite")).toBe("/tmp/db.sqlite");
    expect(sqliteFilename(":memory:")).toBe(":memory:");
    expect(sqliteFilename("sqlite://:memory:")).toBe(":memory:");
    expect(sqliteFilename("")).toBe(":memory:");
  });
});

describe("SqliteDriver", () => {
  test("should describe its capabilities", () => {
    expect(driver.type).toBe("sqlite");
    expect(driver.supportsReturning).toBe(true);
    expect(driver.supportsIlike).toBe(false);
    expect(driver.supportsReservedConnections).toBe(false);
    expect(driver.supportsCreateIndexIfNotExists).toBe(true);
    expect(driver.supportsDefaultValues).toBe(true);
    expect(driver.supportsDefaultKeyword).toBe(false);
  });

  test("normalizeType should map constructors, aliases and arrays onto SQLite storage classes", () => {
    expect(driver.normalizeType(fakeColumn({ type: Number }))).toBe("integer");
    expect(driver.normalizeType(fakeColumn({ type: String }))).toBe("varchar");
    expect(driver.normalizeType(fakeColumn({ type: Boolean }))).toBe("boolean");
    expect(driver.normalizeType(fakeColumn({ type: Date }))).toBe("datetime");
    expect(driver.normalizeType(fakeColumn({ type: "timestamptz" }))).toBe("datetime");
    expect(driver.normalizeType(fakeColumn({ type: "uuid" }))).toBe("varchar");
    expect(driver.normalizeType(fakeColumn({ type: "jsonb" }))).toBe("text");
    expect(driver.normalizeType(fakeColumn({ type: "bytea" }))).toBe("blob");
    expect(driver.normalizeType(fakeColumn({ type: "double precision" }))).toBe("double");
    expect(driver.normalizeType(fakeColumn({ type: "varchar", length: 20 }))).toBe("varchar(20)");
    expect(driver.normalizeType(fakeColumn({ type: "decimal", precision: 5, scale: 2 }))).toBe("decimal(5,2)");
    expect(driver.normalizeType(fakeColumn({ type: "integer", array: true }))).toBe("text");
    expect(driver.normalizeType(fakeColumn({ type: "custom" as ColumnType }))).toBe("custom");
  });

  test("generatedColumnDefinition should inline the autoincrement primary key", () => {
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "increment"))).toBe(
      "integer PRIMARY KEY AUTOINCREMENT",
    );
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "rowid"))).toBe(
      "integer PRIMARY KEY AUTOINCREMENT",
    );
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "identity"))).toBe(
      "integer PRIMARY KEY AUTOINCREMENT",
    );
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "uuid"))).toBe("varchar(36)");
    expect(driver.generatedColumnDefinition(fakeColumn({}))).toBeUndefined();

    expect(driver.isInlinePrimaryKey(fakeColumn({}, "regular", "increment"))).toBe(true);
    expect(driver.isInlinePrimaryKey(fakeColumn({}, "regular", "uuid"))).toBe(false);
    expect(driver.isInlinePrimaryKey(fakeColumn({ primary: true }))).toBe(false);
  });

  test("should write the SQLite flavour of the shared clauses", () => {
    expect(driver.currentTimestamp()).toBe("CURRENT_TIMESTAMP");
    expect(driver.buildLimitOffset()).toBe("");
    expect(driver.buildLimitOffset(10)).toBe("LIMIT 10");
    expect(driver.buildLimitOffset(10, 5)).toBe("LIMIT 10 OFFSET 5");
    expect(driver.buildLimitOffset(undefined, 5)).toBe("LIMIT -1 OFFSET 5");
    expect(driver.buildCountDistinct(['"a"'])).toBe('COUNT(DISTINCT "a")');
    expect(driver.buildCountDistinct(['"a"', '"b"'])).toBe(`COUNT(DISTINCT "a" || '|' || "b")`);
    expect(driver.truncateStatement('"t"')).toBe('DELETE FROM "t"');
    expect(driver.beginTransactionStatements("SERIALIZABLE")).toEqual(["BEGIN"]);
  });

  describe("createClient / afterConnect", () => {
    const temporaryDirectories: string[] = [];

    afterEach(() => {
      for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    test("should open an in-memory database with foreign keys on and the busy timeout applied", async () => {
      const configured = new SqliteDriver({ type: "sqlite", database: ":memory:", timeout: 1234.9 });
      const client = configured.createClient();

      try {
        await configured.afterConnect(client);

        expect(await pragma(client, "foreign_keys")).toBe(1);
        expect(await pragma(client, "busy_timeout")).toBe(1234);
        expect(await pragma(client, "journal_mode")).toBe("memory");
      } finally {
        await client.close();
      }
    });

    test("should create the parent directory of a file database and switch it to WAL", async () => {
      const directory = mkdtempSync(join(tmpdir(), "talos-sqlite-"));
      temporaryDirectories.push(directory);
      const filename = join(directory, "nested", "deep", "app.sqlite");
      const configured = new SqliteDriver({
        type: "sqlite",
        database: `sqlite://${filename}`,
        enableWAL: true,
        foreignKeys: false,
        busyTimeout: 50,
      });
      const client = configured.createClient();

      try {
        await configured.afterConnect(client);

        expect(existsSync(filename)).toBe(true);
        expect(await pragma(client, "foreign_keys")).toBe(0);
        expect(await pragma(client, "journal_mode")).toBe("wal");
        expect(await pragma(client, "busy_timeout")).toBe(50);
      } finally {
        await client.close();
      }
    });
  });

  test("listTables and dropAllTables should see and remove the synchronised tables", async () => {
    const dataSource = await createSqliteDataSource();
    const runner = dataSource.createQueryRunner();

    try {
      const tables = await dataSource.driver.listTables(runner);

      expect(tables.sort()).toEqual(["post_tags", "posts", "profiles", "tags", "users"]);

      await dataSource.driver.dropAllTables(runner, tables);

      expect(await dataSource.driver.listTables(runner)).toEqual([]);
      expect((await runner.query<{ foreign_keys: number }>("PRAGMA foreign_keys")).records[0]?.foreign_keys).toBe(1);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});

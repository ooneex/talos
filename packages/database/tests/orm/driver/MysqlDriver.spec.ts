import { describe, expect, test } from "bun:test";
import type { QueryResultType } from "../../../src";
import { MysqlDriver } from "../../../src/orm/driver/MysqlDriver";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { fakeColumn } from "../../fixtures/metadata";

const driver = new MysqlDriver({ type: "mysql" });

describe("MysqlDriver", () => {
  test("should describe its capabilities and keep the mariadb type", () => {
    expect(driver.type).toBe("mysql");
    expect(new MysqlDriver({ type: "mariadb" }).type).toBe("mariadb");
    expect(driver.supportsReturning).toBe(false);
    expect(driver.supportsIlike).toBe(false);
    expect(driver.supportsReservedConnections).toBe(true);
    expect(driver.supportsCreateIndexIfNotExists).toBe(false);
    expect(driver.supportsDefaultValues).toBe(false);
    expect(driver.supportsDefaultKeyword).toBe(true);
    expect(driver.isInlinePrimaryKey(fakeColumn({}, "regular", "increment"))).toBe(false);
    expect(driver.currentTimestamp()).toBe("CURRENT_TIMESTAMP(6)");
  });

  test("should escape identifiers with backticks", () => {
    expect(driver.escape("us`ers")).toBe("`us``ers`");
    expect(driver.escapePath("users", "shop")).toBe("`shop`.`users`");
  });

  test("normalizeType should resolve MySQL types with their default lengths", () => {
    expect(driver.normalizeType(fakeColumn({ type: Number }))).toBe("int");
    expect(driver.normalizeType(fakeColumn({ type: String }))).toBe("varchar(255)");
    expect(driver.normalizeType(fakeColumn({ type: String, length: 20 }))).toBe("varchar(20)");
    expect(driver.normalizeType(fakeColumn({ type: Boolean }))).toBe("tinyint(1)");
    expect(driver.normalizeType(fakeColumn({ type: "bool" }))).toBe("tinyint(1)");
    expect(driver.normalizeType(fakeColumn({ type: Date }))).toBe("datetime(6)");
    expect(driver.normalizeType(fakeColumn({ type: "timestamptz", precision: 3 }))).toBe("datetime(3)");
    expect(driver.normalizeType(fakeColumn({ type: "uuid" }))).toBe("varchar(36)");
    expect(driver.normalizeType(fakeColumn({ type: "enum", enum: ["a", "it's"] }))).toBe("enum('a', 'it''s')");
    expect(driver.normalizeType(fakeColumn({ type: "enum" }))).toBe("enum");
    expect(driver.normalizeType(fakeColumn({ type: "text", array: true }))).toBe("json");
    expect(driver.normalizeType(fakeColumn({ type: "char" }))).toBe("char(1)");
    expect(driver.normalizeType(fakeColumn({ type: "numeric", precision: 8, scale: 2 }))).toBe("decimal(8,2)");
    expect(driver.normalizeType(fakeColumn({ type: "jsonb" }))).toBe("json");
    expect(driver.normalizeType(fakeColumn({ type: "text" }))).toBe("text");
  });

  test("generatedColumnDefinition should use AUTO_INCREMENT or a uuid varchar", () => {
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "increment"))).toBe("int AUTO_INCREMENT");
    expect(driver.generatedColumnDefinition(fakeColumn({ type: "bigint" }, "regular", "identity"))).toBe(
      "bigint AUTO_INCREMENT",
    );
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "uuid"))).toBe("varchar(36)");
    expect(driver.generatedColumnDefinition(fakeColumn({}))).toBeUndefined();
  });

  test("should write the MySQL flavour of the shared clauses", () => {
    expect(driver.buildLimitOffset()).toBe("");
    expect(driver.buildLimitOffset(5)).toBe("LIMIT 5");
    expect(driver.buildLimitOffset(5, 2)).toBe("LIMIT 5 OFFSET 2");
    expect(driver.buildLimitOffset(undefined, 2)).toBe("LIMIT 18446744073709551615 OFFSET 2");
    expect(driver.buildCountDistinct(["`a`", "`b`"])).toBe("COUNT(DISTINCT `a`, `b`)");
    expect(driver.insertKeyword(true)).toBe("INSERT IGNORE INTO");
    expect(driver.insertKeyword(false)).toBe("INSERT INTO");
    expect(driver.ignoreConflictClause()).toBe("");
    expect(driver.beginTransactionStatements()).toEqual(["START TRANSACTION"]);
    expect(driver.beginTransactionStatements("READ COMMITTED")).toEqual([
      "SET TRANSACTION ISOLATION LEVEL READ COMMITTED",
      "START TRANSACTION",
    ]);
    expect(driver.truncateStatement("`t`")).toBe("TRUNCATE TABLE `t`");
  });

  test("upsertClause should use ON DUPLICATE KEY UPDATE and ignore the conflict columns", () => {
    expect(driver.upsertClause("`t`", ["`id`"], [])).toBe("");
    expect(driver.upsertClause("`t`", ["`id`"], ["`a`", "`b`"])).toBe(
      "ON DUPLICATE KEY UPDATE `a` = VALUES(`a`), `b` = VALUES(`b`)",
    );
  });

  test("should render boolean defaults as 0 / 1", () => {
    expect(driver.normalizeDefault(fakeColumn({ default: true }))).toBe("1");
    expect(driver.normalizeDefault(fakeColumn({ default: false }))).toBe("0");
  });

  describe("createClient", () => {
    test("should default to a local root connection", () => {
      expect(driver.createClient().options).toMatchObject({
        adapter: "mysql",
        hostname: "localhost",
        port: 3306,
        username: "root",
        database: "mysql",
        max: 10,
      });
    });

    test("should honour the url and the pool, timeout, tls and bigint settings", () => {
      const client = new MysqlDriver({
        type: "mysql",
        url: "mysql://app:secret@db.example:3307/shop",
        poolSize: 3,
        connectTimeoutMS: 1200,
        ssl: true,
        bigint: true,
      }).createClient();

      expect(client.options).toMatchObject({
        hostname: "db.example",
        port: 3307,
        username: "app",
        password: "secret",
        database: "shop",
        max: 3,
        connectionTimeout: 2000,
        tls: true,
        bigint: true,
      });
    });

    test("should take the pool size from extra when no poolSize is given", () => {
      expect(new MysqlDriver({ type: "mysql", extra: { max: 2 } }).createClient().options).toMatchObject({ max: 2 });
    });
  });

  test("listTables and dropAllTables should work through the runner with foreign key checks paused", async () => {
    const queries: string[] = [];
    const runner = {
      query: async (sql: string): Promise<QueryResultType<unknown>> => {
        queries.push(sql);

        return { records: sql.startsWith("SELECT") ? [{ name: "users" }] : [], affected: 0, lastInsertRowid: null };
      },
    } as unknown as QueryRunner;

    expect(await driver.listTables(runner)).toEqual(["users"]);
    expect(queries[0]).toContain("table_schema = DATABASE()");

    await driver.dropAllTables(runner, ["users", "posts"]);

    expect(queries.slice(1)).toEqual([
      "SET FOREIGN_KEY_CHECKS = 0",
      "DROP TABLE IF EXISTS `users`",
      "DROP TABLE IF EXISTS `posts`",
      "SET FOREIGN_KEY_CHECKS = 1",
    ]);
  });
});

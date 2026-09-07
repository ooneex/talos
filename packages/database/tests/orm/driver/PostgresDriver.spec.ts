import { describe, expect, test } from "bun:test";
import type { QueryResultType } from "../../../src";
import { PostgresDriver, parsePgArray, pgArrayLiteral } from "../../../src/orm/driver/PostgresDriver";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { fakeColumn } from "../../fixtures/metadata";

const driver = new PostgresDriver({ type: "postgres" });

type RecordedQueryType = { sql: string; parameters: unknown[] };

/** A runner that records the SQL it receives and answers with canned rows. */
const recordingRunner = (records: unknown[] = []): { runner: QueryRunner; queries: RecordedQueryType[] } => {
  const queries: RecordedQueryType[] = [];
  const runner = {
    query: async (sql: string, parameters: unknown[] = []): Promise<QueryResultType<unknown>> => {
      queries.push({ sql, parameters });

      return { records, affected: 0, lastInsertRowid: null };
    },
  } as unknown as QueryRunner;

  return { runner, queries };
};

describe("pgArrayLiteral", () => {
  test("should quote text, escape quotes and backslashes and keep numbers and nulls bare", () => {
    expect(pgArrayLiteral(["a", 'b"c', "d\\e"])).toBe('{"a","b\\"c","d\\\\e"}');
    expect(pgArrayLiteral([1, 2n, null, undefined, true, false])).toBe("{1,2,NULL,NULL,t,f}");
    expect(pgArrayLiteral([new Date("2024-01-01T00:00:00.000Z")])).toBe('{"2024-01-01T00:00:00.000Z"}');
    expect(pgArrayLiteral([{ a: 1 }])).toBe('{"{\\"a\\":1}"}');
    expect(pgArrayLiteral([["x"], ["y", "z"]])).toBe('{{"x"},{"y","z"}}');
    expect(pgArrayLiteral([])).toBe("{}");
  });
});

describe("parsePgArray", () => {
  test("should undo the literal, distinguishing NULL from the quoted string", () => {
    expect(parsePgArray('{"a","b\\"c","d\\\\e"}')).toEqual(["a", 'b"c', "d\\e"]);
    expect(parsePgArray("{1,2,NULL}")).toEqual(["1", "2", null]);
    expect(parsePgArray('{"NULL",""}')).toEqual(["NULL", ""]);
    expect(parsePgArray("{}")).toEqual([]);
  });

  test("should round-trip through pgArrayLiteral", () => {
    const values = ["plain", "with,comma", 'with"quote', "with\\slash", "with}brace"];

    expect(parsePgArray(pgArrayLiteral(values))).toEqual(values);
  });
});

describe("PostgresDriver", () => {
  test("should describe its capabilities", () => {
    expect(driver.type).toBe("postgres");
    expect(driver.supportsReturning).toBe(true);
    expect(driver.supportsIlike).toBe(true);
    expect(driver.supportsReservedConnections).toBe(true);
    expect(driver.supportsCreateIndexIfNotExists).toBe(true);
    expect(driver.isInlinePrimaryKey(fakeColumn({}, "regular", "increment"))).toBe(false);
    expect(driver.currentTimestamp()).toBe("now()");
  });

  test("escapePath should fall back to the configured schema", () => {
    const scoped = new PostgresDriver({ type: "postgres", schema: "app" });

    expect(scoped.escapePath("users")).toBe('"app"."users"');
    expect(scoped.escapePath("users", "other")).toBe('"other"."users"');
    expect(driver.escapePath("users")).toBe('"users"');
  });

  test("parameterCast should cast JSON documents and arrays to the column type", () => {
    expect(driver.parameterCast(fakeColumn({ type: "jsonb" }))).toBe("::jsonb");
    expect(driver.parameterCast(fakeColumn({ type: "json" }))).toBe("::json");
    expect(driver.parameterCast(fakeColumn({ type: "simple-json" }))).toBe("");
    expect(driver.parameterCast(fakeColumn({ type: "integer", array: true }))).toBe("::integer[]");
    expect(driver.parameterCast(fakeColumn({ type: "varchar" }))).toBe("");
    expect(driver.parameterCast()).toBe("");
  });

  test("normalizeType should resolve constructors, aliases, enums and arrays", () => {
    expect(driver.normalizeType(fakeColumn({ type: Number }))).toBe("integer");
    expect(driver.normalizeType(fakeColumn({ type: String }))).toBe("character varying");
    expect(driver.normalizeType(fakeColumn({ type: Boolean }))).toBe("boolean");
    expect(driver.normalizeType(fakeColumn({ type: Date }))).toBe("timestamp without time zone");
    expect(driver.normalizeType(fakeColumn({ type: "enum", enum: ["a", "b"] }))).toBe("text");
    expect(driver.normalizeType(fakeColumn({ type: "int8" }))).toBe("bigint");
    expect(driver.normalizeType(fakeColumn({ type: "datetime" }))).toBe("timestamp without time zone");
    expect(driver.normalizeType(fakeColumn({ type: "blob" }))).toBe("bytea");
    expect(driver.normalizeType(fakeColumn({ type: "varchar", length: 10, array: true }))).toBe(
      "character varying(10)[]",
    );
    expect(driver.normalizeType(fakeColumn({ type: "uuid" }))).toBe("uuid");
  });

  test("generatedColumnDefinition should pick the serial, identity or uuid form", () => {
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "increment"))).toBe("SERIAL");
    expect(driver.generatedColumnDefinition(fakeColumn({ type: "bigint" }, "regular", "increment"))).toBe("BIGSERIAL");
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "rowid"))).toBe("SERIAL");
    expect(driver.generatedColumnDefinition(fakeColumn({ type: "smallint" }, "regular", "identity"))).toBe(
      "smallint GENERATED BY DEFAULT AS IDENTITY",
    );
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "uuid"))).toBe("uuid DEFAULT gen_random_uuid()");
    expect(driver.generatedColumnDefinition(fakeColumn({}))).toBeUndefined();
  });

  test("should write LIMIT / OFFSET independently and count distinct tuples", () => {
    expect(driver.buildLimitOffset()).toBe("");
    expect(driver.buildLimitOffset(5)).toBe("LIMIT 5");
    expect(driver.buildLimitOffset(undefined, 3)).toBe("OFFSET 3");
    expect(driver.buildLimitOffset(5, 3)).toBe("LIMIT 5 OFFSET 3");
    expect(driver.buildCountDistinct(['"a"'])).toBe('COUNT(DISTINCT "a")');
    expect(driver.buildCountDistinct(['"a"', '"b"'])).toBe('COUNT(DISTINCT ("a", "b"))');
  });

  test("should bind arrays as literals and hydrate literals back through the element rules", () => {
    expect(driver.prepareParameter([1, 2], fakeColumn({ type: "integer", array: true }))).toBe("{1,2}");
    expect(driver.hydrateValue("{1,2}", fakeColumn({ type: "integer", array: true }))).toEqual([1, 2]);
    expect(driver.hydrateValue("{t,f}", fakeColumn({ type: "boolean", array: true }))).toEqual([true, false]);
    expect(driver.hydrateValue(["already", "parsed"], fakeColumn({ type: "text", array: true }))).toEqual([
      "already",
      "parsed",
    ]);
    expect(driver.hydrateValue('["json","form"]', fakeColumn({ type: "text", array: true }))).toEqual(["json", "form"]);
  });

  describe("createClient", () => {
    test("should build the pool from discrete options with sensible defaults", () => {
      const client = new PostgresDriver({ type: "postgres" }).createClient();

      expect(client.options).toMatchObject({
        adapter: "postgres",
        hostname: "localhost",
        port: 5432,
        username: "postgres",
        database: "postgres",
        max: 10,
      });
    });

    test("should honour the url, pool size, timeouts, tls and prepare settings", () => {
      const client = new PostgresDriver({
        type: "postgres",
        url: "postgres://alice:pw@db.example:6543/shop",
        poolSize: 4,
        connectTimeoutMS: 2500,
        ssl: true,
        prepare: false,
        bigint: true,
        extra: { idleTimeoutMillis: 1500 },
      }).createClient();

      expect(client.options).toMatchObject({
        adapter: "postgres",
        hostname: "db.example",
        port: 6543,
        username: "alice",
        password: "pw",
        database: "shop",
        max: 4,
        connectionTimeout: 3000,
        idleTimeout: 2000,
        tls: true,
        prepare: false,
        bigint: true,
      });
    });

    test("should take the pool size and the legacy pg timeout names from extra", () => {
      const client = new PostgresDriver({
        type: "postgres",
        host: "db",
        port: 5433,
        username: "u",
        password: "p",
        extra: { max: 2, connectionTimeoutMillis: 1000 },
      }).createClient();

      expect(client.options).toMatchObject({
        hostname: "db",
        port: 5433,
        username: "u",
        database: "u",
        max: 2,
        connectionTimeout: 1000,
      });
    });
  });

  test("listTables should query the current schema unless one is configured", async () => {
    const { runner, queries } = recordingRunner([{ table_name: "users" }, { table_name: "posts" }]);

    expect(await driver.listTables(runner)).toEqual(["users", "posts"]);
    expect(queries[0]?.sql).toContain("table_schema = current_schema()");
    expect(queries[0]?.parameters).toEqual([]);

    const scoped = recordingRunner();
    await new PostgresDriver({ type: "postgres", schema: "app" }).listTables(scoped.runner);

    expect(scoped.queries[0]?.sql).toContain("table_schema = $1");
    expect(scoped.queries[0]?.parameters).toEqual(["app"]);
  });

  test("dropAllTables should cascade each drop within the configured schema", async () => {
    const { runner, queries } = recordingRunner();

    await new PostgresDriver({ type: "postgres", schema: "app" }).dropAllTables(runner, ["users", "posts"]);

    expect(queries.map((query) => query.sql)).toEqual([
      'DROP TABLE IF EXISTS "app"."users" CASCADE',
      'DROP TABLE IF EXISTS "app"."posts" CASCADE',
    ]);
  });
});

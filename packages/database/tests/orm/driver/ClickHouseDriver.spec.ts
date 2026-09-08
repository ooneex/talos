import { describe, expect, test } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { DatabaseClientType, QueryResultType } from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { bindClickHouseParameters, ClickHouseDriver } from "../../../src/orm/driver/ClickHouseDriver";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../../../src/orm/errors";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { fakeColumn } from "../../fixtures/metadata";

type ClientCallType = { method: "query" | "command"; options: Record<string, unknown> };

const fakeClient = (
  rows: unknown[] = [],
  writtenRows = "0",
): { client: DatabaseClientType; calls: ClientCallType[] } => {
  const calls: ClientCallType[] = [];
  const client = {
    query: async (options: Record<string, unknown>) => {
      calls.push({ method: "query", options });

      return { json: async () => rows };
    },
    command: async (options: Record<string, unknown>) => {
      calls.push({ method: "command", options });

      return { summary: { written_rows: writtenRows } };
    },
    ping: async () => ({ success: true }),
    close: async () => undefined,
  } as unknown as DatabaseClientType;

  return { client, calls };
};

type RecordedQueryType = { sql: string; parameters: unknown[] };

const recordingRunner = (records: unknown[] = []): { runner: QueryRunner; queries: RecordedQueryType[] } => {
  const queries: RecordedQueryType[] = [];
  const runner = {
    query: async (sql: string, parameters: unknown[] = []): Promise<QueryResultType<unknown>> => {
      queries.push({ sql, parameters });

      return { records, affected: records.length, lastInsertRowid: null };
    },
  } as unknown as QueryRunner;

  return { runner, queries };
};

describe("bindClickHouseParameters", () => {
  test("should translate positional placeholders into typed ClickHouse query parameters", () => {
    const date = new Date("2026-01-02T03:04:05.123Z");
    const result = bindClickHouseParameters("SELECT $1, $2, $3, $1", [42, ["a", "b"], date]);

    expect(result.query).toBe("SELECT {p1:Int64}, {p2:Array(String)}, {p3:DateTime64(3)}, {p1:Int64}");
    expect(result.queryParams).toEqual({
      p1: 42,
      p2: ["a", "b"],
      p3: "2026-01-02 03:04:05.123",
    });
  });

  test("should keep unmatched placeholders and represent null values explicitly", () => {
    expect(bindClickHouseParameters("SELECT $1, $2, '$1', \"$1\", -- $1\n$1", [undefined])).toEqual({
      query: "SELECT {p1:Nullable(String)}, $2, '$1', \"$1\", -- $1\n{p1:Nullable(String)}",
      queryParams: { p1: null },
    });
  });
});

describe("ClickHouseDriver", () => {
  const driver = new ClickHouseDriver({ type: "clickhouse" });

  test("should expose ClickHouse capabilities and type mappings", () => {
    expect(driver.type).toBe("clickhouse");
    expect(driver.supportsReturning).toBe(false);
    expect(driver.supportsTransactions).toBe(false);
    expect(driver.supportsIndexes).toBe(false);
    expect(driver.supportsUniqueConstraints).toBe(false);
    expect(driver.supportsForeignKeys).toBe(false);
    expect(driver.normalizeType(fakeColumn({ type: Number }))).toBe("Int32");
    expect(driver.normalizeType(fakeColumn({ type: "varchar", nullable: true }))).toBe("Nullable(String)");
    expect(driver.normalizeType(fakeColumn({ type: "decimal", precision: 12, scale: 4 }))).toBe("Decimal(12,4)");
    expect(driver.normalizeType(fakeColumn({ type: "integer", array: true }))).toBe("Array(Int32)");
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "uuid"))).toBe("UUID DEFAULT generateUUIDv4()");
    expect(driver.currentTimestamp()).toBe("now64(3)");
    expect(driver.buildCountDistinct(['"a"', '"b"'])).toBe('uniqExact(tuple("a", "b"))');
  });

  test("should create an official client and derive MergeTree ordering from primary columns", async () => {
    const client = new ClickHouseDriver({
      type: "clickhouse",
      url: "https://example.clickhouse.cloud:8443",
      username: "app",
      password: "secret",
      database: "analytics",
      poolSize: 4,
      requestTimeoutMS: 10_000,
    }).createClient();

    expect(typeof client.query).toBe("function");
    expect(typeof client.command).toBe("function");
    expect(driver.tableSuffix(["event_id"])).toBe('ENGINE = MergeTree ORDER BY ("event_id")');
    await client.close();
  });

  test("should consume JSONEachRow selects through the official query method", async () => {
    const { client, calls } = fakeClient([{ id: "42" }]);

    expect(await driver.query(client, "/* lookup */ SELECT id FROM events WHERE id = $1", [42])).toEqual({
      records: [{ id: "42" }],
      affected: 1,
      lastInsertRowid: null,
    });
    expect(calls).toEqual([
      {
        method: "query",
        options: {
          query: "/* lookup */ SELECT id FROM events WHERE id = {p1:Int64}",
          format: "JSONEachRow",
          query_params: { p1: 42 },
        },
      },
    ]);
  });

  test("should execute commands and translate updates and deletes into synchronous mutations", async () => {
    const update = fakeClient([], "3");
    const deletion = fakeClient([], "2");

    expect(await driver.query(update.client, 'UPDATE "events" SET "name" = $1 WHERE "id" = $2', ["new", 7])).toEqual({
      records: [],
      affected: 3,
      lastInsertRowid: null,
    });
    expect(update.calls[0]?.options).toEqual({
      query: 'ALTER TABLE "events" UPDATE "name" = {p1:String} WHERE "id" = {p2:Int64}',
      query_params: { p1: "new", p2: 7 },
      clickhouse_settings: { mutations_sync: "1" },
    });

    await driver.query(deletion.client, 'DELETE FROM "events" WHERE "id" = $1', [7]);
    expect(deletion.calls[0]?.options).toEqual({
      query: 'ALTER TABLE "events" DELETE WHERE "id" = {p1:Int64}',
      query_params: { p1: 7 },
      clickhouse_settings: { mutations_sync: "1" },
    });
  });

  test("should verify credentials on connect and surface a failed ping", async () => {
    const success = fakeClient().client;
    const failure = {
      ping: async () => ({ success: false, error: new Error("unauthorized") }),
    } as unknown as ClickHouseClient;

    await expect(driver.connect(success)).resolves.toBeUndefined();
    await expect(driver.connect(failure)).rejects.toThrow("unauthorized");
  });

  test("should initialize a data source with a shared official client and reject transactions", async () => {
    let pings = 0;
    let closes = 0;
    const client = {
      ping: async () => {
        pings += 1;

        return { success: true };
      },
      close: async () => {
        closes += 1;
      },
    } as unknown as ClickHouseClient;
    const dataSource = new DataSource({ type: "clickhouse", client, entities: [] });

    await dataSource.initialize();

    expect(dataSource.client).toBe(client);
    expect(pings).toBe(1);
    await expect(dataSource.transaction(async () => undefined)).rejects.toBeInstanceOf(TransactionsNotSupportedError);

    await dataSource.destroy();
    expect(closes).toBe(0);
  });

  test("should reject transactions and upserts explicitly", () => {
    expect(() => driver.beginTransactionStatements()).toThrow(TransactionsNotSupportedError);
    expect(() => driver.upsertClause("events", ["id"], ["name"])).toThrow(DriverFeatureNotSupportedError);
  });

  test("should list and drop tables in the current database", async () => {
    const listing = recordingRunner([{ name: "events" }, { name: "metrics" }]);
    const dropping = recordingRunner();

    expect(await driver.listTables(listing.runner)).toEqual(["events", "metrics"]);
    expect(listing.queries[0]?.sql).toContain("FROM system.tables");

    await driver.dropAllTables(dropping.runner, ["events", "metrics"]);
    expect(dropping.queries.map((item) => item.sql)).toEqual([
      'DROP TABLE IF EXISTS "events"',
      'DROP TABLE IF EXISTS "metrics"',
    ]);
  });
});

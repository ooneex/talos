import { describe, expect, test } from "bun:test";
import { RedisClient } from "bun";
import type { DatabaseClientType, QueryResultType } from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { RedisDriver } from "../../../src/orm/driver/RedisDriver";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../../../src/orm/errors";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { fakeColumn } from "../../fixtures/metadata";

type RedisCallType = { command: string; parameters: string[] };

const fakeClient = (responses: unknown[] = []): { client: RedisClient; calls: RedisCallType[] } => {
  const calls: RedisCallType[] = [];
  const client = {
    connected: false,
    connect: async () => undefined,
    close: () => undefined,
    send: async (command: string, parameters: string[]) => {
      calls.push({ command, parameters });

      return responses.shift() ?? null;
    },
  } as unknown as RedisClient;

  return { client, calls };
};

describe("RedisDriver", () => {
  const driver = new RedisDriver({ type: "redis" });

  test("should expose Redis capabilities and reject relational operations", () => {
    expect(driver.type).toBe("redis");
    expect(driver.supportsReturning).toBe(false);
    expect(driver.supportsTransactions).toBe(false);
    expect(driver.supportsIndexes).toBe(false);
    expect(driver.supportsUniqueConstraints).toBe(false);
    expect(driver.supportsForeignKeys).toBe(false);
    expect(() => driver.normalizeType(fakeColumn({}))).toThrow(DriverFeatureNotSupportedError);
    expect(() => driver.generatedColumnDefinition(fakeColumn({}))).toThrow("generated relational columns");
    expect(() => driver.isInlinePrimaryKey(fakeColumn({}))).toThrow("relational primary keys");
    expect(() => driver.currentTimestamp()).toThrow("SQL timestamp expressions");
    expect(() => driver.buildLimitOffset(1, 2)).toThrow("SQL pagination");
    expect(() => driver.buildCountDistinct(["value"])).toThrow("SQL aggregates");
    expect(() => driver.beginTransactionStatements()).toThrow(TransactionsNotSupportedError);
  });

  test("should create Bun's native client with Redis options", () => {
    const client = new RedisDriver({
      type: "redis",
      url: "rediss://localhost:6379",
      connectionTimeout: 0,
      idleTimeout: 30_000,
      autoReconnect: false,
      maxRetries: 0,
      enableOfflineQueue: false,
      enableAutoPipelining: false,
      tls: true,
    }).createClient();

    expect(client).toBeInstanceOf(RedisClient);
    expect(typeof client.get).toBe("function");
    client.close();
  });

  test("should execute raw commands and normalize native responses", async () => {
    const { client, calls } = fakeClient(["value", ["one", "two"], null, 3]);
    const date = new Date("2026-01-02T03:04:05.000Z");

    expect(await driver.query<string>(client as DatabaseClientType, "GET", ["key"])).toEqual({
      records: ["value"],
      affected: 1,
      lastInsertRowid: null,
    });
    expect(await driver.query<string>(client as DatabaseClientType, "SMEMBERS", ["set"])).toEqual({
      records: ["one", "two"],
      affected: 2,
      lastInsertRowid: null,
    });
    expect(await driver.query(client as DatabaseClientType, "GET", ["missing"])).toEqual({
      records: [],
      affected: 0,
      lastInsertRowid: null,
    });
    expect(
      await driver.query<number>(client as DatabaseClientType, "DEL", [
        date,
        new Uint8Array([65]),
        { id: 1 },
        null,
      ]),
    ).toEqual(
      {
        records: [3],
        affected: 3,
        lastInsertRowid: null,
      },
    );
    expect(calls[3]).toEqual({
      command: "DEL",
      parameters: ["2026-01-02T03:04:05.000Z", "A", '{"id":1}', ""],
    });
  });

  test("should use the shared driver connection lifecycle", async () => {
    let connects = 0;
    let closes = 0;
    const client = {
      connect: async () => {
        connects += 1;
      },
      close: () => {
        closes += 1;
      },
    } as unknown as RedisClient;

    await driver.connect(client as DatabaseClientType);
    await driver.disconnect(client as DatabaseClientType);

    expect(connects).toBe(1);
    expect(closes).toBe(1);
  });

  test("should reject SQL statements passed through the raw command API", async () => {
    const { client } = fakeClient();

    expect(driver.query(client as DatabaseClientType, "SELECT * FROM users")).rejects.toThrow(
      DriverFeatureNotSupportedError,
    );
  });

  test("should initialize a data source with a shared client and leave ownership with the caller", async () => {
    let connects = 0;
    let closes = 0;
    const deleted: string[] = [];
    const client = {
      connect: async () => {
        connects += 1;
      },
      close: () => {
        closes += 1;
      },
      send: async (command: string, parameters: string[]) => {
        if (command === "SCAN") {
          return ["0", ["session:one"]];
        }

        deleted.push(...parameters);

        return parameters.length;
      },
    } as unknown as RedisClient;
    const dataSource = new DataSource({ type: "redis", client, entities: [] });

    await dataSource.initialize();

    expect(dataSource.driver).toBeInstanceOf(RedisDriver);
    expect(dataSource.client).toBe(client);
    expect(connects).toBe(1);

    await dataSource.dropDatabase();
    expect(deleted).toEqual(["session:one"]);

    await dataSource.destroy();
    expect(closes).toBe(0);
  });

  test("should enumerate and delete keys in bounded batches", async () => {
    const queries: { command: string; parameters: unknown[] }[] = [];
    let scans = 0;
    const runner = {
      query: async (command: string, parameters: unknown[] = []): Promise<QueryResultType<string | string[]>> => {
        queries.push({ command, parameters });

        if (command === "SCAN") {
        scans += 1;

          return {
            records: scans === 1 ? ["7", ["one", "two"]] : ["0", ["three"]],
            affected: 2,
            lastInsertRowid: null,
          };
        }

        return { records: [], affected: parameters.length, lastInsertRowid: null };
      },
    } as unknown as QueryRunner;

    expect(await driver.listTables(runner)).toEqual(["one", "two", "three"]);

    const keys = Array.from({ length: 1_001 }, (_, index) => `key:${index}`);
    await driver.dropAllTables(runner, keys);

    expect(queries.map((query) => query.command)).toEqual(["SCAN", "SCAN", "DEL", "DEL"]);
    expect(queries.slice(2).map((query) => query.parameters.length)).toEqual([1_000, 1]);
  });
});

import { describe, expect, test } from "bun:test";
import type { MongoClient } from "mongodb";
import type { DatabaseClientType, QueryResultType } from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { MongoDriver } from "../../../src/orm/driver/MongoDriver";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../../../src/orm/errors";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { fakeColumn } from "../../fixtures/metadata";

type MongoCallType = { command: Record<string, unknown> };

const fakeClient = (responses: Record<string, unknown>[] = []) => {
  const calls: MongoCallType[] = [];
  const dropped: string[] = [];
  let connects = 0;
  let closes = 0;
  const database = {
    command: async (command: Record<string, unknown>) => {
      calls.push({ command });

      return responses.shift() ?? { ok: 1 };
    },
    listCollections: () => ({
      toArray: async () => [{ name: "users" }, { name: "sessions" }],
    }),
    collection: (name: string) => ({
      drop: async () => {
        dropped.push(name);
      },
    }),
  };
  const client = {
    connect: async () => {
      connects += 1;
    },
    close: async () => {
      closes += 1;
    },
    db: () => database,
  } as unknown as MongoClient;

  return { client, calls, dropped, connections: () => ({ connects, closes }) };
};

describe("MongoDriver", () => {
  const driver = new MongoDriver({ type: "mongodb", database: "app" });

  test("should expose MongoDB capabilities and reject relational operations", () => {
    expect(driver.type).toBe("mongodb");
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

  test("should create the official client with connection options", async () => {
    const client = new MongoDriver({
      type: "mongodb",
      url: "mongodb://localhost:27017/app",
      poolSize: 7,
      connectTimeoutMS: 1_500,
      extra: { maxIdleTimeMS: 2_000 },
    }).createClient();

    expect(client.options.hosts[0]?.host).toBe("localhost");
    expect(client.options.maxPoolSize).toBe(7);
    expect(client.options.connectTimeoutMS).toBe(1_500);
    expect(client.options.maxIdleTimeMS).toBe(2_000);
    await client.close();
  });

  test("should execute native commands and normalize command results", async () => {
    const { client, calls } = fakeClient([
      { ok: 1 },
      { cursor: { firstBatch: [{ name: "Ada" }] } },
      { ok: 1, modifiedCount: 2 },
    ]);

    expect(await driver.query(client as DatabaseClientType, "ping")).toEqual({
      records: [{ ok: 1 }],
      affected: 1,
      lastInsertRowid: null,
    });
    expect(await driver.query(client as DatabaseClientType, "find", ["users", { filter: { active: true } }])).toEqual({
      records: [{ name: "Ada" }],
      affected: 1,
      lastInsertRowid: null,
    });
    expect(await driver.query(client as DatabaseClientType, "update", ["users"])).toEqual({
      records: [{ ok: 1, modifiedCount: 2 }],
      affected: 2,
      lastInsertRowid: null,
    });
    expect(calls).toEqual([
      { command: { ping: 1 } },
      { command: { find: "users", filter: { active: true } } },
      { command: { update: "users" } },
    ]);
  });

  test("should reject SQL and empty commands", () => {
    const { client } = fakeClient();

    expect(driver.query(client as DatabaseClientType, "SELECT * FROM users")).rejects.toThrow(
      DriverFeatureNotSupportedError,
    );
    expect(driver.query(client as DatabaseClientType, "")).rejects.toThrow(DriverFeatureNotSupportedError);
  });

  test("should use the shared connection lifecycle", async () => {
    const binding = fakeClient();

    await driver.connect(binding.client as DatabaseClientType);
    await driver.disconnect(binding.client as DatabaseClientType);

    expect(binding.connections()).toEqual({ connects: 1, closes: 1 });
  });

  test("should enumerate and drop collections", async () => {
    const binding = fakeClient();
    const runner = {
      dataSource: { client: binding.client },
      query: async (): Promise<QueryResultType> => ({ records: [], affected: 0, lastInsertRowid: null }),
    } as unknown as QueryRunner;

    expect(await driver.listTables(runner)).toEqual(["users", "sessions"]);
    await driver.dropAllTables(runner, ["users", "sessions"]);

    expect(binding.dropped).toEqual(["users", "sessions"]);
  });

  test("should initialize with a shared client and leave ownership with the caller", async () => {
    const binding = fakeClient();
    const dataSource = new DataSource({ type: "mongodb", database: "app", client: binding.client, entities: [] });

    await dataSource.initialize();

    expect(dataSource.driver).toBeInstanceOf(MongoDriver);
    expect(dataSource.client).toBe(binding.client);
    expect(binding.connections()).toEqual({ connects: 1, closes: 0 });

    await dataSource.dropDatabase();
    expect(binding.dropped).toEqual(["users", "sessions"]);

    await dataSource.destroy();
    expect(binding.connections()).toEqual({ connects: 1, closes: 0 });
  });
});

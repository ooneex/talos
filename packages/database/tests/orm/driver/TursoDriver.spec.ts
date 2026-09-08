import { describe, expect, test } from "bun:test";
import type { Client, InStatement, ResultSet } from "@libsql/client";
import type { DatabaseClientType } from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { Column, PrimaryGeneratedColumn } from "../../../src/orm/decorators/columns";
import { Entity } from "../../../src/orm/decorators/Entity";
import { TursoDriver, tursoConfig } from "../../../src/orm/driver/TursoDriver";
import { TransactionsNotSupportedError } from "../../../src/orm/errors";
import { fakeColumn } from "../../fixtures/metadata";

@Entity("turso_users")
class TursoUser {
  @PrimaryGeneratedColumn()
  public id?: number | null;

  @Column({ type: "varchar", nullable: false })
  public name: string;
}

type TursoCallType = { sql: string; args: unknown[] };

const resultSet = (overrides: Partial<ResultSet> = {}): ResultSet =>
  ({
    columns: [],
    columnTypes: [],
    rows: [],
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
    ...overrides,
  }) as ResultSet;

const fakeClient = (results: ResultSet[] = []): { client: Client; calls: TursoCallType[]; closed: () => boolean } => {
  const calls: TursoCallType[] = [];
  let isClosed = false;
  const client = {
    execute: async (statement: InStatement) => {
      const normalized = typeof statement === "string" ? { sql: statement, args: [] } : statement;

      calls.push({ sql: normalized.sql, args: Array.isArray(normalized.args) ? normalized.args : [] });

      return results.shift() ?? resultSet();
    },
    close: () => {
      isClosed = true;
    },
  } as unknown as Client;

  return { client, calls, closed: () => isClosed };
};

describe("TursoDriver", () => {
  const driver = new TursoDriver({ type: "turso", url: ":memory:" });

  test("should expose the SQLite dialect while rejecting unsupported Talos transactions", () => {
    expect(driver.type).toBe("turso");
    expect(driver.supportsReturning).toBe(true);
    expect(driver.supportsIndexes).toBe(true);
    expect(driver.supportsForeignKeys).toBe(true);
    expect(driver.supportsTransactions).toBe(false);
    expect(driver.createParameter(0)).toBe("?");
    expect(driver.normalizeType(fakeColumn({ type: "varchar", length: 80 }))).toBe("varchar(80)");
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "increment"))).toBe(
      "integer PRIMARY KEY AUTOINCREMENT",
    );
    expect(driver.buildLimitOffset(10, 20)).toBe("LIMIT 10 OFFSET 20");
    expect(() => driver.beginTransactionStatements()).toThrow(TransactionsNotSupportedError);
  });

  test("should map Turso connection and replica options", () => {
    expect(tursoConfig({ type: "turso", url: ":memory:" })).toEqual({ url: ":memory:" });
    expect(
      tursoConfig({
        type: "turso",
        url: "libsql://app.turso.io",
        authToken: "token",
        syncUrl: "libsql://primary.turso.io",
        syncInterval: 60,
        concurrency: 10,
        timeout: 2_000,
        intMode: "bigint",
        extra: { offline: true, tls: false },
      }),
    ).toEqual({
      url: "libsql://app.turso.io",
      authToken: "token",
      syncUrl: "libsql://primary.turso.io",
      syncInterval: 60,
      concurrency: 10,
      timeout: 2_000,
      intMode: "bigint",
      offline: true,
      tls: false,
    });
  });

  test("should execute SQL and normalize libSQL parameters and results", async () => {
    const response = resultSet({
      rows: [{ id: 7, name: "Ada" }] as never,
      rowsAffected: 2,
      lastInsertRowid: 7n,
    });
    const binding = fakeClient([response]);
    const date = new Date("2026-01-02T03:04:05.000Z");
    const view = new Uint16Array([1, 2]);

    expect(
      await driver.query(binding.client as DatabaseClientType, "SELECT * FROM users", [
        undefined,
        null,
        "text",
        3,
        4n,
        true,
        date,
        new ArrayBuffer(2),
        new Uint8Array([1]),
        view,
        { role: "admin" },
      ]),
    ).toEqual({
      records: [{ id: 7, name: "Ada" }],
      affected: 2,
      lastInsertRowid: 7n,
    });
    expect(binding.calls[0]?.args).toEqual([
      null,
      null,
      "text",
      3,
      4n,
      true,
      date,
      new ArrayBuffer(2),
      new Uint8Array([1]),
      new Uint8Array(view.buffer),
      '{"role":"admin"}',
    ]);
  });

  test("should verify and close a client through the shared lifecycle", async () => {
    const binding = fakeClient();

    await driver.connect(binding.client as DatabaseClientType);
    await driver.disconnect(binding.client as DatabaseClientType);

    expect(binding.calls).toEqual([{ sql: "SELECT 1", args: [] }]);
    expect(binding.closed()).toBe(true);
  });

  test("should synchronize and use repositories with an in-memory libSQL client", async () => {
    const source = new DataSource({
      type: "turso",
      url: ":memory:",
      entities: [TursoUser],
      synchronize: true,
    });

    await source.initialize();
    const repository = source.getRepository(TursoUser);
    const user = repository.create({ name: "Ada" });

    await repository.save(user);

    expect(user.id).toBe(1);
    expect(await repository.find()).toEqual([Object.assign(new TursoUser(), { id: 1, name: "Ada" })]);
    expect(repository.createQueryBuilder("user").setLock("pessimistic_write").getQuery()).not.toContain("FOR UPDATE");

    await source.dropDatabase();
    expect(await source.driver.listTables(source.createQueryRunner())).toEqual([]);

    const client = source.client;
    await source.destroy();
    expect(client.closed).toBe(true);
  });

  test("should leave a caller-owned client open", async () => {
    const binding = fakeClient();
    const source = new DataSource({ type: "turso", url: ":memory:", client: binding.client, entities: [] });

    await source.initialize();
    await source.destroy();

    expect(binding.calls).toEqual([{ sql: "SELECT 1", args: [] }]);
    expect(binding.closed()).toBe(false);
  });
});

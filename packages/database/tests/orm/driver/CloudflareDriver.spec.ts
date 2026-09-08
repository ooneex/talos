import { describe, expect, test } from "bun:test";
import type {
  CloudflareResultType,
  CloudflareValueType,
  ICloudflareDatabase,
  ICloudflarePreparedStatement,
  QueryResultType,
} from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { CloudflareDriver } from "../../../src/orm/driver/CloudflareDriver";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../../../src/orm/errors";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
import { Column, PrimaryColumn } from "../../../src/orm/decorators/columns";
import { Entity } from "../../../src/orm/decorators/Entity";
import { fakeColumn } from "../../fixtures/metadata";

@Entity("cloudflare_users")
class CloudflareUser {
  @PrimaryColumn({ type: "integer" })
  public id = 0;

  @Column({ type: "varchar" })
  public name = "";
}

type CloudflareCallType = { sql: string; parameters: CloudflareValueType[] };

const fakeCloudflare = (
  results: CloudflareResultType<unknown>[] = [],
  resolve?: (sql: string, parameters: CloudflareValueType[]) => CloudflareResultType<unknown> | undefined,
): { client: ICloudflareDatabase; calls: CloudflareCallType[] } => {
  const calls: CloudflareCallType[] = [];
  const client: ICloudflareDatabase = {
    prepare: (sql: string): ICloudflarePreparedStatement => {
      let parameters: CloudflareValueType[] = [];
      const statement: ICloudflarePreparedStatement = {
        bind: (...values: CloudflareValueType[]) => {
          parameters = values;

          return statement;
        },
        run: async <Row>() => {
          calls.push({ sql, parameters });

          return (resolve?.(sql, parameters) ?? results.shift() ?? {
            success: true,
            results: [],
          }) as CloudflareResultType<Row>;
        },
      };

      return statement;
    },
  };

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

describe("CloudflareDriver", () => {
  const { client } = fakeCloudflare();
  const driver = new CloudflareDriver({ type: "cloudflare", client });

  test("should use the SQLite dialect with Cloudflare placeholders and transaction capabilities", () => {
    expect(driver.type).toBe("cloudflare");
    expect(driver.supportsReturning).toBe(true);
    expect(driver.supportsIlike).toBe(false);
    expect(driver.supportsReservedConnections).toBe(false);
    expect(driver.supportsTransactions).toBe(false);
    expect(driver.normalizeType(fakeColumn({ type: "varchar", length: 80 }))).toBe("varchar(80)");
    expect(driver.generatedColumnDefinition(fakeColumn({}, "regular", "increment"))).toBe(
      "integer PRIMARY KEY AUTOINCREMENT",
    );
    expect(driver.createParameter(0)).toBe("?1");
    expect(driver.createParameter(4)).toBe("?5");
    expect(driver.buildLimitOffset(10, 20)).toBe("LIMIT 10 OFFSET 20");
    expect(() => driver.beginTransactionStatements()).toThrow(TransactionsNotSupportedError);
  });

  test("should use the supplied Cloudflare binding as its client", () => {
    expect(driver.createClient()).toBe(client);
  });

  test("should verify the binding on connect and require no disconnect", async () => {
    const binding = fakeCloudflare([{ success: true, results: [{ value: 1 }] }]);
    const connected = new CloudflareDriver({ type: "cloudflare", client: binding.client });

    await connected.connect(binding.client);
    await connected.disconnect(binding.client);

    expect(binding.calls).toEqual([{ sql: "SELECT 1", parameters: [] }]);
  });

  test("should prepare, bind and normalize Cloudflare query results", async () => {
    const binding = fakeCloudflare([
      {
        success: true,
        results: [{ id: 7, name: "Ada" }],
        meta: { changes: 1, last_row_id: 7 },
      },
      { success: true, results: null },
    ]);
    const queryDriver = new CloudflareDriver({ type: "cloudflare", client: binding.client });

    expect(await queryDriver.query(binding.client, "SELECT * FROM users WHERE id = ?1", [7])).toEqual({
      records: [{ id: 7, name: "Ada" }],
      affected: 1,
      lastInsertRowid: 7,
    });
    expect(await queryDriver.query(binding.client, "DELETE FROM users")).toEqual({
      records: [],
      affected: 0,
      lastInsertRowid: null,
    });
    expect(binding.calls).toEqual([
      { sql: "SELECT * FROM users WHERE id = ?1", parameters: [7] },
      { sql: "DELETE FROM users", parameters: [] },
    ]);
  });

  test("should convert supported parameters and reject unsafe BigInts", async () => {
    const binding = fakeCloudflare([{ success: true, results: [] }]);
    const queryDriver = new CloudflareDriver({ type: "cloudflare", client: binding.client });
    const bytes = new Uint8Array([1, 2]);

    await queryDriver.query(binding.client, "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7", [
      undefined,
      true,
      bytes,
      42n,
      new Date("2026-01-02T03:04:05.000Z"),
      { role: "admin" },
      "value",
    ]);

    expect(binding.calls[0]?.parameters).toEqual([
      null,
      true,
      bytes.buffer,
      42,
      "2026-01-02T03:04:05.000Z",
      '{"role":"admin"}',
      "value",
    ]);
    expect(queryDriver.query(binding.client, "SELECT ?1", [BigInt(Number.MAX_SAFE_INTEGER) + 1n])).rejects.toThrow(
      DriverFeatureNotSupportedError,
    );
  });

  test("should use SQLite schema discovery and table deletion through the query runner", async () => {
    const listing = recordingRunner([{ name: "users" }, { name: "posts" }]);
    const dropping = recordingRunner();

    expect(await driver.listTables(listing.runner)).toEqual(["users", "posts"]);
    expect(listing.queries).toEqual([
      {
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        parameters: [],
      },
    ]);

    await driver.dropAllTables(dropping.runner, ["users", "posts"]);
    expect(dropping.queries.map((query) => query.sql)).toEqual([
      "PRAGMA foreign_keys = OFF",
      'DROP TABLE IF EXISTS "users"',
      'DROP TABLE IF EXISTS "posts"',
      "PRAGMA foreign_keys = ON",
    ]);
  });

  test("should synchronize and use repositories through DataSource without owning the Worker binding", async () => {
    const binding = fakeCloudflare([], (sql, parameters) =>
      sql.startsWith("SELECT") && sql.includes('"cloudflare_users"') && parameters.length === 0
        ? { success: true, results: [{ cloudflare_users_id: 1, cloudflare_users_name: "Ada" }] }
        : { success: true, results: [] },
    );
    const dataSource = new DataSource({
      type: "cloudflare",
      client: binding.client,
      entities: [CloudflareUser],
      synchronize: true,
    });

    await dataSource.initialize();

    expect(dataSource.driver).toBeInstanceOf(CloudflareDriver);
    expect(dataSource.client).toBe(binding.client);
    const repository = dataSource.getRepository(CloudflareUser);

    expect(await repository.find()).toEqual([Object.assign(new CloudflareUser(), { id: 1, name: "Ada" })]);
    await repository.save(Object.assign(new CloudflareUser(), { id: 2, name: "Grace" }), { reload: false });

    expect(binding.calls.some(({ sql }) => sql.includes('CREATE TABLE IF NOT EXISTS "cloudflare_users"'))).toBe(true);
    expect(binding.calls.some(({ sql }) => sql.includes('FROM "cloudflare_users" "cloudflare_users"'))).toBe(true);
    expect(binding.calls.some(({ sql }) => sql.startsWith('INSERT INTO "cloudflare_users"'))).toBe(true);

    await dataSource.destroy();
  });
});

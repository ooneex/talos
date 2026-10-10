import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import type {
  CloudflareResultType,
  CloudflareValueType,
  ICloudflareDatabase,
  ICloudflarePreparedStatement,
  QueryResultType,
} from "../../../src";
import { DatabaseException } from "../../../src/DatabaseException";
import { DataSource } from "../../../src/orm/DataSource";
import { Column, PrimaryColumn } from "../../../src/orm/decorators/columns";
import { Entity } from "../../../src/orm/decorators/Entity";
import { CloudflareDriver } from "../../../src/orm/driver/CloudflareDriver";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../../../src/orm/errors";
import type { QueryRunner } from "../../../src/orm/QueryRunner";
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

          return (resolve?.(sql, parameters) ??
            results.shift() ?? {
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

const D1_API = "https://api.cloudflare.com/client/v4/accounts/account-1/d1/database";

const apiResponse = (result: unknown): Response => Response.json({ success: true, errors: [], messages: [], result });

const apiError = (status: number, code: number, message: string): Response =>
  Response.json({ success: false, errors: [{ code, message }], messages: [], result: null }, { status });

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

describe("CloudflareDriver over the D1 HTTP API", () => {
  const settings = { type: "cloudflare", accountId: "account-1", apiToken: "token-1" } as const;
  let fetchMock: Mock<typeof fetch>;

  const respond = (...responses: Response[]): void => {
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce(response);
    }
  };

  const sentRequests = () =>
    fetchMock.mock.calls.map(([input, init]) => ({
      method: init?.method,
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    }));

  const sentRoutes = (): string[] => sentRequests().map(({ method, url }) => `${method} ${url}`);

  beforeEach(() => {
    fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected Cloudflare API request"));
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  test("should query the configured database with bearer auth and binding-compatible parameters", async () => {
    respond(apiResponse([{ success: true, results: [{ id: 7, name: "Ada" }], meta: { changes: 0, last_row_id: 7 } }]));
    const driver = new CloudflareDriver({ ...settings, databaseId: "db-1" });
    const client = driver.createClient();

    expect(
      await driver.query(client, "SELECT * FROM users WHERE id = ?1 AND active = ?2 AND avatar = ?3 AND note = ?4", [
        7,
        true,
        new Uint8Array([1, 2]),
        undefined,
      ]),
    ).toEqual({ records: [{ id: 7, name: "Ada" }], affected: 0, lastInsertRowid: 7 });
    expect(sentRequests()).toEqual([
      {
        method: "POST",
        url: `${D1_API}/db-1/query`,
        headers: { authorization: "Bearer token-1", "content-type": "application/json" },
        body: {
          sql: "SELECT * FROM users WHERE id = ?1 AND active = ?2 AND avatar = ?3 AND note = ?4",
          params: [7, 1, [1, 2], null],
        },
      },
    ]);
  });

  test("should find the database by exact name once and reuse its id", async () => {
    respond(
      apiResponse([
        { uuid: "db-staging", name: "app-staging" },
        { uuid: "db-app", name: "app" },
      ]),
      apiResponse([{ success: true, results: [] }]),
      apiResponse([{ success: true, results: [] }]),
    );
    const driver = new CloudflareDriver({ ...settings, databaseName: "app" });
    const client = driver.createClient();

    await driver.query(client, "SELECT 1");
    await driver.query(client, "SELECT 2");

    expect(sentRoutes()).toEqual([
      `GET ${D1_API}?name=app&per_page=10000`,
      `POST ${D1_API}/db-app/query`,
      `POST ${D1_API}/db-app/query`,
    ]);
  });

  test("should create a missing database once, with its jurisdiction, location hint and read replication", async () => {
    respond(
      apiResponse([{ uuid: "db-staging", name: "app-staging" }]),
      apiResponse({ uuid: "db-new", name: "app" }),
      apiResponse([{ success: true, results: [] }]),
      apiResponse([{ success: true, results: [] }]),
    );
    const driver = new CloudflareDriver({
      ...settings,
      databaseName: "app",
      jurisdiction: "eu",
      primaryLocationHint: "weur",
      readReplicationMode: "auto",
    });
    const client = driver.createClient();

    await Promise.all([driver.query(client, "SELECT 1"), driver.query(client, "SELECT 2")]);

    expect(sentRoutes()).toEqual([
      `GET ${D1_API}?name=app&per_page=10000`,
      `POST ${D1_API}`,
      `POST ${D1_API}/db-new/query`,
      `POST ${D1_API}/db-new/query`,
    ]);
    expect(sentRequests()[1]?.body).toEqual({
      name: "app",
      jurisdiction: "eu",
      primary_location_hint: "weur",
      read_replication: { mode: "auto" },
    });
  });

  test("should report Cloudflare API errors and retry a failed database lookup", async () => {
    respond(
      apiError(403, 10000, "Authentication error"),
      new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }),
      apiResponse([{ uuid: "db-app", name: "app" }]),
      apiError(400, 7500, 'near "SELEC": syntax error at offset 0: SQLITE_ERROR'),
    );
    const driver = new CloudflareDriver({ ...settings, databaseName: "app" });
    const client = driver.createClient();

    await expect(driver.query(client, "SELECT 1")).rejects.toThrow(
      "Cloudflare D1 API request failed (403): Authentication error [10000]",
    );
    await expect(driver.query(client, "SELECT 1")).rejects.toThrow(
      "Cloudflare D1 API request failed (502): Bad Gateway",
    );
    const error = await driver.query(client, "SELEC 1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DatabaseException);
    expect(error).toMatchObject({
      message: 'Cloudflare D1 API request failed (400): near "SELEC": syntax error at offset 0: SQLITE_ERROR [7500]',
      key: "CLOUDFLARE_REQUEST_FAILED",
      data: { status: 400, errors: [{ code: 7500, message: 'near "SELEC": syntax error at offset 0: SQLITE_ERROR' }] },
    });
    expect(sentRoutes()).toEqual([
      `GET ${D1_API}?name=app&per_page=10000`,
      `GET ${D1_API}?name=app&per_page=10000`,
      `GET ${D1_API}?name=app&per_page=10000`,
      `POST ${D1_API}/db-app/query`,
    ]);
  });

  test("should require a binding or complete D1 HTTP API settings", async () => {
    expect(() => new CloudflareDriver({ type: "cloudflare", accountId: "account-1" }).createClient()).toThrow(
      "Missing: apiToken, databaseId or databaseName.",
    );
    expect(() => new CloudflareDriver({ ...settings, apiToken: "" }).createClient()).toThrow(DatabaseException);
    await expect(new DataSource({ type: "cloudflare", entities: [CloudflareUser] }).initialize()).rejects.toThrow(
      "Could not connect to the cloudflare database: The cloudflare driver needs a Worker binding as client, or D1 HTTP API settings. Missing: accountId, apiToken, databaseId or databaseName.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("should initialize DataSource and run repositories over the D1 HTTP API", async () => {
    respond(
      apiResponse([{ success: true, results: [{ 1: 1 }] }]),
      apiResponse([{ success: true, results: [{ cloudflare_users_id: 1, cloudflare_users_name: "Ada" }] }]),
    );
    const dataSource = new DataSource({ ...settings, databaseId: "db-1", entities: [CloudflareUser] });

    await dataSource.initialize();

    expect(await dataSource.getRepository(CloudflareUser).find()).toEqual([
      Object.assign(new CloudflareUser(), { id: 1, name: "Ada" }),
    ]);
    await dataSource.destroy();

    expect(sentRequests().map(({ body }) => body.sql)).toEqual([
      "SELECT 1",
      expect.stringContaining('FROM "cloudflare_users" "cloudflare_users"'),
    ]);
  });
});

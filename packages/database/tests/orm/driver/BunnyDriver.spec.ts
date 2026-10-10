import { describe, expect, test } from "bun:test";
import type { Client, InStatement, ResultSet } from "@libsql/client";
import type { DatabaseClientType } from "../../../src";
import { DataSource } from "../../../src/orm/DataSource";
import { Column, PrimaryGeneratedColumn } from "../../../src/orm/decorators/columns";
import { Entity } from "../../../src/orm/decorators/Entity";
import { BunnyDriver, bunnyConfig } from "../../../src/orm/driver/BunnyDriver";
import { TransactionsNotSupportedError } from "../../../src/orm/errors";

@Entity("bunny_users")
class BunnyUser {
  @PrimaryGeneratedColumn()
  public id?: number | null;

  @Column({ type: "varchar", nullable: false })
  public name: string;
}

type HranaRequestType = { url: string; authorization: string | null; body: { requests: { type: string }[] } };

const URL = "libsql://app.lite.bunnydb.net";

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

const fakeClient = (results: ResultSet[] = []): { client: Client; sql: string[]; closed: () => boolean } => {
  const sql: string[] = [];
  let isClosed = false;
  const client = {
    execute: async (statement: InStatement) => {
      sql.push(typeof statement === "string" ? statement : statement.sql);

      return results.shift() ?? resultSet();
    },
    close: () => {
      isClosed = true;
    },
  } as unknown as Client;

  return { client, sql, closed: () => isClosed };
};

/** A Hrana-over-HTTP endpoint answering every `execute` request with the given rows. */
const fakeFetch = (rows: [number, string][]): { fetch: typeof fetch; requests: HranaRequestType[] } => {
  const requests: HranaRequestType[] = [];
  const fetchStub = async (request: Request): Promise<Response> => {
    const body = (await request.json()) as HranaRequestType["body"];

    requests.push({ url: request.url, authorization: request.headers.get("authorization"), body });

    return Response.json({
      baton: null,
      base_url: null,
      results: body.requests.map((item) =>
        item.type === "execute"
          ? {
              type: "ok",
              response: {
                type: "execute",
                result: {
                  cols: [
                    { name: "id", decltype: "integer" },
                    { name: "name", decltype: "varchar" },
                  ],
                  rows: rows.map(([id, name]) => [
                    { type: "integer", value: String(id) },
                    { type: "text", value: name },
                  ]),
                  affected_row_count: 0,
                  last_insert_rowid: null,
                },
              },
            }
          : { type: "ok", response: { type: item.type } },
      ),
    });
  };

  return { fetch: fetchStub as unknown as typeof fetch, requests };
};

describe("BunnyDriver", () => {
  const driver = new BunnyDriver({ type: "bunny", url: URL });

  test("should expose the SQLite dialect while rejecting unsupported Talos transactions", () => {
    expect(driver.type).toBe("bunny");
    expect(driver.supportsReturning).toBe(true);
    expect(driver.supportsTransactions).toBe(false);
    expect(driver.supportsReservedConnections).toBe(false);
    expect(driver.createParameter(3)).toBe("?");
    expect(() => driver.beginTransactionStatements()).toThrow(TransactionsNotSupportedError);
  });

  test("should map Bunny connection options", () => {
    expect(bunnyConfig({ type: "bunny", url: URL })).toEqual({ url: URL });
    expect(
      bunnyConfig({
        type: "bunny",
        url: URL,
        authToken: "token",
        concurrency: 5,
        intMode: "bigint",
        extra: { tls: true },
      }),
    ).toEqual({ url: URL, authToken: "token", concurrency: 5, intMode: "bigint", tls: true });
  });

  test("should create a web client that only accepts remote URLs", () => {
    const client = new BunnyDriver({ type: "bunny", url: URL, authToken: "token" }).createClient();

    expect(client.protocol).toBe("http");
    client.close();
    expect(() => new BunnyDriver({ type: "bunny", url: ":memory:" }).createClient()).toThrow(
      "URL_SCHEME_NOT_SUPPORTED",
    );
    expect(() => new BunnyDriver({ type: "bunny", url: "file:app.db" }).createClient()).toThrow(
      "URL_SCHEME_NOT_SUPPORTED",
    );
  });

  test("should send authenticated queries to the database over HTTP", async () => {
    const endpoint = fakeFetch([[1, "Ada"]]);
    const client = new BunnyDriver({
      type: "bunny",
      url: URL,
      authToken: "bunny-token",
      extra: { fetch: endpoint.fetch },
    }).createClient();

    const result = await driver.query<{ id: number; name: string }>(
      client as DatabaseClientType,
      "SELECT id, name FROM users WHERE id = ?",
      [1],
    );
    client.close();

    expect(result.records.map((row) => ({ id: row.id, name: row.name }))).toEqual([{ id: 1, name: "Ada" }]);
    expect(result.lastInsertRowid).toBeNull();
    expect(endpoint.requests[0]?.url).toBe("https://app.lite.bunnydb.net/v2/pipeline");
    expect(endpoint.requests[0]?.authorization).toBe("Bearer bunny-token");
    expect(endpoint.requests[0]?.body.requests[0]).toMatchObject({
      type: "execute",
      stmt: { sql: "SELECT id, name FROM users WHERE id = ?", args: [{ type: "float", value: 1 }] },
    });
  });

  test("should run repositories through a caller-owned client and leave it open", async () => {
    const binding = fakeClient([
      resultSet(),
      resultSet({ rows: [{ id: 4 }] as never, rowsAffected: 1, lastInsertRowid: 4n }),
    ]);
    const source = new DataSource({ type: "bunny", url: URL, client: binding.client, entities: [BunnyUser] });

    await source.initialize();
    const repository = source.getRepository(BunnyUser);
    const user = repository.create({ name: "Ada" });

    await repository.save(user);

    expect(user.id).toBe(4);
    expect(repository.createQueryBuilder("user").setLock("pessimistic_write").getQuery()).not.toContain("FOR UPDATE");
    expect(source.client).toBe(binding.client);

    await source.destroy();

    expect(binding.sql).toEqual(["SELECT 1", 'INSERT INTO "bunny_users" ("name") VALUES (?) RETURNING "id"']);
    expect(binding.closed()).toBe(false);
  });

  test("should close the client it created", async () => {
    const endpoint = fakeFetch([]);
    const source = new DataSource({ type: "bunny", url: URL, extra: { fetch: endpoint.fetch }, entities: [] });

    await source.initialize();
    const client = source.client;
    await source.destroy();

    expect(endpoint.requests).toHaveLength(1);
    expect(client.closed).toBe(true);
  });
});

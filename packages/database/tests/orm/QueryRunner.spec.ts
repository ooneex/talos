import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { IQueryLogger } from "../../src";
import type { DataSource } from "../../src/orm/DataSource";
import { EntityManager } from "../../src/orm/EntityManager";
import { QueryFailedError, QueryRunnerAlreadyReleasedError, TransactionNotStartedError } from "../../src/orm/errors";
import type { QueryRunner } from "../../src/orm/QueryRunner";
import { createSqliteDataSource, User } from "../fixtures/entities";

type LogEntryType = { kind: "query" | "error"; query: string; parameters: unknown[] | undefined };

const createLogger = (): { logger: IQueryLogger; entries: LogEntryType[] } => {
  const entries: LogEntryType[] = [];

  return {
    entries,
    logger: {
      logQuery: (query, parameters) => entries.push({ kind: "query", query, parameters }),
      logQueryError: (_error, query, parameters) => entries.push({ kind: "error", query, parameters }),
    },
  };
};

const insertUser = (runner: QueryRunner, id: string, name: string) =>
  runner.query('INSERT INTO "users" ("id", "name") VALUES ($1, $2)', [id, name]);

const countUsers = async (runner: QueryRunner): Promise<number> => {
  const result = await runner.query<{ total: number }>('SELECT COUNT(*) AS total FROM "users"');

  return result.records[0]?.total ?? -1;
};

describe("QueryRunner", () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    runner = dataSource.createQueryRunner();
  });

  afterEach(async () => {
    await runner.release();
    await dataSource.destroy();
  });

  test("should expose the data source driver and a manager bound to itself", () => {
    expect(runner.driver).toBe(dataSource.driver);
    expect(runner.manager).toBeInstanceOf(EntityManager);
    expect(runner.manager).toBe(runner.manager);
    expect(runner.manager.queryRunner).toBe(runner);
    expect(runner.data).toEqual({});
  });

  describe("query", () => {
    test("should return the rows of a select with the affected count equal to the row count", async () => {
      await insertUser(runner, "u1", "Alice");
      await insertUser(runner, "u2", "Bob");

      const result = await runner.query<{ id: string; name: string }>('SELECT "id", "name" FROM "users" ORDER BY "id"');

      expect(result.records).toEqual([
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
      ]);
      expect(result.affected).toBe(2);
      expect(result.lastInsertRowid).toBeNull();
    });

    test("should report affected rows and the last inserted rowid of writes", async () => {
      const inserted = await runner.query('INSERT INTO "posts" ("title") VALUES ($1)', ["First"]);

      expect(inserted.affected).toBe(1);
      expect(inserted.lastInsertRowid).toBe(1);
      expect(inserted.records).toEqual([]);

      await insertUser(runner, "u1", "Alice");
      await insertUser(runner, "u2", "Bob");

      const updated = await runner.query('UPDATE "users" SET "age" = $1', [40]);
      expect(updated.affected).toBe(2);

      const deleted = await runner.query('DELETE FROM "users" WHERE "id" = $1', ["u1"]);
      expect(deleted.affected).toBe(1);

      const returning = await runner.query<{ id: number }>('INSERT INTO "posts" ("title") VALUES ($1) RETURNING "id"', [
        "Second",
      ]);
      expect(returning.records).toEqual([{ id: 2 }]);
      expect(returning.affected).toBe(1);
    });

    test("should wrap driver failures in a QueryFailedError carrying the query", async () => {
      const failure = runner.query('SELECT * FROM "missing_table"').catch((error: unknown) => error);
      const error = (await failure) as QueryFailedError;

      expect(error).toBeInstanceOf(QueryFailedError);
      expect(error.query).toBe('SELECT * FROM "missing_table"');
      expect(error.message).toContain("missing_table");
      expect(error.driverError).toBeDefined();
    });

    test("should log queries only when logging is enabled and always log failures", async () => {
      const silent = createLogger();
      const silentSource = await createSqliteDataSource({ logger: silent.logger });
      const silentRunner = silentSource.createQueryRunner();

      try {
        await silentRunner.query("SELECT 1");
        await silentRunner.query("SELECT * FROM nowhere", [1]).catch(() => undefined);

        expect(silent.entries).toEqual([{ kind: "error", query: "SELECT * FROM nowhere", parameters: [1] }]);
      } finally {
        await silentRunner.release();
        await silentSource.destroy();
      }

      const verbose = createLogger();
      const verboseSource = await createSqliteDataSource({ logger: verbose.logger, logging: true });
      const verboseRunner = verboseSource.createQueryRunner();

      try {
        verbose.entries.length = 0;
        await verboseRunner.query("SELECT $1 AS value", [7]);

        expect(verbose.entries).toEqual([{ kind: "query", query: "SELECT $1 AS value", parameters: [7] }]);
      } finally {
        await verboseRunner.release();
        await verboseSource.destroy();
      }
    });

    test("should refuse to run once released", async () => {
      await runner.release();

      expect(runner.isReleased).toBe(true);
      expect(runner.query("SELECT 1")).rejects.toBeInstanceOf(QueryRunnerAlreadyReleasedError);
      expect(runner.startTransaction()).rejects.toBeInstanceOf(QueryRunnerAlreadyReleasedError);
    });
  });

  describe("transactions", () => {
    test("should commit the work done inside a transaction", async () => {
      await runner.startTransaction();
      expect(runner.isTransactionActive).toBe(true);

      await insertUser(runner, "u1", "Alice");
      await runner.commitTransaction();

      expect(runner.isTransactionActive).toBe(false);
      expect(await countUsers(runner)).toBe(1);
    });

    test("should roll back the work done inside a transaction", async () => {
      await runner.startTransaction("SERIALIZABLE");
      await insertUser(runner, "u1", "Alice");
      await runner.rollbackTransaction();

      expect(runner.isTransactionActive).toBe(false);
      expect(await countUsers(runner)).toBe(0);
    });

    test("should turn nested transactions into savepoints", async () => {
      await runner.startTransaction();
      await insertUser(runner, "u1", "Alice");

      await runner.startTransaction();
      await insertUser(runner, "u2", "Bob");
      await runner.rollbackTransaction();
      expect(runner.isTransactionActive).toBe(true);

      await runner.startTransaction();
      await insertUser(runner, "u3", "Carol");
      await runner.commitTransaction();
      expect(runner.isTransactionActive).toBe(true);

      await runner.commitTransaction();
      expect(runner.isTransactionActive).toBe(false);

      const names = await runner.query<{ name: string }>('SELECT "name" FROM "users" ORDER BY "id"');
      expect(names.records.map((row) => row.name)).toEqual(["Alice", "Carol"]);
    });

    test("should reject commit and rollback without an open transaction", async () => {
      expect(runner.commitTransaction()).rejects.toBeInstanceOf(TransactionNotStartedError);
      expect(runner.rollbackTransaction()).rejects.toBeInstanceOf(TransactionNotStartedError);
    });

    test("release should roll back an open transaction, savepoints included", async () => {
      await runner.startTransaction();
      await insertUser(runner, "u1", "Alice");
      await runner.startTransaction();
      await insertUser(runner, "u2", "Bob");

      await runner.release();
      await runner.release();

      expect(runner.isTransactionActive).toBe(false);
      expect(runner.isReleased).toBe(true);
      expect(await dataSource.query('SELECT COUNT(*) AS total FROM "users"')).toEqual([{ total: 0 }]);
    });

    test("should serialise transactions on SQLite through the data source lock", async () => {
      const other = dataSource.createQueryRunner();
      const order: string[] = [];

      try {
        await runner.startTransaction();
        order.push("first started");

        const second = other.startTransaction().then(() => order.push("second started"));

        await insertUser(runner, "u1", "Alice");
        await Promise.resolve();
        order.push("first working");
        await runner.commitTransaction();
        order.push("first committed");

        await second;
        expect(await countUsers(other)).toBe(1);
        await other.rollbackTransaction();

        expect(order).toEqual(["first started", "first working", "first committed", "second started"]);
      } finally {
        await other.release();
      }
    });

    test("should let the transactional manager see uncommitted rows and hide them after a rollback", async () => {
      await runner.startTransaction();
      await runner.manager.insert(User, { id: "u1", name: "Alice" });

      expect(await runner.manager.count(User)).toBe(1);
      expect(await dataSource.manager.count(User)).toBe(1);

      await runner.rollbackTransaction();

      expect(await dataSource.manager.count(User)).toBe(0);
    });
  });
});

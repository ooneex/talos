import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { DatabaseException } from "../../src/DatabaseException";
import { DataSource } from "../../src/orm/DataSource";
import { Column, PrimaryColumn } from "../../src/orm/decorators/columns";
import { Entity } from "../../src/orm/decorators/Entity";
import { EntityManager } from "../../src/orm/EntityManager";
import {
  CannotConnectAlreadyConnectedError,
  CannotExecuteNotConnectedError,
  EntityMetadataNotFoundError,
} from "../../src/orm/errors";
import { SnakeNamingStrategy } from "../../src/orm/NamingStrategy";
import { QueryRunner } from "../../src/orm/QueryRunner";
import { Repository } from "../../src/orm/Repository";
import {
  createSqliteDataSource,
  fixtureEntities,
  Post,
  Profile,
  seedAlice,
  sqliteOptions,
  Tag,
  User,
} from "../fixtures/entities";

@Entity("ds_orphans")
class Orphan {
  @PrimaryColumn({ type: "integer" })
  public id = 0;

  @Column({ type: "varchar" })
  public label = "";
}

class NotAnEntity {}

const userTables = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'";

describe("DataSource", () => {
  describe("construction", () => {
    test("should pick the driver, naming strategy and logging from the options", () => {
      const logger = { logQuery: () => undefined, logQueryError: () => undefined };
      const plain = new DataSource(sqliteOptions());
      const configured = new DataSource(
        sqliteOptions({ namingStrategy: new SnakeNamingStrategy(), logging: true, logger }),
      );
      const loggingWithoutLogger = new DataSource(sqliteOptions({ logging: true }));

      expect(plain.driver.type).toBe("sqlite");
      expect(plain.namingStrategy.constructor.name).toBe("DefaultNamingStrategy");
      expect(plain.logging).toBe(false);
      expect(plain.manager).toBeInstanceOf(EntityManager);
      expect(plain.isInitialized).toBe(false);
      expect(plain.entityMetadatas).toEqual([]);
      expect(configured.namingStrategy).toBeInstanceOf(SnakeNamingStrategy);
      expect(configured.logging).toBe(true);
      expect(configured.logger).toBe(logger);
      expect(loggingWithoutLogger.logging).toBe(false);
    });

    test("client should throw until initialize ran", () => {
      expect(() => new DataSource(sqliteOptions()).client).toThrow(CannotExecuteNotConnectedError);
    });
  });

  describe("initialize / destroy", () => {
    test("should build the metadata, connect and synchronize the schema", async () => {
      const dataSource = new DataSource(sqliteOptions());

      const result = await dataSource.initialize();

      try {
        expect(result).toBe(dataSource);
        expect(dataSource.isInitialized).toBe(true);
        expect(typeof dataSource.client.unsafe).toBe("function");
        expect(dataSource.entityMetadatas.map((metadata) => metadata.tableName).sort()).toEqual([
          "posts",
          "profiles",
          "tags",
          "users",
        ]);
        expect((await dataSource.query<{ name: string }>(userTables)).length).toBe(5);
      } finally {
        await dataSource.destroy();
      }

      expect(dataSource.isInitialized).toBe(false);
      expect(() => dataSource.client).toThrow(CannotExecuteNotConnectedError);
    });

    test("should refuse to initialize twice or destroy when not connected", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        await expect(dataSource.initialize()).rejects.toBeInstanceOf(CannotConnectAlreadyConnectedError);
      } finally {
        await dataSource.destroy();
      }

      await expect(dataSource.destroy()).rejects.toBeInstanceOf(CannotExecuteNotConnectedError);
    });

    test("should not create tables when synchronize is off", async () => {
      const dataSource = await createSqliteDataSource({ synchronize: false });

      try {
        expect(await dataSource.query(userTables)).toEqual([]);

        await dataSource.synchronize();
        expect((await dataSource.query(userTables)).length).toBe(5);
      } finally {
        await dataSource.destroy();
      }
    });

    test("dropSchema should clear a file database before synchronizing and synchronize(true) should reset it", async () => {
      const file = `/tmp/talos-ds-${process.pid}-${Date.now()}.sqlite`;
      const first = await createSqliteDataSource({ database: file });

      try {
        await seedAlice(first);
        expect(await first.getRepository(User).count()).toBe(1);
      } finally {
        await first.destroy();
      }

      const second = await createSqliteDataSource({ database: file, dropSchema: true });

      try {
        expect(await second.getRepository(User).count()).toBe(0);

        await seedAlice(second);
        await second.synchronize(true);
        expect(await second.getRepository(User).count()).toBe(0);
      } finally {
        await second.destroy();
        await Bun.file(file).delete();
      }
    });

    test("should wrap connection failures in a DatabaseException", async () => {
      const dataSource = new DataSource({
        type: "sqlite",
        database: "/nonexistent-dir/talos.sqlite",
        entities: fixtureEntities,
      });

      const failure = await dataSource.initialize().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DatabaseException);
      expect((failure as DatabaseException).message).toContain("Could not connect to the sqlite database");
      expect(dataSource.isInitialized).toBe(false);
    });

    test("should use and keep open a client passed through the options", async () => {
      const client = new SQL({ adapter: "sqlite", filename: ":memory:" });
      const dataSource = new DataSource(sqliteOptions({ client }));

      await dataSource.initialize();
      expect(dataSource.client).toBe(client);

      await dataSource.destroy();
      expect((await client.unsafe("SELECT 1 AS one")) as unknown[]).toEqual([{ one: 1 }]);

      await client.close();
    });

    test("should accept entities by class name or table name, once each", async () => {
      const byName = new DataSource({
        type: "sqlite",
        database: ":memory:",
        entities: ["Orphan", "ds_orphans", Orphan, "profiles", Profile],
      });

      await byName.initialize();

      try {
        expect(byName.entityMetadatas.map((metadata) => metadata.name)).toEqual(["Orphan", "Profile"]);
      } finally {
        await byName.destroy();
      }

      const unknown = new DataSource({ type: "sqlite", database: ":memory:", entities: ["Nope"] });

      await expect(unknown.initialize()).rejects.toBeInstanceOf(EntityMetadataNotFoundError);
    });

    test("should reject an entity whose relation points outside the registered set", async () => {
      // User relates to Profile and Post, which are not registered here.
      const dataSource = new DataSource({ type: "sqlite", database: ":memory:", entities: [User] });

      await expect(dataSource.initialize()).rejects.toBeInstanceOf(EntityMetadataNotFoundError);
      expect(dataSource.isInitialized).toBe(false);
    });

    test("should apply the entity prefix to every table", async () => {
      const dataSource = await createSqliteDataSource({ entityPrefix: "app_" });

      try {
        expect(dataSource.getMetadata(User).tableName).toBe("app_users");
        expect(dataSource.getMetadata(Post).findRelationWithPropertyPath("tags")?.junction?.tableName).toBe(
          "app_post_tags",
        );
        await seedAlice(dataSource);
        expect(await dataSource.query("SELECT id FROM app_users")).toEqual([{ id: "u1" }]);
      } finally {
        await dataSource.destroy();
      }
    });
  });

  describe("metadata lookup", () => {
    test("should find metadata by class, entity name or table name", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        expect(dataSource.getMetadata(User).name).toBe("User");
        expect(dataSource.getMetadata("User").tableName).toBe("users");
        expect(dataSource.getMetadata("posts").name).toBe("Post");
        expect(dataSource.hasMetadata(Tag)).toBe(true);
        expect(dataSource.hasMetadata("nothing")).toBe(false);
        expect(dataSource.hasMetadata(NotAnEntity)).toBe(false);
        expect(dataSource.hasMetadata(Orphan)).toBe(false);
        expect(() => dataSource.getMetadata(NotAnEntity)).toThrow(EntityMetadataNotFoundError);
      } finally {
        await dataSource.destroy();
      }
    });

    test("should match a class loaded twice by its decorated name", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        const Twin = class Profile {
          public id?: number;
        };

        // Not decorated: only a genuine entity registered under that name may stand in.
        expect(dataSource.hasMetadata(Twin)).toBe(false);
        expect(dataSource.getMetadata(Profile).target).toBe(Profile);
      } finally {
        await dataSource.destroy();
      }
    });
  });

  describe("factories", () => {
    test("getRepository should cache one repository per entity", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        const users = dataSource.getRepository(User);

        expect(users).toBeInstanceOf(Repository);
        expect(dataSource.getRepository(User)).toBe(users);
        expect(dataSource.getRepository("User")).toBe(users);
        expect(dataSource.getRepository(Post)).not.toBe(users);
        expect(() => dataSource.getRepository(NotAnEntity)).toThrow(EntityMetadataNotFoundError);
      } finally {
        await dataSource.destroy();
      }
    });

    test("createQueryBuilder should start from an entity or empty, optionally on a runner", async () => {
      const dataSource = await createSqliteDataSource();
      const runner = dataSource.createQueryRunner();

      try {
        expect(runner).toBeInstanceOf(QueryRunner);
        expect(dataSource.createQueryBuilder(User, "u").getQuery()).toStartWith(`SELECT "u"."id" AS "u_id"`);
        expect(dataSource.createQueryBuilder(User, "u", runner).expressionMap.mainAlias?.name).toBe("u");
        expect(dataSource.createQueryBuilder().expressionMap.mainAlias).toBeUndefined();
        expect(dataSource.createQueryBuilder(runner).expressionMap.mainAlias).toBeUndefined();
        expect(dataSource.createQueryBuilder(Post, "").expressionMap.mainAlias?.name).toBe("");
        expect(dataSource.createSchemaBuilder().createStatements().length).toBeGreaterThan(0);
      } finally {
        await runner.release();
        await dataSource.destroy();
      }
    });
  });

  describe("query", () => {
    test("should run raw SQL with positional parameters, on its own or on a given runner", async () => {
      const dataSource = await createSqliteDataSource();
      const runner = dataSource.createQueryRunner();

      try {
        await seedAlice(dataSource);

        expect(await dataSource.query<{ name: string }>("SELECT name FROM users WHERE id = $1", ["u1"])).toEqual([
          { name: "Alice" },
        ]);
        expect(await dataSource.query("SELECT COUNT(*) AS total FROM posts", [], runner)).toEqual([{ total: 2 }]);
        expect(runner.isReleased).toBe(false);
      } finally {
        await runner.release();
        await dataSource.destroy();
      }
    });

    test("should forward queries to the logger when logging is on", async () => {
      const queries: string[] = [];
      const errors: string[] = [];
      const dataSource = await createSqliteDataSource({
        logging: true,
        logger: {
          logQuery: (query) => queries.push(query),
          logQueryError: (_error, query) => errors.push(query),
        },
      });

      try {
        await dataSource.query("SELECT 1");
        await dataSource.query("SELECT * FROM missing_table").catch(() => undefined);

        expect(queries).toContain("SELECT 1");
        expect(errors).toEqual(["SELECT * FROM missing_table"]);
      } finally {
        await dataSource.destroy();
      }
    });
  });

  describe("transaction", () => {
    test("should commit the work of the transactional manager", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        const saved = await dataSource.transaction(async (manager) => {
          expect(manager).not.toBe(dataSource.manager);
          expect(manager.queryRunner?.isTransactionActive).toBe(true);

          return manager.save(Object.assign(new Tag(), { label: "tx" }));
        });

        expect(saved.id).toBe(1);
        expect(await dataSource.getRepository(Tag).count()).toBe(1);
      } finally {
        await dataSource.destroy();
      }
    });

    test("should roll back when the work throws and accept an isolation level", async () => {
      const dataSource = await createSqliteDataSource();

      try {
        await expect(
          dataSource.transaction("SERIALIZABLE", async (manager) => {
            await manager.save(Object.assign(new Tag(), { label: "doomed" }));
            throw new Error("boom");
          }),
        ).rejects.toThrow("boom");

        expect(await dataSource.getRepository(Tag).count()).toBe(0);
        expect(await dataSource.transaction("READ COMMITTED", async () => "ok")).toBe("ok");
      } finally {
        await dataSource.destroy();
      }
    });
  });
});

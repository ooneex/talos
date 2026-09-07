import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { QueryDeepPartialEntityType } from "../../../src";
import type { DataSource } from "../../../src/orm/DataSource";
import { InsertValuesMissingError } from "../../../src/orm/errors";
import { applyInsertGeneratedValues } from "../../../src/orm/query-builder/InsertQueryBuilder";
import { InsertResult } from "../../../src/orm/query-builder/results";
import { createSqliteDataSource, Post, Tag, User } from "../../fixtures/entities";
import { buildFixtureMetadatas, createDialectDataSource, fakeColumn, findMetadata } from "../../fixtures/metadata";

const sqlite = createDialectDataSource("sqlite");
const postgres = createDialectDataSource("postgres");
const mysql = createDialectDataSource("mysql");

describe("applyInsertGeneratedValues", () => {
  test("should fill uuid ids, timestamps and versions but keep values already set", () => {
    const users = findMetadata(buildFixtureMetadatas(), "User");
    const fresh: Record<string, unknown> = { id: "u1", name: "Alice" };
    const preset: Record<string, unknown> = { id: "u2", createdAt: new Date(0), version: 7 };

    applyInsertGeneratedValues(users, fresh);
    applyInsertGeneratedValues(users, preset);

    expect(fresh.createdAt).toBeInstanceOf(Date);
    expect(fresh.updatedAt).toBeInstanceOf(Date);
    expect(fresh.version).toBe(1);
    expect(fresh.deletedAt).toBeUndefined();
    expect(preset.createdAt).toEqual(new Date(0));
    expect(preset.version).toBe(7);
    expect(preset.updatedAt).toBeInstanceOf(Date);
  });

  test("should generate uuids for uuid primary columns only", () => {
    const uuidColumn = fakeColumn({ primary: true }, "regular", "uuid");
    const incrementColumn = fakeColumn({ primary: true }, "regular", "increment");
    const values: Record<string, unknown> = {};

    uuidColumn.entityMetadata.columns.push(uuidColumn);
    incrementColumn.entityMetadata.columns.push(incrementColumn);

    applyInsertGeneratedValues(uuidColumn.entityMetadata, values);
    expect(values.value).toMatch(/^[0-9a-f-]{36}$/);

    const untouched: Record<string, unknown> = {};
    applyInsertGeneratedValues(incrementColumn.entityMetadata, untouched);
    expect(untouched.value).toBeUndefined();
  });
});

describe("InsertQueryBuilder", () => {
  describe("SQL", () => {
    test("should write the insertable columns, using DEFAULT for missing values where supported", () => {
      const qb = postgres.createQueryBuilder().insert().into(User).values({ id: "u1", name: "Alice" });
      const sql = qb.getQuery();

      expect(sql).toStartWith(
        `INSERT INTO "users" ("id", "name", "is_active", "age", "settings", "roles", "secret", "created_at", "updated_at", "deleted_at", "version", "profile_id") VALUES (:orm_param_0, :orm_param_1, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT)`,
      );
      expect(sql).toEndWith(` RETURNING "id", "is_active", "age", "created_at", "updated_at", "deleted_at", "version"`);
      expect(qb.getParameters()).toEqual({ orm_param_0: "u1", orm_param_1: "Alice" });
    });

    test("should fall back to the column default or NULL where DEFAULT is not allowed", () => {
      const qb = sqlite.createQueryBuilder().insert().into(User).values({ id: "u1", name: "Alice" });

      expect(qb.getQuery()).toStartWith(
        `INSERT INTO "users" ("id", "name", "is_active", "age", "settings", "roles", "secret", "created_at", "updated_at", "deleted_at", "version", "profile_id") VALUES (:orm_param_0, :orm_param_1, :orm_param_2, :orm_param_3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      );
      expect(qb.getParameters()).toEqual({
        orm_param_0: "u1",
        orm_param_1: "Alice",
        orm_param_2: true,
        orm_param_3: 0,
      });
    });

    test("should skip generated ids unless one row provides them and inline function values", () => {
      expect(sqlite.createQueryBuilder().insert().into(Post).values({ title: "a" }).getQuery()).toStartWith(
        `INSERT INTO "posts" ("title", "views", "author_id") VALUES (:orm_param_0, :orm_param_1, NULL)`,
      );
      expect(
        sqlite
          .createQueryBuilder()
          .insert()
          .into(Post)
          .values([
            { id: 7, title: "a" },
            { title: "b", views: () => "1 + 1" },
          ])
          .getQuery(),
      ).toStartWith(
        `INSERT INTO "posts" ("id", "title", "views", "author_id") VALUES (:orm_param_0, :orm_param_1, :orm_param_2, NULL), (NULL, :orm_param_3, 1 + 1, NULL)`,
      );
    });

    test("should bind relation values through the join column", () => {
      const qb = sqlite
        .createQueryBuilder()
        .insert()
        .into(Post)
        .values({ title: "a", author: { id: "u1" } });

      expect(qb.getQuery()).toContain("VALUES (:orm_param_0, :orm_param_1, :orm_param_2)");
      expect(qb.getParameters()).toMatchObject({ orm_param_2: "u1" });
    });

    test("should honour an explicit column list, including raw names", () => {
      const sql = sqlite
        .createQueryBuilder()
        .insert()
        .into(User, ["id", "is_active", "extra"])
        .values({ id: "u1", is_active: 1, extra: "x" } as unknown as QueryDeepPartialEntityType<User>)
        .getQuery();

      expect(sql).toStartWith(
        `INSERT INTO "users" ("id", "is_active", "extra") VALUES (:orm_param_0, :orm_param_1, :orm_param_2)`,
      );
    });

    test("should insert into raw tables using every key of every row", () => {
      const sql = sqlite
        .createQueryBuilder()
        .insert()
        .into("accounts")
        .values([
          { id: 1, name: "a" },
          { id: 2, email: "b" },
        ])
        .getQuery();

      expect(sql).toBe(
        `INSERT INTO "accounts" ("id", "name", "email") VALUES (:orm_param_0, :orm_param_1, NULL), (:orm_param_2, NULL, :orm_param_3)`,
      );
    });

    test("should insert default rows when no column has a value", () => {
      expect(postgres.createQueryBuilder().insert().into("accounts").values({}).getQuery()).toBe(
        `INSERT INTO "accounts" DEFAULT VALUES`,
      );
      expect(mysql.createQueryBuilder().insert().into("accounts").values([{}, {}]).getQuery()).toBe(
        "INSERT INTO `accounts` () VALUES (), ()",
      );
      expect(postgres.createQueryBuilder().insert().into(Post).values({}).updateEntity(false).getQuery()).toBe(
        `INSERT INTO "posts" ("title", "views", "author_id") VALUES (DEFAULT, DEFAULT, DEFAULT)`,
      );
    });

    test("orIgnore and orUpdate should render the dialect's conflict clauses", () => {
      expect(postgres.createQueryBuilder().insert().into(Tag).values({ label: "a" }).orIgnore().getQuery()).toContain(
        ` ON CONFLICT DO NOTHING RETURNING "id"`,
      );
      expect(mysql.createQueryBuilder().insert().into(Tag).values({ label: "a" }).orIgnore().getQuery()).toBe(
        "INSERT IGNORE INTO `tags` (`label`) VALUES (:orm_param_0)",
      );

      const upsert = postgres
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({ id: "u1", name: "Alice" })
        .orUpdate(["name", "isActive", "profile"], ["id"], { skipUpdateIfNoValuesChanged: true })
        .getQuery();

      expect(upsert).toContain(
        ` ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "is_active" = EXCLUDED."is_active", "profile_id" = EXCLUDED."profile_id" WHERE "users"."name" IS DISTINCT FROM EXCLUDED."name" OR`,
      );
      expect(
        mysql.createQueryBuilder().insert().into(Tag).values({ label: "a" }).orUpdate(["label"], "id").getQuery(),
      ).toBe("INSERT INTO `tags` (`label`) VALUES (:orm_param_0) ON DUPLICATE KEY UPDATE `label` = VALUES(`label`)");
    });

    test("returning should accept *, properties and raw expressions, and be dropped on MySQL", () => {
      expect(
        postgres.createQueryBuilder().insert().into(User).values({ id: "u1" }).returning("*").getQuery(),
      ).toEndWith(" RETURNING *");
      expect(
        postgres.createQueryBuilder().insert().into(User).values({ id: "u1" }).returning(["isActive", "1"]).getQuery(),
      ).toEndWith(` RETURNING "is_active", 1`);
      expect(
        postgres.createQueryBuilder().insert().into(User).values({ id: "u1" }).updateEntity(false).getQuery(),
      ).not.toContain("RETURNING");
      expect(
        mysql.createQueryBuilder().insert().into(User).values({ id: "u1" }).returning("*").getQuery(),
      ).not.toContain("RETURNING");
    });

    test("should throw without a target or without values", () => {
      expect(() => sqlite.createQueryBuilder().insert().values({ a: 1 }).getQuery()).toThrow(InsertValuesMissingError);
      expect(() => sqlite.createQueryBuilder().insert().into(User).getQuery()).toThrow(InsertValuesMissingError);
      expect(() => sqlite.createQueryBuilder().insert().into(User).values([]).getQuery()).toThrow(
        InsertValuesMissingError,
      );
    });
  });

  describe("execution", () => {
    let dataSource: DataSource;

    beforeEach(async () => {
      dataSource = await createSqliteDataSource();
    });

    afterEach(async () => {
      await dataSource.destroy();
    });

    test("should write generated values back onto the value objects and report identifiers", async () => {
      const first = Object.assign(new Post(), { title: "First" });
      const second = Object.assign(new Post(), { title: "Second", views: 3 });
      const result = await dataSource.createQueryBuilder().insert().into(Post).values([first, second]).execute();

      expect(result).toBeInstanceOf(InsertResult);
      expect(result.identifiers).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.generatedMaps).toEqual([
        { id: 1, views: 0 },
        { id: 2, views: 3 },
      ]);
      expect(first.id).toBe(1);
      expect(first.views).toBe(0);
      expect(second.id).toBe(2);
      expect(result.raw).toEqual([
        { id: 1, views: 0 },
        { id: 2, views: 3 },
      ]);
    });

    test("should fill the ORM-managed columns before writing", async () => {
      const user = Object.assign(new User(), { id: "u1", name: "Alice" });
      const result = await dataSource.createQueryBuilder().insert().into(User).values(user).execute();

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.version).toBe(1);
      expect(user.isActive).toBe(true);
      expect(result.generatedMaps[0]).toMatchObject({ id: "u1", age: 0, isActive: true, version: 1, deletedAt: null });
      expect(result.generatedMaps[0]?.createdAt).toBeInstanceOf(Date);
    });

    test("updateEntity(false) should leave the value objects and identifiers alone", async () => {
      const post: Partial<Post> = { title: "Quiet" };
      const result = await dataSource
        .createQueryBuilder()
        .insert()
        .into(Post)
        .values(post)
        .updateEntity(false)
        .execute();

      expect(post.id).toBeUndefined();
      expect(result.identifiers).toEqual([]);
      expect(result.generatedMaps).toEqual([]);
      expect(result.raw).toEqual([]);
    });

    test("an explicit returning should hand the rows back raw", async () => {
      const result = await dataSource
        .createQueryBuilder()
        .insert()
        .into(Post)
        .values({ title: "Raw" })
        .returning(["id", "title"])
        .execute();

      expect(result.raw).toEqual([{ id: 1, title: "Raw" }]);
      expect(result.generatedMaps).toEqual([]);
      expect(result.identifiers).toEqual([{}]);
    });

    test("orIgnore should skip conflicting rows and orUpdate should overwrite them", async () => {
      const tags = dataSource.getRepository(Tag);
      const insert = () => dataSource.createQueryBuilder().insert().into(Tag);

      await insert().values({ label: "news" }).execute();
      await insert().values({ label: "news" }).orIgnore().execute();

      expect(await tags.count()).toBe(1);

      await insert().values({ id: 1, label: "breaking" }).orUpdate(["label"], ["id"]).execute();

      expect((await tags.findOneByOrFail({ id: 1 })).label).toBe("breaking");
      expect(insert().values({ label: "breaking" }).execute()).rejects.toThrow();
    });

    test("without RETURNING support the ids come from the rowid counter and the defaults from a reload", async () => {
      Object.defineProperty(dataSource.driver, "supportsReturning", { value: false });

      const first = Object.assign(new Post(), { title: "One" });
      const second = Object.assign(new Post(), { title: "Two" });
      const result = await dataSource.createQueryBuilder().insert().into(Post).values([first, second]).execute();

      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
      expect(first.views).toBe(0);
      expect(result.identifiers).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.generatedMaps).toEqual([{ views: 0 }, { views: 0 }]);

      const quiet: Partial<Post> = { title: "Three" };
      const silent = await dataSource
        .createQueryBuilder()
        .insert()
        .into(Post)
        .values(quiet)
        .updateEntity(false)
        .execute();

      expect(quiet.id).toBeUndefined();
      expect(silent.generatedMaps).toEqual([]);
    });
  });
});

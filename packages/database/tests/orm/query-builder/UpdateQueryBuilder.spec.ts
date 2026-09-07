import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DataSource } from "../../../src/orm/DataSource";
import { EntityPropertyNotFoundError, UpdateValuesMissingError } from "../../../src/orm/errors";
import { UpdateResult } from "../../../src/orm/query-builder/results";
import { createSqliteDataSource, Post, seedAlice, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

const sqlite = createDialectDataSource("sqlite");
const postgres = createDialectDataSource("postgres");
const mysql = createDialectDataSource("mysql");

describe("UpdateQueryBuilder", () => {
  describe("SQL", () => {
    test("should map properties to columns and add the update timestamp and version bump", () => {
      const qb = sqlite
        .createQueryBuilder()
        .update(User)
        .set({ name: "Bob", isActive: false, settings: { theme: "light" } })
        .where("id = :id", { id: "u1" });
      const sql = qb.getQuery();

      expect(sql).toBe(
        `UPDATE "users" SET "name" = :orm_param_0, "is_active" = :orm_param_1, "settings" = :orm_param_2, "updated_at" = :orm_param_3, "version" = "version" + 1 WHERE id = :id`,
      );
      expect(qb.getParameters()).toMatchObject({
        orm_param_0: "Bob",
        orm_param_1: false,
        orm_param_2: '{"theme":"light"}',
        id: "u1",
      });
      expect(qb.getParameters().orm_param_3).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("should keep explicit timestamp and version values and inline function values", () => {
      const sql = sqlite
        .createQueryBuilder()
        .update(User)
        .set({ updatedAt: new Date(0), version: 9, age: () => "age + 1", secret: undefined })
        .getQuery();

      expect(sql).toBe(`UPDATE "users" SET "updated_at" = :orm_param_0, "version" = :orm_param_1, "age" = age + 1`);
    });

    test("should assign relations through their join column", () => {
      const entity = sqlite
        .createQueryBuilder()
        .update(Post)
        .set({ author: { id: "u2" } });
      const scalar = sqlite
        .createQueryBuilder()
        .update(Post)
        .set({ author: "u3" as never });
      const cleared = sqlite.createQueryBuilder().update(Post).set({ author: null });

      expect(entity.getQuery()).toBe(`UPDATE "posts" SET "author_id" = :orm_param_0`);
      expect(entity.getParameters()).toEqual({ orm_param_0: "u2" });
      expect(scalar.getQuery()).toBe(`UPDATE "posts" SET "author_id" = :orm_param_0`);
      expect(scalar.getParameters()).toEqual({ orm_param_0: "u3" });
      expect(cleared.getQuery()).toBe(`UPDATE "posts" SET "author_id" = :orm_param_0`);
      expect(cleared.getParameters()).toEqual({ orm_param_0: null });
    });

    test("should alias the table when the alias differs from the table name", () => {
      expect(postgres.createQueryBuilder(User, "u").update({ age: 1 }).where("u.age < 1").getQuery()).toBe(
        `UPDATE "users" AS "u" SET "age" = :orm_param_0, "updated_at" = :orm_param_1, "version" = "version" + 1 WHERE "u"."age" < 1`,
      );
      expect(mysql.createQueryBuilder(Post, "p").update({ views: 1 }).getQuery()).toBe(
        "UPDATE `posts` `p` SET `views` = :orm_param_0",
      );
    });

    test("should update raw tables by column name", () => {
      const sql = sqlite
        .createQueryBuilder()
        .update("accounts")
        .set({ name: "x", skipped: undefined })
        .where({ id: 1 })
        .getQuery();

      // The where parameter is registered when where() runs, the assignment when the SQL is built.
      expect(sql).toBe(`UPDATE "accounts" SET "name" = :orm_param_1 WHERE "accounts"."id" = :orm_param_0`);
    });

    test("whereEntity should target the ids and return the generated columns", () => {
      const users = [Object.assign(new User(), { id: "u1" }), Object.assign(new User(), { id: "u2" })];
      const sql = postgres.createQueryBuilder().update(User).set({ age: 5 }).whereEntity(users).getQuery();

      expect(sql).toBe(
        `UPDATE "users" SET "age" = :orm_param_2, "updated_at" = :orm_param_3, "version" = "version" + 1 WHERE "users"."id" IN (:orm_param_0, :orm_param_1) RETURNING "id", "updated_at", "deleted_at", "version"`,
      );
    });

    test("returning should accept *, properties and raw expressions", () => {
      expect(postgres.createQueryBuilder().update(Post).set({ views: 1 }).returning("*").getQuery()).toEndWith(
        " RETURNING *",
      );
      expect(
        postgres.createQueryBuilder().update(Post).set({ views: 1 }).returning(["title", "1"]).getQuery(),
      ).toEndWith(` RETURNING "title", 1`);
      expect(mysql.createQueryBuilder().update(Post).set({ views: 1 }).returning("*").getQuery()).not.toContain(
        "RETURNING",
      );
    });

    test("should throw without a target, without values or for unknown properties", () => {
      expect(() => sqlite.createQueryBuilder().update().set({ a: 1 }).getQuery()).toThrow(UpdateValuesMissingError);
      expect(() => sqlite.createQueryBuilder().update(Post).getQuery()).toThrow(UpdateValuesMissingError);
      expect(() => sqlite.createQueryBuilder().update(Post).set({}).getQuery()).toThrow(UpdateValuesMissingError);
      expect(() =>
        sqlite
          .createQueryBuilder()
          .update(Post)
          .set({ nothing: 1 } as never)
          .getQuery(),
      ).toThrow(EntityPropertyNotFoundError);
      expect(() => sqlite.createQueryBuilder().update().whereEntity({ id: 1 })).toThrow(UpdateValuesMissingError);
    });
  });

  describe("execution", () => {
    let dataSource: DataSource;

    beforeEach(async () => {
      dataSource = await createSqliteDataSource();
      await seedAlice(dataSource);
    });

    afterEach(async () => {
      await dataSource.destroy();
    });

    test("should report affected rows and hydrate the returned columns", async () => {
      const result = await dataSource
        .createQueryBuilder()
        .update(User)
        .set({ age: 31 })
        .where({ id: "u1" })
        .returning(["id", "age", "version"])
        .execute();

      expect(result).toBeInstanceOf(UpdateResult);
      expect(result.affected).toBe(1);
      expect(result.raw).toEqual([{ id: "u1", age: 31, version: 2 }]);
      expect(result.generatedMaps).toEqual([]);

      const none = await dataSource.createQueryBuilder().update(User).set({ age: 1 }).where({ id: "nobody" }).execute();
      expect(none.affected).toBe(0);
    });

    test("whereEntity should sync the version and timestamps back onto the entities", async () => {
      const alice = await dataSource.getRepository(User).findOneByOrFail({ id: "u1" });
      const before = alice.updatedAt as Date;

      alice.updatedAt = new Date(0);

      const result = await dataSource
        .createQueryBuilder()
        .update(User)
        .set({ name: "Alicia" })
        .whereEntity(alice)
        .execute();

      expect(result.affected).toBe(1);
      expect(result.generatedMaps[0]).toMatchObject({ id: "u1", version: 2, deletedAt: null });
      expect(alice.version).toBe(2);
      expect(alice.updatedAt).toBeInstanceOf(Date);
      expect((alice.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((await dataSource.getRepository(User).findOneByOrFail({ id: "u1" })).name).toBe("Alicia");
    });

    test("updateEntity(false) should leave the entities untouched", async () => {
      const alice = Object.assign(new User(), { id: "u1", version: 1 });

      await dataSource
        .createQueryBuilder()
        .update(User)
        .set({ age: 50 })
        .whereEntity(alice)
        .updateEntity(false)
        .execute();

      expect(alice.version).toBe(1);
      expect(alice.updatedAt).toBeUndefined();
    });

    test("without RETURNING support the version is bumped locally", async () => {
      Object.defineProperty(dataSource.driver, "supportsReturning", { value: false });

      const alice = Object.assign(new User(), { id: "u1", version: 1 });
      const result = await dataSource.createQueryBuilder().update(User).set({ age: 33 }).whereEntity(alice).execute();

      expect(result.generatedMaps).toEqual([]);
      expect(alice.version).toBe(2);
      expect(alice.updatedAt).toBeInstanceOf(Date);
    });
  });
});

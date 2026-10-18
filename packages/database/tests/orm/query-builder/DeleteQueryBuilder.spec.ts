import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DataSource } from "../../../src/orm/DataSource";
import { InvalidCriteriaError } from "../../../src/orm/errors";
import { DeleteResult } from "../../../src/orm/query-builder/results";
import { createSqliteDataSource, Post, seedAlice, Tag, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

const sqlite = createDialectDataSource("sqlite");
const postgres = createDialectDataSource("postgres");
const mysql = createDialectDataSource("mysql");

describe("DeleteQueryBuilder", () => {
  describe("SQL", () => {
    test("should delete from the entity table with the where clause", () => {
      const qb = sqlite.createQueryBuilder().delete().from(User).where({ id: "u1" });

      expect(qb.getQuery()).toBe(`DELETE FROM "users" WHERE "users"."id" = :orm_param_0`);
      expect(sqlite.createQueryBuilder().delete().from(User).getQuery()).toBe(`DELETE FROM "users"`);
      expect(sqlite.createQueryBuilder().delete().from("accounts").where({ id: 1 }).getQuery()).toBe(
        `DELETE FROM "accounts" WHERE "accounts"."id" = :orm_param_0`,
      );
    });

    test("should alias the table per dialect when an alias is given", () => {
      expect(postgres.createQueryBuilder().delete().from(User, "u").where("u.age > 1").getQuery()).toBe(
        `DELETE FROM "users" AS "u" WHERE "u"."age" > 1`,
      );
      expect(mysql.createQueryBuilder().delete().from(User, "u").where("u.age > 1").getQuery()).toBe(
        "DELETE `u` FROM `users` `u` WHERE `u`.`age` > 1",
      );
    });

    test("returning should accept *, properties and raw expressions and be dropped on MySQL", () => {
      expect(postgres.createQueryBuilder().delete().from(User).returning("*").getQuery()).toBe(
        `DELETE FROM "users" RETURNING *`,
      );
      expect(postgres.createQueryBuilder().delete().from(User).returning(["isActive", "1"]).getQuery()).toBe(
        `DELETE FROM "users" RETURNING "is_active", 1`,
      );
      expect(mysql.createQueryBuilder().delete().from(User).returning("*").getQuery()).toBe("DELETE FROM `users`");
    });

    test("should throw without a target", () => {
      expect(() => sqlite.createQueryBuilder().delete().getQuery()).toThrow(InvalidCriteriaError);
    });
  });

  describe("execution", () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await createSqliteDataSource();
      await seedAlice(dataSource);
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    test("where and the whereInIds family should refuse undefined criteria and delete no row", async () => {
      const counts = async () => [
        await dataSource.getRepository(User).count(),
        await dataSource.getRepository(Post).count(),
        await dataSource.getRepository(Tag).count(),
      ];
      const before = await counts();
      // A value that is undefined at runtime, as an unset request field or a missing session claim would be
      const missing = undefined as unknown as string;
      const remove = () => dataSource.createQueryBuilder().delete().from(User);

      expect(() => remove().where({ id: missing })).toThrow(InvalidCriteriaError);
      expect(() => remove().where({ id: missing })).toThrow('"id" is undefined');
      expect(() => remove().where("age > 0").andWhere({ id: missing })).toThrow(InvalidCriteriaError);
      expect(() => remove().where({ id: "u1" }).orWhere({ name: missing })).toThrow('"name" is undefined');
      expect(() =>
        dataSource
          .createQueryBuilder()
          .delete()
          .from(Post)
          .where({ author: { id: missing } }),
      ).toThrow('"author.id" is undefined');
      expect(() => remove().whereInIds([missing])).toThrow('"id" is undefined');
      expect(() => remove().whereInIds(missing)).toThrow(InvalidCriteriaError);
      expect(() => remove().where({ id: "u1" }).andWhereInIds(["u1", missing])).toThrow(InvalidCriteriaError);
      expect(() => remove().where({ id: "u1" }).orWhereInIds([missing])).toThrow(InvalidCriteriaError);
      expect(() => dataSource.createQueryBuilder().delete().from("accounts").whereInIds([missing])).toThrow(
        InvalidCriteriaError,
      );

      expect(await counts()).toEqual(before);
    });

    test("should report the affected rows and return requested columns", async () => {
      const tags = await dataSource
        .createQueryBuilder()
        .delete()
        .from(Tag)
        .where({ label: "intro" })
        .returning("label")
        .execute();

      expect(tags).toBeInstanceOf(DeleteResult);
      expect(tags.affected).toBe(1);
      expect(tags.raw).toEqual([{ label: "intro" }]);

      // SQLite counts the rows a foreign key cascade removes; clear the junction first for a stable count.
      await dataSource.query('DELETE FROM "post_tags"');

      const posts = await dataSource.createQueryBuilder().delete().from(Post).execute();

      expect(posts.affected).toBe(2);
      expect(posts.raw).toEqual([]);
      expect(await dataSource.getRepository(Post).count()).toBe(0);

      const none = await dataSource.createQueryBuilder().delete().from(User).where({ id: "nobody" }).execute();

      expect(none.affected).toBe(0);
    });
  });
});

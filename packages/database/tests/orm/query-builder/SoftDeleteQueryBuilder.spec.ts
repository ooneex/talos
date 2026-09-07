import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DataSource } from "../../../src/orm/DataSource";
import { MissingDeleteDateColumnError } from "../../../src/orm/errors";
import { createSqliteDataSource, Post, seedAlice, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

const sqlite = createDialectDataSource("sqlite");

describe("SoftDeleteQueryBuilder", () => {
  describe("SQL", () => {
    test("softDelete should stamp the delete column and bump version and update timestamp", () => {
      const qb = sqlite.createQueryBuilder().softDelete().from(User).where({ id: "u1" });
      const sql = qb.getQuery();

      expect(sql).toBe(
        `UPDATE "users" SET "deleted_at" = :orm_param_1, "updated_at" = :orm_param_2, "version" = "version" + 1 WHERE "users"."id" = :orm_param_0`,
      );
      expect(qb.getParameters().orm_param_1).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(qb.expressionMap.queryType).toBe("soft-delete");

      // Building the SQL twice reuses the same deletion timestamp.
      const stamp = qb.getParameters().orm_param_1;
      expect(qb.getQueryAndParameters()[1]).toContain(stamp);
    });

    test("restore should null the delete column", () => {
      const qb = sqlite.createQueryBuilder().restore().from(User, "u").where("u.id = :id", { id: "u1" });

      expect(qb.getQuery()).toBe(
        `UPDATE "users" AS "u" SET "deleted_at" = :orm_param_0, "updated_at" = :orm_param_1, "version" = "version" + 1 WHERE "u"."id" = :id`,
      );
      expect(qb.getParameters().orm_param_0).toBeNull();
      expect(qb.expressionMap.queryType).toBe("restore");
    });

    test("should refuse entities without a delete date column", () => {
      expect(() => sqlite.createQueryBuilder().softDelete().from(Post).getQuery()).toThrow(
        MissingDeleteDateColumnError,
      );
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

    test("soft-deleted rows should disappear from queries until restored", async () => {
      const users = dataSource.getRepository(User);
      const result = await dataSource.createQueryBuilder().softDelete().from(User).where({ id: "u1" }).execute();

      expect(result.affected).toBe(1);
      expect(await users.findOneBy({ id: "u1" })).toBeNull();

      const hidden = await users.findOne({ where: { id: "u1" }, withDeleted: true });

      expect(hidden?.deletedAt).toBeInstanceOf(Date);
      expect(hidden?.version).toBe(2);

      const restored = await dataSource.createQueryBuilder().restore().from(User).where({ id: "u1" }).execute();

      expect(restored.affected).toBe(1);

      const back = await users.findOneByOrFail({ id: "u1" });

      expect(back.deletedAt).toBeNull();
      expect(back.version).toBe(3);
    });
  });
});

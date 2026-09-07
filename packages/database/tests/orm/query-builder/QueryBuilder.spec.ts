import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Brackets, NotBrackets } from "../../../src/orm/Brackets";
import type { DataSource } from "../../../src/orm/DataSource";
import { ParameterNotSetError } from "../../../src/orm/errors";
import { createSqliteDataSource, Post, seedAlice, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

const dialect = createDialectDataSource("sqlite");

describe("QueryBuilder", () => {
  test("should expose the alias, the raw SQL and the parameters", () => {
    const qb = dialect.createQueryBuilder(User, "user").where("user.name = :name", { name: "Alice" });

    expect(qb.alias).toBe("user");
    expect(qb.hasMetadata()).toBe(true);
    expect(qb.getSql()).toBe(qb.getQuery());
    expect(qb.getParameters()).toEqual({ name: "Alice" });

    qb.setParameters({ a: 1, b: 2 }).setParameter("c", 3);

    expect(qb.getParameters()).toEqual({ name: "Alice", a: 1, b: 2, c: 3 });
    expect(dialect.createQueryBuilder().alias).toBe("");
  });

  describe("property replacement", () => {
    test("should turn alias.property into escaped column names and leave the rest alone", () => {
      const sql = dialect
        .createQueryBuilder(User, "user")
        .where("user.isActive = :active AND user.name = 'user.name' AND other.name = 1", { active: true })
        .getQuery();

      expect(sql).toContain(`WHERE "user"."deleted_at" IS NULL AND ("user"."is_active" = :active`);
      expect(sql).toContain(`AND "user"."name" = 'user.name' AND other.name = 1)`);
    });

    test("should map relations with a join column onto the foreign key", () => {
      const sql = dialect
        .createQueryBuilder(Post, "post")
        .where("post.author = :author OR post.author.id = :author", { author: "u1" })
        .getQuery();

      expect(sql).toContain(`"post"."author_id" = :author OR "post"."author_id" = :author`);
    });

    test("should skip references preceded by a quote, a dot or a cast", () => {
      const sql = dialect
        .createQueryBuilder(User, "user")
        .where(`"user".name = 'x' AND foo.user.name = 1 AND user.age::text = '1'`)
        .getQuery();

      expect(sql).toContain(`"user".name = 'x' AND foo.user.name = 1 AND "user"."age"::text = '1'`);
    });
  });

  describe("where", () => {
    test("where should replace the conditions, andWhere / orWhere should extend them", () => {
      const qb = dialect.createQueryBuilder(User, "user").where("1 = 1").where("user.age > :min", { min: 1 });

      qb.andWhere("user.age < :max", { max: 10 }).orWhere("user.name = :name", { name: "x" });

      expect(qb.getQuery()).toContain(`("user"."age" > :min AND "user"."age" < :max OR "user"."name" = :name)`);
    });

    test("should accept a function that receives the builder", () => {
      const sql = dialect
        .createQueryBuilder(User, "user")
        .where((qb) => `${qb.escape("user")}.${qb.escape("name")} = :name`, { name: "Alice" })
        .getQuery();

      expect(sql).toContain(`"user"."name" = :name`);
    });

    test("should group Brackets and negate NotBrackets", () => {
      const sql = dialect
        .createQueryBuilder(User, "user")
        .where("user.age > :min", { min: 1 })
        .andWhere(
          new Brackets((qb) => {
            qb.where("user.name = :a", { a: "a" }).orWhere("user.name = :b", { b: "b" });
          }),
        )
        .andWhere(new NotBrackets((qb) => qb.where("user.age = :zero", { zero: 0 })))
        .andWhere(new Brackets(() => undefined))
        .getQuery();

      expect(sql).toContain(
        `"user"."age" > :min AND ("user"."name" = :a OR "user"."name" = :b) AND NOT ("user"."age" = :zero)`,
      );
    });

    test("should build entity where objects through the where builder", () => {
      // An array stands for IN at runtime even though the find-options type does not spell it out.
      const qb = dialect.createQueryBuilder(User, "user").where({ name: "Alice", age: [1, 2] as unknown as number });

      expect(qb.getQuery()).toContain(`"user"."name" = :orm_param_0 AND "user"."age" IN (:orm_param_1, :orm_param_2)`);
      expect(qb.getParameters()).toEqual({ orm_param_0: "Alice", orm_param_1: 1, orm_param_2: 2 });
    });

    test("should resolve a table name to its entity when one is registered", () => {
      const sql = dialect.createQueryBuilder().select("*").from("users", "u").where({ id: "u1" }).getQuery();

      expect(sql).toBe(`SELECT * FROM "users" "u" WHERE "u"."deleted_at" IS NULL AND ("u"."id" = :orm_param_0)`);
    });

    test("should build raw table where objects on column names", () => {
      const qb = dialect
        .createQueryBuilder()
        .select("*")
        .from("accounts", "a")
        .where([{ id: "u1", missing: undefined }, { name: null }, { age: [] }, { age: [1, 2] }, {}]);

      expect(qb.getQuery()).toBe(
        `SELECT * FROM "accounts" "a" WHERE ("a"."id" = :orm_param_0) OR ("a"."name" IS NULL) OR (0=1) OR ("a"."age" IN (:orm_param_1, :orm_param_2))`,
      );
    });

    test("whereInIds should target the primary key with one value or a list", () => {
      const one = dialect.createQueryBuilder(User, "user").whereInIds("u1");
      const many = dialect.createQueryBuilder(User, "user").whereInIds(["u1", { id: "u2" }]);
      const raw = dialect.createQueryBuilder().select("*").from("accounts", "a").whereInIds([1, 2]);

      expect(one.getQuery()).toContain(`"user"."id" = :orm_param_0`);
      expect(many.getQuery()).toContain(`"user"."id" IN (:orm_param_0, :orm_param_1)`);
      expect(many.getParameters()).toEqual({ orm_param_0: "u1", orm_param_1: "u2" });
      expect(raw.getQuery()).toContain(`"a"."id" IN (:orm_param_0, :orm_param_1)`);

      const combined = dialect
        .createQueryBuilder(User, "user")
        .where("user.age > 1")
        .andWhereInIds("u1")
        .orWhereInIds(["u2"]);

      expect(combined.getQuery()).toContain(
        `"user"."age" > 1 AND "user"."id" = :orm_param_0 OR "user"."id" = :orm_param_1`,
      );
    });
  });

  describe("soft delete filter", () => {
    test("should exclude soft-deleted rows of the main entity unless withDeleted() is called", () => {
      expect(dialect.createQueryBuilder(User, "user").getQuery()).toContain(`WHERE "user"."deleted_at" IS NULL`);
      expect(dialect.createQueryBuilder(User, "user").withDeleted().getQuery()).not.toContain('deleted_at" IS NULL');
      expect(dialect.createQueryBuilder(Post, "post").getQuery()).not.toContain("WHERE");
    });
  });

  describe("parameter binding", () => {
    test("should bind named parameters positionally and spread lists", () => {
      const [sql, parameters] = dialect
        .createQueryBuilder(User, "user")
        .where("user.name = :name AND user.age IN (:...ages) AND user.id IN (:...none) AND user.age::int = :name")
        .setParameters({ name: "Alice", ages: [1, 2], none: [] })
        .getQueryAndParameters();

      expect(sql).toContain(
        `"user"."name" = $1 AND "user"."age" IN ($2, $3) AND "user"."id" IN (NULL) AND "user"."age"::int = $4`,
      );
      expect(parameters).toEqual(["Alice", 1, 2, "Alice"]);
    });

    test("should prepare bound values for the dialect and spread scalars as single items", () => {
      const date = new Date("2024-01-01T00:00:00.000Z");
      const [sql, parameters] = dialect
        .createQueryBuilder(User, "user")
        .where("user.createdAt > :date AND user.id IN (:...id)", { date, id: "u1" })
        .getQueryAndParameters();

      expect(sql).toContain(`"user"."created_at" > $1 AND "user"."id" IN ($2)`);
      expect(parameters).toEqual(["2024-01-01T00:00:00.000Z", "u1"]);
    });

    test("should throw when a referenced parameter was never set", () => {
      const qb = dialect.createQueryBuilder(User, "user").where("user.name = :name");

      expect(() => qb.getQueryAndParameters()).toThrow(ParameterNotSetError);
    });
  });

  test("comment should prefix the query", () => {
    expect(dialect.createQueryBuilder(User, "user").comment("hello */ world").getQuery()).toStartWith(
      "/* hello  world */ SELECT",
    );
  });

  describe("query runner", () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await createSqliteDataSource();
      await seedAlice(dataSource);
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    test("setQueryRunner should run the builder inside the runner's transaction", async () => {
      const runner = dataSource.createQueryRunner();

      try {
        await runner.startTransaction();
        await runner.manager.insert(User, { id: "u2", name: "Bob" });

        const inside = await dataSource.createQueryBuilder(User, "user").setQueryRunner(runner).getCount();
        const outside = await dataSource.createQueryBuilder(User, "user").getCount();

        await runner.rollbackTransaction();

        expect(inside).toBe(2);
        expect(outside).toBe(2);
        expect(await dataSource.createQueryBuilder(User, "user").getCount()).toBe(1);
      } finally {
        await runner.release();
      }
    });
  });
});

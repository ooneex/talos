import { describe, expect, test } from "bun:test";
import type { ObjectLiteralType } from "../../../src";
import type { IDriver } from "../../../src/orm/driver/AbstractDriver";
import { PostgresDriver } from "../../../src/orm/driver/PostgresDriver";
import { SqliteDriver } from "../../../src/orm/driver/SqliteDriver";
import type { RelationMetadata } from "../../../src/orm/EntityMetadata";
import { EntityPropertyNotFoundError, InvalidCriteriaError } from "../../../src/orm/errors";
import {
  And,
  Any,
  ArrayContains,
  Between,
  Equal,
  FindOperator,
  ILike,
  In,
  IsNull,
  JsonContains,
  LessThan,
  Like,
  MoreThanOrEqual,
  Not,
  Or,
  Raw,
} from "../../../src/orm/FindOperator";
import { type JoinResolverType, WhereBuilder } from "../../../src/orm/query-builder/WhereBuilder";
import { buildFixtureMetadatas, findMetadata } from "../../fixtures/metadata";

const metadatas = buildFixtureMetadatas();
const users = findMetadata(metadatas, "User");
const posts = findMetadata(metadatas, "Post");
const sqlite = new SqliteDriver({ type: "sqlite", database: ":memory:" });
const postgres = new PostgresDriver({ type: "postgres" });

type HarnessType = {
  builder: WhereBuilder;
  parameters: ObjectLiteralType;
  joins: string[];
};

const harness = (driver: IDriver = sqlite, withJoins = false): HarnessType => {
  const parameters: ObjectLiteralType = {};
  const joins: string[] = [];
  let counter = 0;
  const ensureJoin: JoinResolverType = (parentAlias, relation: RelationMetadata) => {
    const alias = `${parentAlias}_${relation.propertyName}`;

    joins.push(alias);

    return alias;
  };

  const builder = new WhereBuilder(
    driver,
    {
      create: (value) => {
        const name = `p${counter}`;

        counter += 1;
        parameters[name] = value;

        return `:${name}`;
      },
      set: (name, value) => {
        parameters[name] = value;
      },
    },
    withJoins ? ensureJoin : undefined,
  );

  return { builder, parameters, joins };
};

describe("WhereBuilder", () => {
  describe("columns", () => {
    test("should compare, test for null, expand lists and skip undefined", () => {
      const { builder, parameters } = harness();
      const sql = builder.build(
        { name: "Alice", secret: null, age: [1, 2], version: undefined, roles: ["a", "b"] },
        users,
        "u",
      );

      expect(sql).toBe(`"u"."name" = :p0 AND "u"."secret" IS NULL AND "u"."age" IN (:p1, :p2) AND "u"."roles" = :p3`);
      expect(parameters).toEqual({ p0: "Alice", p1: 1, p2: 2, p3: "a,b" });
    });

    test("should prepare values for the column and add the dialect cast", () => {
      const { builder, parameters } = harness(postgres);
      const sql = builder.build({ settings: { theme: "dark" }, isActive: true }, users, "u");

      expect(sql).toBe(`"u"."settings" = :p0 AND "u"."is_active" = :p1`);
      expect(parameters).toEqual({ p0: '{"theme":"dark"}', p1: true });
    });

    test("should OR the groups of an array and drop empty ones", () => {
      const { builder } = harness();

      expect(builder.build([{ name: "a" }, { age: 1 }, {}], users, "u")).toBe(
        `("u"."name" = :p0) OR ("u"."age" = :p1)`,
      );
      expect(builder.build([{ name: "a" }], users, "u")).toBe(`"u"."name" = :p2`);
      expect(builder.build([], users, "u")).toBe("");
    });

    test("should reject unknown properties", () => {
      expect(() => harness().builder.build({ nope: 1 }, users, "u")).toThrow(EntityPropertyNotFoundError);
    });
  });

  describe("operators", () => {
    test("should render comparisons and null checks", () => {
      const { builder, parameters } = harness();

      expect(builder.build({ age: Equal(1) }, users, "u")).toBe(`"u"."age" = :p0`);
      expect(builder.build({ age: LessThan(2) }, users, "u")).toBe(`"u"."age" < :p1`);
      expect(builder.build({ age: MoreThanOrEqual(3) }, users, "u")).toBe(`"u"."age" >= :p2`);
      expect(builder.build({ name: Like("a%") }, users, "u")).toBe(`"u"."name" LIKE :p3`);
      expect(builder.build({ name: IsNull() }, users, "u")).toBe(`"u"."name" IS NULL`);
      expect(builder.build({ name: Not(null) }, users, "u")).toBe(`"u"."name" IS NOT NULL`);
      expect(builder.build({ name: Not("x") }, users, "u")).toBe(`"u"."name" != :p4`);
      expect(builder.build({ age: Not(In([1, 2])) }, users, "u")).toBe(`NOT("u"."age" IN (:p5, :p6))`);
      expect(builder.build({ age: Between(1, 5) }, users, "u")).toBe(`"u"."age" BETWEEN :p7 AND :p8`);
      expect(builder.build({ age: In([]) }, users, "u")).toBe("0=1");
      expect(builder.build({ age: Any([7]) }, users, "u")).toBe(`"u"."age" IN (:p9)`);
      expect(parameters).toEqual({ p0: 1, p1: 2, p2: 3, p3: "a%", p4: "x", p5: 1, p6: 2, p7: 1, p8: 5, p9: 7 });
    });

    test("should emulate ILIKE on SQLite and use it natively on PostgreSQL", () => {
      expect(harness().builder.build({ name: ILike("%a%") }, users, "u")).toBe(`LOWER("u"."name") LIKE LOWER(:p0)`);
      expect(harness(postgres).builder.build({ name: ILike("%a%") }, users, "u")).toBe(`"u"."name" ILIKE :p0`);
    });

    test("should combine operators with And / Or", () => {
      const { builder } = harness();

      expect(builder.build({ age: And(MoreThanOrEqual(1), LessThan(5)) }, users, "u")).toBe(
        `("u"."age" >= :p0 AND "u"."age" < :p1)`,
      );
      expect(builder.build({ age: Or(Equal(1), Equal(2)) }, users, "u")).toBe(`("u"."age" = :p2 OR "u"."age" = :p3)`);
    });

    test("should inline raw SQL and register its parameters", () => {
      const { builder, parameters } = harness();

      expect(builder.build({ age: Raw("1 + 1") }, users, "u")).toBe(`"u"."age" = 1 + 1`);
      expect(builder.build({ age: Raw((alias) => `${alias} > :min`, { min: 3 }) }, users, "u")).toBe(
        `"u"."age" > :min`,
      );
      expect(parameters).toEqual({ min: 3 });
    });

    test("should write the PostgreSQL array and JSON operators", () => {
      const { builder, parameters } = harness(postgres);

      expect(builder.build({ roles: ArrayContains(["a"]) }, users, "u")).toBe(`"u"."roles" @> :p0`);
      expect(builder.build({ settings: JsonContains({ theme: "dark" }) }, users, "u")).toBe(`"u"."settings" @> :p1`);
      expect(parameters).toEqual({ p0: "a", p1: '{"theme":"dark"}' });
    });

    test("should reject an operator type it does not know", () => {
      const bogus = new FindOperator("bogus" as "equal", 1);

      expect(() => harness().builder.build({ age: bogus }, users, "u")).toThrow(InvalidCriteriaError);
    });
  });

  describe("relations", () => {
    test("should compare the foreign key of an owning relation directly", () => {
      const { builder, parameters } = harness();

      expect(builder.build({ author: "u1" }, posts, "p")).toBe(`"p"."author_id" = :p0`);
      expect(builder.build({ author: { id: "u2" } }, posts, "p")).toBe(`"p"."author_id" = :p1`);
      expect(builder.build({ author: null }, posts, "p")).toBe(`"p"."author_id" IS NULL`);
      expect(builder.build({ author: ["u1", "u2"] }, posts, "p")).toBe(`"p"."author_id" IN (:p2, :p3)`);
      expect(builder.build({ author: { id: In(["u1"]) } }, posts, "p")).toBe(`"p"."author_id" IN (:p4)`);
      expect(builder.build({ author: true }, posts, "p")).toBe("");
      expect(parameters).toEqual({ p0: "u1", p1: "u2", p2: "u1", p3: "u2", p4: "u1" });
    });

    test("should join when an owning relation is filtered by non-primary properties", () => {
      const { builder, joins } = harness(sqlite, true);

      expect(builder.build({ author: { name: "Alice" } }, posts, "p")).toBe(`"p_author"."name" = :p0`);
      expect(builder.build({ author: [{ name: "a" }, { age: 1 }] }, posts, "p")).toBe(
        `("p_author"."name" = :p1) OR ("p_author"."age" = :p2)`,
      );
      expect(joins).toEqual(["p_author", "p_author"]);
    });

    test("should refuse joins when no resolver is available", () => {
      const { builder } = harness();

      expect(() => builder.build({ author: { name: "Alice" } }, posts, "p")).toThrow(InvalidCriteriaError);
      expect(() => builder.build({ posts: { title: "x" } }, users, "u")).toThrow(InvalidCriteriaError);
    });

    test("should filter inverse relations through a join", () => {
      const { builder, joins, parameters } = harness(sqlite, true);

      expect(builder.build({ posts: { title: "First" } }, users, "u")).toBe(`"u_posts"."title" = :p0`);
      expect(builder.build({ posts: 3 }, users, "u")).toBe(`"u_posts"."id" = :p1`);
      expect(builder.build({ posts: [1, 2] }, users, "u")).toBe(`"u_posts"."id" IN (:p2, :p3)`);
      expect(builder.build({ tags: { label: "news" } }, posts, "p")).toBe(`"p_tags"."label" = :p4`);
      expect(joins).toEqual(["u_posts", "u_posts", "u_posts", "p_tags"]);
      expect(parameters).toEqual({ p0: "First", p1: 3, p2: 1, p3: 2, p4: "news" });
    });
  });
});

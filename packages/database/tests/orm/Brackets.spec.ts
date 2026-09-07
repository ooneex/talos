import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Brackets, type IWhereExpressionBuilder, NotBrackets } from "../../src/orm/Brackets";
import type { DataSource } from "../../src/orm/DataSource";
import { createSqliteDataSource, User } from "../fixtures/entities";

describe("Brackets", () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createSqliteDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  test("should keep the where factory it was given", () => {
    const factory = (qb: IWhereExpressionBuilder): void => {
      qb.where("1 = 1");
    };

    const brackets = new Brackets(factory);

    expect(brackets.whereFactory).toBe(factory);
  });

  test("NotBrackets should be a Brackets", () => {
    const brackets = new NotBrackets(() => undefined);

    expect(brackets).toBeInstanceOf(Brackets);
    expect(brackets).toBeInstanceOf(NotBrackets);
  });

  test("should group conditions in parentheses inside a query", () => {
    const sql = dataSource
      .createQueryBuilder(User, "user")
      .where("user.age > :age", { age: 18 })
      .andWhere(
        new Brackets((qb) => {
          qb.where("user.name = :first", { first: "a" }).orWhere("user.name = :second", { second: "b" });
        }),
      )
      .getQuery();

    expect(sql).toContain(
      'WHERE "user"."deleted_at" IS NULL AND ("user"."age" > :age AND ("user"."name" = :first OR "user"."name" = :second))',
    );
  });

  test("NotBrackets should negate the group", () => {
    const sql = dataSource
      .createQueryBuilder(User, "user")
      .where(
        new NotBrackets((qb) => {
          qb.where("user.age < :min", { min: 1 }).andWhere("user.age > :max", { max: 99 });
        }),
      )
      .getQuery();

    expect(sql).toContain('NOT ("user"."age" < :min AND "user"."age" > :max)');
  });

  test("empty brackets should add no condition", () => {
    const sql = dataSource
      .createQueryBuilder(User, "user")
      .where("user.age > :age", { age: 18 })
      .andWhere(new Brackets(() => undefined))
      .getQuery();

    expect(sql).toContain('("user"."age" > :age)');
    expect(sql).not.toContain("AND ()");
  });
});

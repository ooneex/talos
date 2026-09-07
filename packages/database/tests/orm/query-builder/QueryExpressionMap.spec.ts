import { describe, expect, test } from "bun:test";
import { QueryExpressionMap } from "../../../src/orm/query-builder/QueryExpressionMap";
import { buildFixtureMetadatas, findMetadata } from "../../fixtures/metadata";

describe("QueryExpressionMap", () => {
  test("should start as an empty select", () => {
    const map = new QueryExpressionMap();

    expect(map.queryType).toBe("select");
    expect(map.mainAlias).toBeUndefined();
    expect(map.aliases).toEqual([]);
    expect(map.wheres).toEqual([]);
    expect(map.parameters).toEqual({});
    expect(map.parameterCounter).toBe(0);
    expect(map.withDeleted).toBe(false);
    expect(map.updateEntity).toBe(true);
  });

  test("createAlias should register an alias once and return the existing one on repeats", () => {
    const map = new QueryExpressionMap();
    const metadata = findMetadata(buildFixtureMetadatas(), "User");
    const alias = map.createAlias({ name: "user", metadata });
    const again = map.createAlias({ name: "user", tableName: "elsewhere" });

    expect(again).toBe(alias);
    expect(map.aliases).toEqual([alias]);
    expect(map.findAlias("user")).toBe(alias);
    expect(map.findAlias("missing")).toBeUndefined();
  });

  test("clone should copy every field so that later changes stay separate", () => {
    const map = new QueryExpressionMap();
    map.queryType = "update";
    map.mainAlias = map.createAlias({ name: "user", tableName: "users" });
    map.extraFromAliases.push("extra");
    map.selects.push({ selection: "user.id", aliasName: "id" });
    map.joinAttributes.push({ direction: "LEFT", alias: { name: "posts" }, isSelected: true });
    map.wheres.push({ type: "simple", condition: "user.id = :id" });
    map.havings.push({ type: "and", condition: "COUNT(*) > 1" });
    map.orderBys = { "user.id": { order: "DESC", nulls: "NULLS LAST" } };
    map.groupBys.push("user.id");
    map.limit = 10;
    map.offset = 5;
    map.take = 3;
    map.skip = 1;
    map.parameters = { id: 1 };
    map.parameterCounter = 4;
    map.withDeleted = true;
    map.selectDistinct = true;
    map.selectDistinctOn.push("user.id");
    map.lockMode = "pessimistic_write";
    map.comment = "hello";
    map.insertColumns = ["id"];
    map.valuesSet = { id: 1 };
    map.onIgnore = true;
    map.onUpdate = { conflictColumns: ["id"], overwriteColumns: ["name"] };
    map.returning = "*";
    map.updateEntity = false;
    map.relationPropertyPath = "posts";
    map.of = { id: 1 };
    map.isSubQuery = true;
    map.parentQueryBuilderCounter = 2;

    const clone = map.clone();

    expect(clone).not.toBe(map);
    expect(clone).toEqual(map);
    expect(clone.mainAlias).toBe(map.mainAlias);

    const [select] = clone.selects;
    const [join] = clone.joinAttributes;
    const [having] = clone.havings;

    clone.aliases.push({ name: "other" });
    Object.assign(select ?? {}, { aliasName: "changed" });
    Object.assign(join ?? {}, { direction: "INNER" });
    clone.wheres.push({ type: "or", condition: "1 = 1" });
    Object.assign(having ?? {}, { condition: "changed" });
    clone.orderBys["user.name"] = { order: "ASC" };
    clone.groupBys.push("user.name");
    clone.parameters.other = 2;
    clone.selectDistinctOn.push("user.name");
    clone.insertColumns?.push("name");
    clone.onUpdate?.overwriteColumns.push("age");
    clone.extraFromAliases.push("more");

    expect(map.aliases).toHaveLength(1);
    expect(map.selects[0]?.aliasName).toBe("id");
    expect(map.joinAttributes[0]?.direction).toBe("LEFT");
    expect(map.wheres).toHaveLength(1);
    expect(map.havings[0]?.condition).toBe("COUNT(*) > 1");
    expect(Object.keys(map.orderBys)).toEqual(["user.id"]);
    expect(map.groupBys).toEqual(["user.id"]);
    expect(map.parameters).toEqual({ id: 1 });
    expect(map.selectDistinctOn).toEqual(["user.id"]);
    expect(map.insertColumns).toEqual(["id"]);
    expect(map.onUpdate?.overwriteColumns).toEqual(["name"]);
    expect(map.extraFromAliases).toEqual(["extra"]);
  });

  test("clone should keep undefined optional fields undefined", () => {
    const clone = new QueryExpressionMap().clone();

    expect(clone.insertColumns).toBeUndefined();
    expect(clone.onUpdate).toBeUndefined();
    expect(clone.limit).toBeUndefined();
    expect(clone.lockMode).toBeUndefined();
  });
});

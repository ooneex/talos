import { describe, expect, test } from "bun:test";
import { getMetadataArgsStorage, MetadataArgsStorage } from "../../src/orm/MetadataArgsStorage";

class Base {}
class Child extends Base {}
class Other {}

const populated = (): MetadataArgsStorage => {
  const storage = new MetadataArgsStorage();

  storage.tables.push({ target: Child, name: "children" }, { target: Other });
  storage.columns.push(
    { target: Child, propertyName: "name", mode: "regular", options: { type: "text" } },
    { target: Base, propertyName: "id", mode: "regular", options: { primary: true } },
    { target: Base, propertyName: "name", mode: "regular", options: {} },
    { target: Other, propertyName: "id", mode: "regular", options: {} },
  );
  storage.generations.push({ target: Base, propertyName: "id", strategy: "increment" });
  storage.relations.push({
    target: Base,
    propertyName: "owner",
    relationType: "many-to-one",
    type: () => Other,
    options: {},
  });
  storage.joinColumns.push(
    { target: Base, propertyName: "owner", name: "owner_id" },
    { target: Other, propertyName: "owner", name: "other_owner" },
  );
  storage.joinTables.push({ target: Child, propertyName: "tags", name: "child_tags" });
  storage.indices.push({ target: Base, columns: ["name"] }, { target: Other, columns: ["id"] });
  storage.uniques.push({ target: Child, columns: ["name"] });

  return storage;
};

describe("MetadataArgsStorage", () => {
  test("inheritanceTree should list the class then its ancestors", () => {
    const storage = new MetadataArgsStorage();

    expect(storage.inheritanceTree(Child)).toEqual([Child, Base]);
    expect(storage.inheritanceTree(Other)).toEqual([Other]);
  });

  test("filterTables should only return the table args of the exact class", () => {
    const storage = populated();

    expect(storage.filterTables(Child)).toEqual([{ target: Child, name: "children" }]);
    expect(storage.filterTables(Base)).toEqual([]);
  });

  test("filterColumns should return ancestor columns first so subclasses can override", () => {
    const storage = populated();

    const columns = storage.filterColumns(storage.inheritanceTree(Child));

    expect(columns.map((column) => [column.target.name, column.propertyName])).toEqual([
      ["Base", "id"],
      ["Base", "name"],
      ["Child", "name"],
    ]);
  });

  test("findGenerated should search across the inheritance tree", () => {
    const storage = populated();
    const tree = storage.inheritanceTree(Child);

    expect(storage.findGenerated(tree, "id")?.strategy).toBe("increment");
    expect(storage.findGenerated(tree, "name")).toBeUndefined();
    expect(storage.findGenerated([Other], "id")).toBeUndefined();
  });

  test("relation, join column and join table lookups should be scoped to the targets and property", () => {
    const storage = populated();
    const tree = storage.inheritanceTree(Child);

    expect(storage.filterRelations(tree).map((relation) => relation.propertyName)).toEqual(["owner"]);
    expect(storage.filterRelations([Other])).toEqual([]);
    expect(storage.filterJoinColumns(tree, "owner").map((joinColumn) => joinColumn.name)).toEqual(["owner_id"]);
    expect(storage.filterJoinColumns(tree, "missing")).toEqual([]);
    expect(storage.findJoinTable(tree, "tags")?.name).toBe("child_tags");
    expect(storage.findJoinTable([Base], "tags")).toBeUndefined();
  });

  test("index and unique lookups should include ancestors", () => {
    const storage = populated();
    const tree = storage.inheritanceTree(Child);

    expect(storage.filterIndices(tree)).toEqual([{ target: Base, columns: ["name"] }]);
    expect(storage.filterUniques(tree)).toEqual([{ target: Child, columns: ["name"] }]);
    expect(storage.filterUniques([Other])).toEqual([]);
  });
});

describe("getMetadataArgsStorage", () => {
  test("should return one global instance shared through globalThis", () => {
    const storage = getMetadataArgsStorage();
    const key = Symbol.for("@talosjs/database:metadata-args-storage");

    expect(storage).toBeInstanceOf(MetadataArgsStorage);
    expect(getMetadataArgsStorage()).toBe(storage);
    expect((globalThis as Record<symbol, unknown>)[key]).toBe(storage);
  });
});

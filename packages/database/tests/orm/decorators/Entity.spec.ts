import { describe, expect, test } from "bun:test";
import { Entity, Index, Unique } from "../../../src/orm/decorators/Entity";
import { getMetadataArgsStorage } from "../../../src/orm/MetadataArgsStorage";

describe("@Entity", () => {
  test("should register the class with a custom name", () => {
    @Entity("accounts")
    class Account {}

    const [table] = getMetadataArgsStorage().filterTables(Account);

    expect(table).toEqual({
      target: Account,
      name: "accounts",
      schema: undefined,
      database: undefined,
      synchronize: undefined,
      comment: undefined,
    });
  });

  test("should register options given as an object, or as a name plus options", () => {
    @Entity({ name: "ledgers", schema: "finance", database: "main", synchronize: false, comment: "Ledgers" })
    class Ledger {}

    @Entity("entries", { schema: "finance" })
    class Entry {}

    @Entity()
    class Plain {}

    expect(getMetadataArgsStorage().filterTables(Ledger)[0]).toMatchObject({
      name: "ledgers",
      schema: "finance",
      database: "main",
      synchronize: false,
      comment: "Ledgers",
    });
    expect(getMetadataArgsStorage().filterTables(Entry)[0]).toMatchObject({ name: "entries", schema: "finance" });
    expect(getMetadataArgsStorage().filterTables(Plain)[0]).toMatchObject({ target: Plain, name: undefined });
  });
});

describe("@Index", () => {
  test("on a property should index that column", () => {
    class Indexed {
      @Index()
      public slug = "";

      @Index("IDX_custom", { unique: true })
      public email = "";
    }

    const indices = getMetadataArgsStorage().filterIndices([Indexed]);

    expect(indices).toHaveLength(2);
    expect(indices[0]).toMatchObject({ target: Indexed, columns: ["slug"], propertyName: "slug", unique: undefined });
    expect(indices[1]).toMatchObject({ name: "IDX_custom", columns: ["email"], propertyName: "email", unique: true });
  });

  test("on a class should accept fields, a selector, a name and options in any supported order", () => {
    @Index(["a", "b"])
    @Index("IDX_named", ["a"], { where: "a > 0" })
    @Index((entity) => [entity.b], { unique: true, synchronize: false })
    @Index({ unique: true })
    class Composite {
      public a = 0;
      public b = 0;
    }

    const indices = getMetadataArgsStorage().filterIndices([Composite]);

    expect(indices).toHaveLength(4);
    expect(indices[0]).toMatchObject({ columns: undefined, unique: true, propertyName: undefined });
    expect(indices[1]).toMatchObject({ name: undefined, unique: true, synchronize: false });
    expect(typeof indices[1]?.columns).toBe("function");
    expect(indices[2]).toMatchObject({ name: "IDX_named", columns: ["a"], where: "a > 0" });
    expect(indices[3]).toMatchObject({ name: undefined, columns: ["a", "b"], unique: undefined });
  });
});

describe("@Unique", () => {
  test("should register class and property level unique constraints", () => {
    @Unique(["a", "b"])
    @Unique("UQ_named", ["a"])
    @Unique((entity) => [entity.b])
    class Constrained {
      @Unique()
      public a = 0;

      public b = 0;
    }

    const uniques = getMetadataArgsStorage().filterUniques([Constrained]);

    expect(uniques).toHaveLength(4);
    expect(uniques[0]).toMatchObject({ target: Constrained, columns: ["a"], propertyName: "a" });
    expect(typeof uniques[1]?.columns).toBe("function");
    expect(uniques[2]).toMatchObject({ name: "UQ_named", columns: ["a"] });
    expect(uniques[3]).toMatchObject({ name: undefined, columns: ["a", "b"], propertyName: undefined });
  });
});

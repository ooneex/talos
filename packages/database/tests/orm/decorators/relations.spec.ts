import { describe, expect, test } from "bun:test";
import {
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
} from "../../../src/orm/decorators/relations";
import { getMetadataArgsStorage } from "../../../src/orm/MetadataArgsStorage";

class Target {
  public owners?: Owner[];
  public owner?: Owner;
}

class Owner {
  @ManyToOne(
    () => Target,
    (target) => target.owners,
    { onDelete: "CASCADE", nullable: false },
  )
  @JoinColumn({ name: "target_id", referencedColumnName: "id", foreignKeyConstraintName: "FK_owner_target" })
  public target?: Target;

  @OneToMany(() => Target, "owner")
  public targets?: Target[];

  @OneToOne(() => Target, { cascade: true })
  @JoinColumn()
  public single?: Target;

  @ManyToMany(() => Target)
  @JoinTable({ name: "owner_targets", joinColumn: { name: "owner_id" }, inverseJoinColumn: { name: "target_id" } })
  public many?: Target[];

  @ManyToMany(
    () => Target,
    (target) => target.owners,
    { cascade: ["insert"] },
  )
  @JoinTable({
    schema: "public",
    joinColumns: [{ name: "a" }, { name: "b" }],
    inverseJoinColumns: [{ name: "c" }],
  })
  public composite?: Target[];

  @ManyToOne(() => Target)
  @JoinColumn([
    { name: "x", referencedColumnName: "x" },
    { name: "y", referencedColumnName: "y" },
  ])
  public twoKeys?: Target;

  @OneToMany("Target", "owner")
  public named?: Target[];
}

describe("relation decorators", () => {
  const storage = getMetadataArgsStorage();
  const relations = storage.filterRelations([Owner]);

  test("should record each relation with its type, target thunk and options", () => {
    expect(relations.map((relation) => [relation.propertyName, relation.relationType])).toEqual([
      ["target", "many-to-one"],
      ["targets", "one-to-many"],
      ["single", "one-to-one"],
      ["many", "many-to-many"],
      ["composite", "many-to-many"],
      ["twoKeys", "many-to-one"],
      ["named", "one-to-many"],
    ]);

    const [target, targets, single, many, composite] = relations;

    expect((target?.type as () => unknown)()).toBe(Target);
    expect(relations[6]?.type).toBe("Target");
    expect(relations[6]?.inverseSideProperty).toBe("owner");
    expect(typeof target?.inverseSideProperty).toBe("function");
    expect(target?.options).toEqual({ onDelete: "CASCADE", nullable: false });
    expect(targets?.inverseSideProperty).toBe("owner");
    expect(targets?.options).toEqual({});
    expect(single?.inverseSideProperty).toBeUndefined();
    expect(single?.options).toEqual({ cascade: true });
    expect(many?.options).toEqual({});
    expect(composite?.options).toEqual({ cascade: ["insert"] });
  });

  test("@JoinColumn should record one entry per column option", () => {
    expect(storage.filterJoinColumns([Owner], "target")).toEqual([
      {
        target: Owner,
        propertyName: "target",
        name: "target_id",
        referencedColumnName: "id",
        foreignKeyConstraintName: "FK_owner_target",
      },
    ]);
    expect(storage.filterJoinColumns([Owner], "single")).toEqual([
      {
        target: Owner,
        propertyName: "single",
        name: undefined,
        referencedColumnName: undefined,
        foreignKeyConstraintName: undefined,
      },
    ]);
    expect(storage.filterJoinColumns([Owner], "twoKeys").map((joinColumn) => joinColumn.name)).toEqual(["x", "y"]);
    expect(storage.filterJoinColumns([Owner], "targets")).toEqual([]);
  });

  test("@JoinTable should normalise single and multiple column forms", () => {
    expect(storage.findJoinTable([Owner], "many")).toEqual({
      target: Owner,
      propertyName: "many",
      name: "owner_targets",
      schema: undefined,
      joinColumns: [{ name: "owner_id" }],
      inverseJoinColumns: [{ name: "target_id" }],
    });
    expect(storage.findJoinTable([Owner], "composite")).toEqual({
      target: Owner,
      propertyName: "composite",
      name: undefined,
      schema: "public",
      joinColumns: [{ name: "a" }, { name: "b" }],
      inverseJoinColumns: [{ name: "c" }],
    });
  });

  test("@JoinTable without options should leave the columns to the naming strategy", () => {
    class Bare {
      @ManyToMany(() => Target)
      @JoinTable()
      public items?: Target[];
    }

    expect(storage.findJoinTable([Bare], "items")).toMatchObject({
      name: undefined,
      joinColumns: undefined,
      inverseJoinColumns: undefined,
    });
  });
});

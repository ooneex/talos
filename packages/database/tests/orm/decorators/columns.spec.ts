import { describe, expect, test } from "bun:test";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from "../../../src/orm/decorators/columns";
import { getMetadataArgsStorage } from "../../../src/orm/MetadataArgsStorage";

const columnsOf = (target: object) => getMetadataArgsStorage().filterColumns([target as never]);

describe("@Column", () => {
  test("should accept a type, a type with options, options only, or nothing", () => {
    class Decorated {
      @Column("text")
      public a = "";

      @Column("varchar", { length: 10, nullable: true })
      public b = "";

      @Column({ name: "c_col", type: "integer", default: 1 })
      public c = 0;

      @Column()
      public d = "";

      @Column(Number)
      public e = 0;
    }

    const columns = columnsOf(Decorated);

    expect(columns.map((column) => column.propertyName)).toEqual(["a", "b", "c", "d", "e"]);
    expect(columns.every((column) => column.mode === "regular" && column.target === Decorated)).toBe(true);
    expect(columns[0]?.options).toEqual({ type: "text" });
    expect(columns[1]?.options).toEqual({ type: "varchar", length: 10, nullable: true });
    expect(columns[2]?.options).toEqual({ name: "c_col", type: "integer", default: 1 });
    expect(columns[3]?.options).toEqual({});
    expect(columns[4]?.options).toEqual({ type: Number });
  });
});

describe("@PrimaryColumn", () => {
  test("should mark the column primary and not nullable", () => {
    class Keyed {
      @PrimaryColumn({ type: "varchar", length: 20, nullable: true })
      public id = "";

      @PrimaryColumn("uuid")
      public uid = "";
    }

    const [id, uid] = columnsOf(Keyed);

    expect(id?.options).toEqual({ type: "varchar", length: 20, primary: true, nullable: false });
    expect(uid?.options).toEqual({ type: "uuid", primary: true, nullable: false });
    expect(getMetadataArgsStorage().findGenerated([Keyed], "id")).toBeUndefined();
  });
});

describe("@PrimaryGeneratedColumn", () => {
  test("should default to an incrementing integer", () => {
    class Generated {
      @PrimaryGeneratedColumn()
      public id?: number;
    }

    expect(columnsOf(Generated)[0]?.options).toEqual({ type: "integer", primary: true, nullable: false });
    expect(getMetadataArgsStorage().findGenerated([Generated], "id")).toEqual({
      target: Generated,
      propertyName: "id",
      strategy: "increment",
    });
  });

  test("should infer the uuid type and accept explicit options", () => {
    class Generated {
      @PrimaryGeneratedColumn("uuid")
      public id?: string;

      @PrimaryGeneratedColumn("increment", { type: "bigint", name: "seq" })
      public seq?: string;

      @PrimaryGeneratedColumn({ type: "smallint" })
      public small?: number;
    }

    const [id, seq, small] = columnsOf(Generated);

    expect(id?.options).toEqual({ type: "uuid", primary: true, nullable: false });
    expect(getMetadataArgsStorage().findGenerated([Generated], "id")?.strategy).toBe("uuid");
    expect(seq?.options).toEqual({ type: "bigint", name: "seq", primary: true, nullable: false });
    expect(small?.options).toEqual({ type: "smallint", primary: true, nullable: false });
    expect(getMetadataArgsStorage().findGenerated([Generated], "small")?.strategy).toBe("increment");
  });
});

describe("date and version columns", () => {
  test("should record their mode and nullability defaults", () => {
    class Stamped {
      @CreateDateColumn()
      public createdAt?: Date;

      @UpdateDateColumn({ name: "updated_at" })
      public updatedAt?: Date;

      @DeleteDateColumn()
      public deletedAt?: Date | null;

      @VersionColumn()
      public version?: number;

      @VersionColumn({ type: "bigint", nullable: true })
      public revision?: string;
    }

    const columns = columnsOf(Stamped);

    expect(columns.map((column) => column.mode)).toEqual([
      "createDate",
      "updateDate",
      "deleteDate",
      "version",
      "version",
    ]);
    expect(columns[0]?.options).toEqual({ nullable: false });
    expect(columns[1]?.options).toEqual({ nullable: false, name: "updated_at" });
    expect(columns[2]?.options).toEqual({ nullable: true });
    expect(columns[3]?.options).toEqual({ nullable: false, type: "integer" });
    expect(columns[4]?.options).toEqual({ nullable: true, type: "bigint" });
  });

  test("should let the caller override the default nullability", () => {
    class Stamped {
      @CreateDateColumn({ nullable: true })
      public createdAt?: Date | null;

      @DeleteDateColumn({ nullable: false })
      public deletedAt?: Date;
    }

    const [created, deleted] = columnsOf(Stamped);

    expect(created?.options).toEqual({ nullable: true });
    expect(deleted?.options).toEqual({ nullable: false });
  });
});

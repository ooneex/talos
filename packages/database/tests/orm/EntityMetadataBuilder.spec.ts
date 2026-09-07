import { describe, expect, test } from "bun:test";
import { Column, PrimaryColumn, PrimaryGeneratedColumn } from "../../src/orm/decorators/columns";
import { Entity, Index, Unique } from "../../src/orm/decorators/Entity";
import { JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne } from "../../src/orm/decorators/relations";
import { EntityMetadataBuilder } from "../../src/orm/EntityMetadataBuilder";
import {
  EntityMetadataNotFoundError,
  EntityPropertyNotFoundError,
  MissingPrimaryColumnError,
  RelationNotFoundError,
} from "../../src/orm/errors";
import { getMetadataArgsStorage } from "../../src/orm/MetadataArgsStorage";
import { DefaultNamingStrategy, SnakeNamingStrategy } from "../../src/orm/NamingStrategy";
import { Post, Profile, Tag, User } from "../fixtures/entities";
import { buildFixtureMetadatas, findMetadata } from "../fixtures/metadata";

const build = (targets: (new () => object)[], namingStrategy = new DefaultNamingStrategy(), prefix = "") =>
  new EntityMetadataBuilder(getMetadataArgsStorage(), namingStrategy, prefix).build(targets);

describe("EntityMetadataBuilder", () => {
  test("should build tables, columns and generated strategies from the decorators", () => {
    const metadatas = buildFixtureMetadatas();
    const post = findMetadata(metadatas, "Post");
    const user = findMetadata(metadatas, "User");

    expect(metadatas.map((metadata) => metadata.tableName)).toEqual(["users", "posts", "tags", "profiles"]);
    expect(post.findColumnWithPropertyName("id")).toMatchObject({ isGenerated: true, generationStrategy: "increment" });
    expect(user.findColumnWithPropertyName("isActive")?.databaseName).toBe("is_active");
    expect(user.findColumnWithPropertyName("name")?.databaseName).toBe("name");
  });

  test("should apply the naming strategy and the entity prefix", () => {
    const metadatas = buildFixtureMetadatas(new SnakeNamingStrategy(), "app_");
    const user = findMetadata(metadatas, "User");
    const post = findMetadata(metadatas, "Post");

    expect(user.tableName).toBe("app_users");
    expect(user.findColumnWithPropertyName("createdAt")?.databaseName).toBe("created_at");
    expect(post.findRelationWithPropertyPath("tags")?.junction?.tableName).toBe("app_post_tags");
  });

  test("should build join columns for owning relations and reuse declared ones", () => {
    const metadatas = buildFixtureMetadatas();
    const post = findMetadata(metadatas, "Post");
    const user = findMetadata(metadatas, "User");
    const author = post.findRelationWithPropertyPath("author");
    const profile = user.findRelationWithPropertyPath("profile");

    expect(author?.joinColumns.map((column) => column.databaseName)).toEqual(["author_id"]);
    expect(author?.joinColumns[0]).toMatchObject({ type: "varchar", length: 20, isNullable: true, isVirtual: true });
    expect(author?.joinColumns[0]?.referencedColumn?.propertyName).toBe("id");
    expect(profile?.joinColumns.map((column) => column.databaseName)).toEqual(["profile_id"]);
    expect(profile?.joinColumns[0]?.type).toBe("integer");
    expect(user.findRelationWithPropertyPath("posts")?.joinColumns).toEqual([]);
  });

  test("should build the junction of a many-to-many and mirror it on the inverse side", () => {
    const metadatas = buildFixtureMetadatas();
    const tags = findMetadata(metadatas, "Post").findRelationWithPropertyPath("tags");
    const posts = findMetadata(metadatas, "Tag").findRelationWithPropertyPath("posts");

    expect(tags?.junction).toMatchObject({ tableName: "post_tags", schema: undefined });
    expect(tags?.junction?.joinColumns.map((column) => column.databaseName)).toEqual(["postsId"]);
    expect(tags?.junction?.inverseJoinColumns.map((column) => column.databaseName)).toEqual(["tagsId"]);
    expect(tags?.junction?.joinColumns[0]?.referencedColumn.propertyName).toBe("id");
    expect(posts?.junction?.joinColumns.map((column) => column.databaseName)).toEqual(["tagsId"]);
    expect(posts?.junction?.inverseJoinColumns.map((column) => column.databaseName)).toEqual(["postsId"]);
  });

  test("should build indices, uniques and foreign keys", () => {
    const metadatas = buildFixtureMetadatas();
    const user = findMetadata(metadatas, "User");
    const post = findMetadata(metadatas, "Post");

    expect(user.indices).toHaveLength(1);
    expect(user.indices[0]?.columns.map((column) => column.databaseName)).toEqual(["name", "age"]);
    expect(user.indices[0]?.name).toMatch(/^IDX_/);
    expect(user.indices[0]?.isUnique).toBe(false);

    const uniqueColumns = user.uniques.map((unique) => unique.columns.map((column) => column.databaseName).join(","));
    expect(user.uniques.find((unique) => unique.name === "UQ_users_name")).toBeDefined();
    expect(uniqueColumns).toContain("profile_id");
    expect(uniqueColumns.filter((columns) => columns === "name")).toHaveLength(1);

    expect(post.foreignKeys).toHaveLength(1);
    expect(post.foreignKeys[0]).toMatchObject({ onDelete: "CASCADE", onUpdate: undefined });
    expect(post.foreignKeys[0]?.columns.map((column) => column.databaseName)).toEqual(["author_id"]);
    expect(post.foreignKeys[0]?.referencedEntityMetadata.name).toBe("User");
    expect(post.foreignKeys[0]?.referencedColumns.map((column) => column.databaseName)).toEqual(["id"]);
    expect(post.foreignKeys[0]?.name).toMatch(/^FK_/);
  });

  test("should let column-level unique flags create constraints once", () => {
    const tag = findMetadata(buildFixtureMetadatas(), "Tag");

    expect(tag.uniques).toHaveLength(1);
    expect(tag.uniques[0]?.columns.map((column) => column.databaseName)).toEqual(["label"]);
  });

  test("should accept string relation targets, explicit referenced columns and custom constraint names", () => {
    @Entity("md_countries")
    class Country {
      @PrimaryColumn({ type: "varchar" })
      public code = "";

      @Column({ type: "varchar", unique: true })
      public slug = "";
    }

    @Entity("md_cities")
    @Index("IDX_city_country", ["country"])
    @Unique(["name", "country"])
    class City {
      @PrimaryGeneratedColumn()
      public id?: number;

      @Column({ type: "varchar" })
      public name = "";

      @ManyToOne("Country", { createForeignKeyConstraints: true })
      @JoinColumn({ name: "country_code", referencedColumnName: "slug", foreignKeyConstraintName: "FK_city_country" })
      public country?: Country;

      @ManyToOne(() => "md_countries", { createForeignKeyConstraints: false })
      @JoinColumn({ name: "origin_code" })
      public origin?: Country;
    }

    const [country, city] = build([Country, City]);

    expect(city?.findRelationWithPropertyPath("country")?.inverseEntityMetadata).toBe(country);
    expect(city?.findRelationWithPropertyPath("country")?.joinColumns[0]?.referencedColumn?.propertyName).toBe("slug");
    expect(city?.findRelationWithPropertyPath("origin")?.inverseEntityMetadata).toBe(country);
    expect(city?.foreignKeys.map((foreignKey) => foreignKey.name)).toEqual(["FK_city_country"]);
    expect(city?.indices[0]).toMatchObject({ name: "IDX_city_country" });
    expect(city?.indices[0]?.columns.map((column) => column.databaseName)).toEqual(["country_code"]);
    expect(city?.uniques[0]?.columns.map((column) => column.databaseName)).toEqual(["name", "country_code"]);
  });

  test("should pick up columns and relations declared on a base class", () => {
    abstract class Timestamped {
      @PrimaryGeneratedColumn()
      public id?: number;

      @Column({ type: "varchar" })
      public label = "";
    }

    @Entity("md_children")
    class Child extends Timestamped {
      @Column({ type: "varchar", name: "child_label" })
      public override label = "";

      @Column({ type: "integer" })
      public extra = 0;
    }

    const [child] = build([Child]);

    expect(child?.columns.map((column) => [column.propertyName, column.databaseName])).toEqual([
      ["id", "id"],
      ["label", "child_label"],
      ["extra", "extra"],
    ]);
    expect(child?.findColumnWithPropertyName("id")?.isGenerated).toBe(true);
  });

  test("should name the second junction column of a self-referencing many-to-many apart", () => {
    @Entity("md_nodes")
    class Node {
      @PrimaryGeneratedColumn()
      public id?: number;

      @ManyToMany(() => Node)
      @JoinTable({ name: "md_node_links" })
      public links?: Node[];
    }

    const [node] = build([Node]);
    const junction = node?.findRelationWithPropertyPath("links")?.junction;

    expect(junction?.joinColumns.map((column) => column.databaseName)).toEqual(["mdNodesId"]);
    expect(junction?.inverseJoinColumns.map((column) => column.databaseName)).toEqual(["mdNodesId_1"]);
  });

  test("should resolve a one-to-one inverse side without an explicit selector", () => {
    @Entity("md_keys")
    class Key {
      @PrimaryGeneratedColumn()
      public id?: number;

      @OneToOne(
        () => Lock,
        (lock) => lock.key,
      )
      public lock?: { id?: number } | null;
    }

    @Entity("md_locks")
    class Lock {
      @PrimaryGeneratedColumn()
      public id?: number;

      @OneToOne(() => Key)
      @JoinColumn()
      public key?: Key;
    }

    const [key, lock] = build([Key, Lock]);
    const lockKey = lock?.findRelationWithPropertyPath("key");

    expect(lockKey?.isOwning).toBe(true);
    expect(lockKey?.joinColumns.map((column) => column.databaseName)).toEqual(["keyId"]);
    expect(lockKey?.inverseRelation).toBe(key?.findRelationWithPropertyPath("lock"));
    expect(key?.findRelationWithPropertyPath("lock")?.isOwning).toBe(false);
  });

  test("should reject entities without a primary column", () => {
    @Entity("md_no_pk")
    class NoPrimary {
      @Column({ type: "varchar" })
      public name = "";
    }

    expect(() => build([NoPrimary])).toThrow(MissingPrimaryColumnError);
  });

  test("should reject classes that are not decorated or relations to unknown entities", () => {
    class Undecorated {}

    @Entity("md_orphans")
    class Orphan {
      @PrimaryGeneratedColumn()
      public id?: number;

      @ManyToOne(() => Undecorated)
      public parent?: Undecorated;
    }

    expect(() => build([Undecorated])).toThrow(EntityMetadataNotFoundError);
    expect(() => build([Orphan])).toThrow(EntityMetadataNotFoundError);
  });

  test("should reject inverse sides that do not exist and one-to-many without a many-to-one", () => {
    @Entity("md_bad_parents")
    class BadParent {
      @PrimaryGeneratedColumn()
      public id?: number;

      @OneToMany(
        () => BadChild,
        (child) => child.missing,
      )
      public children?: BadChild[];
    }

    @Entity("md_bad_children")
    class BadChild {
      @PrimaryGeneratedColumn()
      public id?: number;

      public missing?: BadParent;
    }

    @Entity("md_lonely_parents")
    class LonelyParent {
      @PrimaryGeneratedColumn()
      public id?: number;

      @OneToMany(() => LonelyChild)
      public children?: LonelyChild[];
    }

    @Entity("md_lonely_children")
    class LonelyChild {
      @PrimaryGeneratedColumn()
      public id?: number;
    }

    @Entity("md_left")
    class Left {
      @PrimaryGeneratedColumn()
      public id?: number;

      @ManyToMany(() => Right)
      public rights?: Right[];
    }

    @Entity("md_right")
    class Right {
      @PrimaryGeneratedColumn()
      public id?: number;
    }

    expect(() => build([BadParent, BadChild])).toThrow(RelationNotFoundError);
    expect(() => build([LonelyParent, LonelyChild])).toThrow(RelationNotFoundError);
    expect(() => build([Left, Right])).toThrow("needs @JoinTable()");
  });

  test("should reject join columns, indices and uniques over unknown properties", () => {
    @Entity("md_targets")
    class Target {
      @PrimaryGeneratedColumn()
      public id?: number;
    }

    @Entity("md_bad_join")
    class BadJoin {
      @PrimaryGeneratedColumn()
      public id?: number;

      @ManyToOne(() => Target)
      @JoinColumn({ referencedColumnName: "nope" })
      public target?: Target;
    }

    @Entity("md_bad_index")
    @Index(["nope"])
    class BadIndex {
      @PrimaryGeneratedColumn()
      public id?: number;
    }

    @Entity("md_bad_junction")
    class BadJunction {
      @PrimaryGeneratedColumn()
      public id?: number;

      @ManyToMany(() => Target)
      @JoinTable({ inverseJoinColumn: { referencedColumnName: "nope" } })
      public targets?: Target[];
    }

    expect(() => build([Target, BadJoin])).toThrow(EntityPropertyNotFoundError);
    expect(() => build([BadIndex])).toThrow(EntityPropertyNotFoundError);
    expect(() => build([Target, BadJunction])).toThrow(EntityPropertyNotFoundError);
  });

  test("should build the fixture graph in any order", () => {
    const metadatas = build([Profile, Tag, Post, User]);

    expect(metadatas.map((metadata) => metadata.name)).toEqual(["Profile", "Tag", "Post", "User"]);
  });
});

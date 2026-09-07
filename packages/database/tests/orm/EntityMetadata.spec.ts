import { describe, expect, test } from "bun:test";
import { ColumnMetadata, EntityMetadata, RelationMetadata } from "../../src/orm/EntityMetadata";
import { MissingPrimaryColumnError } from "../../src/orm/errors";
import { Post, Profile, Tag, User } from "../fixtures/entities";
import { buildFixtureMetadatas, fakeColumn, findMetadata } from "../fixtures/metadata";

enum Numeric {
  One = 1,
  Two = 2,
}

describe("ColumnMetadata", () => {
  test("should infer the type from the column mode when none is given", () => {
    expect(fakeColumn({}).type).toBe("varchar");
    expect(fakeColumn({}, "version").type).toBe("integer");
    expect(fakeColumn({}, "createDate").type).toBe("timestamp");
    expect(fakeColumn({}, "updateDate").type).toBe("timestamp");
    expect(fakeColumn({}, "deleteDate").type).toBe("timestamp");
    expect(fakeColumn({ type: "text" }, "createDate").type).toBe("text");
  });

  test("should expose the flags derived from the options", () => {
    const column = fakeColumn(
      {
        type: "integer",
        primary: true,
        nullable: true,
        unique: true,
        array: true,
        select: false,
        insert: false,
        update: false,
        length: 10,
        width: 4,
        precision: 8,
        scale: 2,
        default: 5,
        comment: "count",
      },
      "regular",
      "increment",
    );

    expect(column).toMatchObject({
      isPrimary: true,
      isNullable: true,
      isUnique: true,
      isArray: true,
      isSelect: false,
      isInsert: false,
      isUpdate: false,
      isGenerated: true,
      generationStrategy: "increment",
      length: 10,
      width: 4,
      precision: 8,
      scale: 2,
      default: 5,
      comment: "count",
      isVirtual: false,
    });

    const plain = fakeColumn({});

    expect(plain).toMatchObject({
      isPrimary: false,
      isNullable: false,
      isSelect: true,
      isInsert: true,
      isUpdate: true,
      isGenerated: false,
      isCreateDate: false,
      isVersion: false,
    });
    expect(fakeColumn({}, "createDate").isCreateDate).toBe(true);
    expect(fakeColumn({}, "updateDate").isUpdateDate).toBe(true);
    expect(fakeColumn({}, "deleteDate").isDeleteDate).toBe(true);
    expect(fakeColumn({}, "version").isVersion).toBe(true);
  });

  test("should normalise enum members from arrays, string enums and numeric enums", () => {
    expect(fakeColumn({ type: "enum", enum: ["a", "b"] }).enum).toEqual(["a", "b"]);
    expect(fakeColumn({ type: "enum", enum: { A: "a", B: "b" } }).enum).toEqual(["a", "b"]);
    expect(fakeColumn({ type: "enum", enum: Numeric }).enum).toEqual([1, 2]);
    expect(fakeColumn({}).enum).toBeUndefined();
  });

  test("transformTo and transformFrom should chain transformers in opposite orders", () => {
    const column = fakeColumn({
      transformer: [
        { to: (value: unknown) => `${value}-a`, from: (value: unknown) => String(value).replace(/-a$/, "") },
        { to: (value: unknown) => `${value}-b`, from: (value: unknown) => String(value).replace(/-b$/, "") },
      ],
    });
    const single = fakeColumn({
      transformer: { to: (value: unknown) => Number(value) * 2, from: (value: unknown) => Number(value) / 2 },
    });

    expect(column.transformTo("x")).toBe("x-a-b");
    expect(column.transformFrom("x-a-b")).toBe("x");
    expect(single.transformTo(2)).toBe(4);
    expect(single.transformFrom(4)).toBe(2);
    expect(fakeColumn({}).transformTo("x")).toBe("x");
  });

  test("getEntityValue and setEntityValue should read and write the property", () => {
    const column = fakeColumn({ name: "db_value" });
    const entity: Record<string, unknown> = { value: 1 };

    expect(column.databaseName).toBe("db_value");
    expect(column.getEntityValue(entity)).toBe(1);

    column.setEntityValue(entity, 2);

    expect(entity.value).toBe(2);
  });

  test("foreign key columns should read through the relation", () => {
    const post = findMetadata(buildFixtureMetadatas(), "Post");
    const authorId = post.findColumnWithDatabaseName("author_id") as ColumnMetadata;
    const author = Object.assign(new User(), { id: "u1" });

    expect(authorId.isVirtual).toBe(true);
    expect(authorId.relationMetadata?.propertyName).toBe("author");
    expect(authorId.referencedColumn?.propertyName).toBe("id");
    expect(authorId.getEntityValue({ author })).toBe("u1");
    expect(authorId.getEntityValue({ author: "u2" })).toBe("u2");
    expect(authorId.getEntityValue({ author: null })).toBeNull();
    expect(authorId.getEntityValue({})).toBeUndefined();

    const target: Record<string, unknown> = {};
    authorId.setEntityValue(target, "u3");

    expect(target).toEqual({});
  });
});

describe("RelationMetadata", () => {
  const metadatas = buildFixtureMetadatas();
  const user = findMetadata(metadatas, "User");
  const post = findMetadata(metadatas, "Post");
  const tag = findMetadata(metadatas, "Tag");
  const relation = (metadata: EntityMetadata, name: string): RelationMetadata =>
    metadata.findRelationWithPropertyPath(name) as RelationMetadata;

  test("should classify relation types and ownership", () => {
    const author = relation(post, "author");
    const posts = relation(user, "posts");
    const profile = relation(user, "profile");
    const tags = relation(post, "tags");
    const tagPosts = relation(tag, "posts");

    expect(author).toMatchObject({ isManyToOne: true, isToOne: true, isOwning: true, isWithJoinColumn: true });
    expect(posts).toMatchObject({ isOneToMany: true, isToMany: true, isOwning: false, isWithJoinColumn: false });
    expect(profile).toMatchObject({
      isOneToOne: true,
      isOneToOneOwner: true,
      isOneToOneNotOwner: false,
      isEager: true,
    });
    expect(tags).toMatchObject({ isManyToMany: true, isManyToManyOwner: true, isManyToManyNotOwner: false });
    expect(tagPosts).toMatchObject({ isManyToManyOwner: false, isManyToManyNotOwner: true });
    expect(author.inverseEntityMetadata).toBe(user);
    expect(author.inverseRelation).toBe(posts);
    expect(posts.inverseRelation).toBe(author);
    expect(author.inverseSidePropertyPath).toBe("posts");
  });

  test("should expand cascade options", () => {
    const all = relation(user, "posts");
    const none = relation(post, "author");
    const partial = new RelationMetadata({
      entityMetadata: user,
      args: {
        target: User,
        propertyName: "x",
        relationType: "many-to-one",
        type: () => Post,
        options: { cascade: ["insert", "recover"] },
      },
    });

    expect(all).toMatchObject({
      isCascadeInsert: true,
      isCascadeUpdate: true,
      isCascadeRemove: true,
      isCascadeSoftRemove: true,
      isCascadeRecover: true,
    });
    expect(none).toMatchObject({ isCascadeInsert: false, isCascadeRemove: false });
    expect(partial).toMatchObject({ isCascadeInsert: true, isCascadeUpdate: false, isCascadeRecover: true });
    expect(partial.isNullable).toBe(true);
    expect(partial.createForeignKeyConstraints).toBe(true);
  });

  test("should read relation options", () => {
    const author = relation(post, "author");
    const strict = new RelationMetadata({
      entityMetadata: user,
      args: {
        target: User,
        propertyName: "x",
        relationType: "many-to-one",
        type: () => Post,
        options: {
          nullable: false,
          onUpdate: "SET NULL",
          createForeignKeyConstraints: false,
          orphanedRowAction: "delete",
        },
      },
    });

    expect(author.onDelete).toBe("CASCADE");
    expect(strict).toMatchObject({
      isNullable: false,
      onUpdate: "SET NULL",
      createForeignKeyConstraints: false,
      orphanedRowAction: "delete",
    });
  });

  test("getEntityValue and setEntityValue should use the property", () => {
    const author = relation(post, "author");
    const entity: Record<string, unknown> = {};

    author.setEntityValue(entity, "x");

    expect(author.getEntityValue(entity)).toBe("x");
  });
});

describe("EntityMetadata", () => {
  const metadatas = buildFixtureMetadatas();
  const user = findMetadata(metadatas, "User");
  const post = findMetadata(metadatas, "Post");
  const tag = findMetadata(metadatas, "Tag");

  test("should describe the table", () => {
    const schemaBound = new EntityMetadata({
      args: { target: Profile, schema: "app", synchronize: false },
      tableName: "p",
    });

    expect(user).toMatchObject({
      target: User,
      name: "User",
      tableName: "users",
      schema: undefined,
      synchronize: true,
    });
    expect(user.tablePath).toBe("users");
    expect(schemaBound.tablePath).toBe("app.p");
    expect(schemaBound.synchronize).toBe(false);
  });

  test("should group columns by role", () => {
    const names = (columns: ColumnMetadata[]): string[] => columns.map((column) => column.propertyName);

    expect(names(user.primaryColumns)).toEqual(["id"]);
    expect(names(user.ownColumns)).not.toContain("profile");
    expect(user.columns.some((column) => column.databaseName === "profile_id" && column.isVirtual)).toBe(true);
    expect(names(user.nonPrimaryColumns)).toContain("name");
    expect(names(post.generatedColumns)).toEqual(["id"]);
    expect(user.createDateColumn?.propertyName).toBe("createdAt");
    expect(user.updateDateColumn?.propertyName).toBe("updatedAt");
    expect(user.deleteDateColumn?.propertyName).toBe("deletedAt");
    expect(user.versionColumn?.propertyName).toBe("version");
    expect(post.deleteDateColumn).toBeUndefined();
    expect(user.hasMultiplePrimaryKeys).toBe(false);
  });

  test("should group relations by role", () => {
    expect(user.eagerRelations.map((relation) => relation.propertyName)).toEqual(["profile"]);
    expect(user.ownerRelations.map((relation) => relation.propertyName)).toEqual(["profile"]);
    expect(post.manyToManyOwnerRelations.map((relation) => relation.propertyName)).toEqual(["tags"]);
    expect(tag.manyToManyOwnerRelations).toEqual([]);
    expect(user.hasRelationWithPropertyPath("posts")).toBe(true);
    expect(user.hasRelationWithPropertyPath("nope")).toBe(false);
  });

  test("should find columns by property name, database name and relation", () => {
    expect(user.findColumnWithPropertyName("isActive")?.databaseName).toBe("is_active");
    expect(user.findColumnWithPropertyName("profile")).toBeUndefined();
    expect(user.findColumnWithDatabaseName("profile_id")?.isVirtual).toBe(true);
    expect(user.findJoinColumnsForRelation("profile").map((column) => column.databaseName)).toEqual(["profile_id"]);
    expect(user.findJoinColumnsForRelation("posts")).toEqual([]);
  });

  test("createPropertiesMap should map every property and relation to its own name", () => {
    const map = user.createPropertiesMap();

    expect(map.id).toBe("id");
    expect(map.posts).toBe("posts");
    expect(map.profile).toBe("profile");
    expect(user.createPropertiesMap()).toBe(map);
  });

  test("create should instantiate the class so field initialisers run", () => {
    const entity = user.create();

    expect(entity).toBeInstanceOf(User);
    expect(entity.age).toBe(0);
  });

  test("id helpers should handle present, missing and composite keys", () => {
    const alice = Object.assign(new User(), { id: "u1" });

    expect(user.hasId(alice)).toBe(true);
    expect(user.hasId(new User())).toBe(false);
    expect(user.hasId(null)).toBe(false);
    expect(user.hasId(undefined)).toBe(false);
    expect(user.getEntityIdMap(alice)).toEqual({ id: "u1" });
    expect(user.getEntityIdMap(new User())).toBeUndefined();
    expect(user.getEntityIdMixedMap(alice)).toBe("u1");
    expect(user.getEntityIdMixedMap(new User())).toBeUndefined();
    expect(user.ensureEntityIdMap("u2")).toEqual({ id: "u2" });
    expect(user.ensureEntityIdMap({ id: "u3" })).toEqual({ id: "u3" });
    expect(user.getIdKey({ id: "u1" })).toBe("u1");
    expect(user.compareIds({ id: "u1" }, { id: "u1" })).toBe(true);
    expect(user.compareIds({ id: "u1" }, { id: "u2" })).toBe(false);
    expect(user.compareIds(undefined, { id: "u1" })).toBe(false);
  });

  test("composite keys should be reported as maps and compared per column", () => {
    const composite = new EntityMetadata({ args: { target: Tag }, tableName: "composite" });
    const dateColumn = fakeColumn({ primary: true, type: "timestamp" });

    composite.columns = [
      new ColumnMetadata({
        entityMetadata: composite,
        args: { target: Tag, propertyName: "a", mode: "regular", options: { primary: true } },
        databaseName: "a",
      }),
      new ColumnMetadata({
        entityMetadata: composite,
        args: { target: Tag, propertyName: "b", mode: "regular", options: { primary: true } },
        databaseName: "b",
      }),
    ];

    expect(composite.hasMultiplePrimaryKeys).toBe(true);
    expect(composite.getEntityIdMixedMap({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(composite.ensureEntityIdMap({ a: 1, b: 2, c: 3 })).toEqual({ a: 1, b: 2 });
    expect(() => composite.ensureEntityIdMap(1)).toThrow(MissingPrimaryColumnError);
    expect(composite.getIdKey({ a: 1, b: 2 })).toBe("1|2");
    expect(composite.compareIds({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);

    const dated = new EntityMetadata({ args: { target: Tag }, tableName: "dated" });
    dated.columns = [dateColumn];
    const first = { value: new Date("2024-01-01T00:00:00.000Z") };
    const second = { value: new Date("2024-01-01T00:00:00.000Z") };

    expect(dated.compareIds(first, second)).toBe(true);
    expect(dated.ensureEntityIdMap(first.value)).toEqual({ value: first.value });
  });

  test("ensureEntityIdMap should refuse an entity without primary columns", () => {
    const empty = new EntityMetadata({ args: { target: Tag }, tableName: "empty" });

    expect(() => empty.ensureEntityIdMap(1)).toThrow(MissingPrimaryColumnError);
  });
});

import { describe, expect, test } from "bun:test";
import { SqliteDriver } from "../../../src/orm/driver/SqliteDriver";
import type { EntityMetadata } from "../../../src/orm/EntityMetadata";
import { type AliasType, QueryExpressionMap } from "../../../src/orm/query-builder/QueryExpressionMap";
import {
  RawSqlResultsToEntityTransformer,
  rawColumnName,
} from "../../../src/orm/query-builder/RawSqlResultsToEntityTransformer";
import { Post, Profile, Tag, User } from "../../fixtures/entities";
import { buildFixtureMetadatas, findMetadata } from "../../fixtures/metadata";

const driver = new SqliteDriver({ type: "sqlite", database: ":memory:" });
const metadatas = buildFixtureMetadatas();
const users = findMetadata(metadatas, "User");
const posts = findMetadata(metadatas, "Post");
const tags = findMetadata(metadatas, "Tag");
const profiles = findMetadata(metadatas, "Profile");

const alias = (name: string, metadata?: EntityMetadata): AliasType => ({ name, metadata });

const relationOf = (metadata: EntityMetadata, property: string) => {
  const relation = metadata.findRelationWithPropertyPath(property);

  if (!relation) {
    throw new Error(`No relation ${property}`);
  }

  return relation;
};

describe("rawColumnName", () => {
  test("should join the alias and the column with an underscore", () => {
    expect(rawColumnName("user", "created_at")).toBe("user_created_at");
  });
});

describe("RawSqlResultsToEntityTransformer", () => {
  test("should hydrate one entity per primary key and convert the column values", () => {
    const map = new QueryExpressionMap();
    const main = map.createAlias(alias("user", users));
    const rows = [
      {
        user_id: "u1",
        user_name: "Alice",
        user_is_active: 1,
        user_settings: '{"a":1}',
        user_roles: "a,b",
        user_created_at: "2024-01-02 03:04:05",
      },
      {
        user_id: "u1",
        user_name: "Alice",
        user_is_active: 1,
        user_settings: '{"a":1}',
        user_roles: "a,b",
        user_created_at: "2024-01-02 03:04:05",
      },
      {
        user_id: "u2",
        user_name: "Bob",
        user_is_active: 0,
        user_settings: null,
        user_roles: null,
        user_created_at: null,
      },
    ];
    const entities = new RawSqlResultsToEntityTransformer(map, driver).transform(rows, main) as User[];

    expect(entities).toHaveLength(2);
    expect(entities[0]).toBeInstanceOf(User);
    expect(entities[0]).toMatchObject({
      id: "u1",
      name: "Alice",
      isActive: true,
      settings: { a: 1 },
      roles: ["a", "b"],
      createdAt: new Date("2024-01-02T03:04:05Z"),
    });
    expect(entities[1]).toMatchObject({ id: "u2", isActive: false, settings: null, roles: null, createdAt: null });
    expect("age" in (entities[0] as object) && entities[0]?.age).toBe(0);
  });

  test("should nest joined relations, grouping to-many rows and nulling missing to-one rows", () => {
    const map = new QueryExpressionMap();
    const main = map.createAlias(alias("user", users));
    const postAlias = map.createAlias(alias("post", posts));
    const tagAlias = map.createAlias(alias("tag", tags));
    const profileAlias = map.createAlias(alias("profile", profiles));

    map.joinAttributes.push(
      {
        direction: "LEFT",
        alias: postAlias,
        parentAlias: "user",
        relation: relationOf(users, "posts"),
        isSelected: true,
      },
      {
        direction: "LEFT",
        alias: tagAlias,
        parentAlias: "post",
        relation: relationOf(posts, "tags"),
        isSelected: true,
      },
      {
        direction: "LEFT",
        alias: profileAlias,
        parentAlias: "user",
        relation: relationOf(users, "profile"),
        isSelected: true,
      },
      {
        direction: "LEFT",
        alias: alias("ignored", tags),
        parentAlias: "user",
        relation: relationOf(users, "posts"),
        isSelected: false,
      },
    );

    const rows = [
      {
        user_id: "u1",
        post_id: 1,
        post_title: "First",
        tag_id: 1,
        tag_label: "intro",
        profile_id: 9,
        profile_bio: "hi",
      },
      {
        user_id: "u1",
        post_id: 1,
        post_title: "First",
        tag_id: 2,
        tag_label: "news",
        profile_id: 9,
        profile_bio: "hi",
      },
      {
        user_id: "u1",
        post_id: 2,
        post_title: "Second",
        tag_id: null,
        tag_label: null,
        profile_id: 9,
        profile_bio: "hi",
      },
      {
        user_id: "u2",
        post_id: null,
        post_title: null,
        tag_id: null,
        tag_label: null,
        profile_id: null,
        profile_bio: null,
      },
    ];
    const [alice, bob] = new RawSqlResultsToEntityTransformer(map, driver).transform(rows, main) as User[];

    expect(alice?.posts?.map((post) => post.title)).toEqual(["First", "Second"]);
    expect(alice?.posts?.[0]).toBeInstanceOf(Post);
    expect(alice?.posts?.[0]?.tags?.map((tag) => tag.label)).toEqual(["intro", "news"]);
    expect(alice?.posts?.[0]?.tags?.[0]).toBeInstanceOf(Tag);
    expect(alice?.posts?.[1]?.tags).toEqual([]);
    expect(alice?.profile).toBeInstanceOf(Profile);
    expect(alice?.profile?.bio).toBe("hi");
    expect(bob?.posts).toEqual([]);
    expect(bob?.profile).toBeNull();
  });

  test("should map joins onto arbitrary properties as one or many", () => {
    const map = new QueryExpressionMap();
    const main = map.createAlias(alias("user", users));
    const latest = map.createAlias(alias("latest", posts));
    const all = map.createAlias(alias("all", posts));

    map.joinAttributes.push(
      { direction: "LEFT", alias: latest, isSelected: true, mapToProperty: "user.latestPost", isMappingMany: false },
      { direction: "LEFT", alias: all, isSelected: true, mapToProperty: "user.everyPost", isMappingMany: true },
      { direction: "LEFT", alias: all, isSelected: true, mapToProperty: "other.everyPost", isMappingMany: true },
    );

    const rows = [
      { user_id: "u1", latest_id: 2, latest_title: "Second", all_id: 1, all_title: "First" },
      { user_id: "u1", latest_id: 2, latest_title: "Second", all_id: 2, all_title: "Second" },
    ];
    const [alice] = new RawSqlResultsToEntityTransformer(map, driver).transform(rows, main) as (User & {
      latestPost?: Post | null;
      everyPost?: Post[];
      other?: unknown;
    })[];

    expect(alice?.latestPost?.title).toBe("Second");
    expect(alice?.everyPost?.map((post) => post.id)).toEqual([1, 2]);
    expect(alice?.other).toBeUndefined();
  });

  test("should treat rows without primary values as separate entities and skip empty ones", () => {
    const map = new QueryExpressionMap();
    const main = map.createAlias(alias("user", users));
    const transformer = new RawSqlResultsToEntityTransformer(map, driver);

    const anonymous = transformer.transform([{ user_name: "a" }, { user_name: "a" }], main) as User[];
    expect(anonymous.map((user) => user.name)).toEqual(["a", "a"]);

    expect(transformer.transform([{ unrelated: 1 }], main)).toEqual([]);
    expect(transformer.transform([], main)).toEqual([]);
    expect(transformer.transform([{ x: 1 }], alias("raw"))).toEqual([]);
  });
});

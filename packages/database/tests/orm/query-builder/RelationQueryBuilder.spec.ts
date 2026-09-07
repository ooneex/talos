import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EntityTargetType } from "../../../src";
import type { DataSource } from "../../../src/orm/DataSource";
import { InvalidCriteriaError, RelationNotFoundError } from "../../../src/orm/errors";
import { createSqliteDataSource, Post, seedAlice, Tag, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

describe("RelationQueryBuilder", () => {
  let dataSource: DataSource;

  const relation = (target: EntityTargetType, path: string) => dataSource.createQueryBuilder().relation(target, path);
  const authorOf = async (postId: number): Promise<string | null | undefined> =>
    (await dataSource.getRepository(Post).findOne({ where: { id: postId }, relations: ["author"] }))?.author?.id ??
    null;
  const tagsOf = async (postId: number): Promise<string[]> =>
    ((await dataSource.getRepository(Post).findOne({ where: { id: postId }, relations: ["tags"] }))?.tags ?? [])
      .map((tag) => tag.label)
      .sort();

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    await seedAlice(dataSource);
    await dataSource.getRepository(User).save({ id: "u2", name: "Bob" });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe("set", () => {
    test("should point a many-to-one at an entity, an id or nothing", async () => {
      const bob = await dataSource.getRepository(User).findOneByOrFail({ id: "u2" });

      await relation(Post, "author").of({ id: 1 }).set(bob);
      expect(await authorOf(1)).toBe("u2");

      await relation(Post, "author").of(1).set("u1");
      expect(await authorOf(1)).toBe("u1");

      await relation(Post, "author").of([1, 2]).set(null);
      expect(await authorOf(1)).toBeNull();
      expect(await authorOf(2)).toBeNull();
    });

    test("should refuse to-many relations and entities without an id", async () => {
      expect(relation(Post, "tags").of(1).set(1)).rejects.toBeInstanceOf(InvalidCriteriaError);
      expect(relation(Post, "author").of(new Post()).set("u1")).rejects.toBeInstanceOf(InvalidCriteriaError);
    });
  });

  describe("add / remove", () => {
    test("should link and unlink many-to-many rows through the junction table", async () => {
      const [intro, news] = await dataSource.getRepository(Tag).find({ order: { label: "ASC" } });
      const fresh = await dataSource.getRepository(Tag).save({ label: "fresh" });

      expect(await tagsOf(2)).toEqual(["news"]);

      await relation(Post, "tags")
        .of(2)
        .add([intro as Tag, fresh.id as number]);
      expect(await tagsOf(2)).toEqual(["fresh", "intro", "news"]);

      await relation(Post, "tags")
        .of(2)
        .add(intro as Tag);
      expect(await tagsOf(2)).toEqual(["fresh", "intro", "news"]);

      await relation(Post, "tags")
        .of({ id: 2 })
        .remove([news as Tag, fresh]);
      expect(await tagsOf(2)).toEqual(["intro"]);

      await relation(Post, "tags")
        .of(2)
        .addAndRemove(news as Tag, intro as Tag);
      expect(await tagsOf(2)).toEqual(["news"]);

      await relation(Post, "tags").of(2).add([]);
      await relation(Post, "tags").of([]).add(fresh);
      await relation(Post, "tags").of(2).remove([]);
      expect(await tagsOf(2)).toEqual(["news"]);
    });

    test("should move rows of a one-to-many by rewriting their foreign key", async () => {
      await relation(User, "posts")
        .of("u2")
        .add([1, { id: 2 }]);
      expect(await authorOf(1)).toBe("u2");
      expect(await authorOf(2)).toBe("u2");

      await relation(User, "posts").of("u2").remove(1);
      expect(await authorOf(1)).toBeNull();
      expect(await authorOf(2)).toBe("u2");

      await relation(User, "posts").of("u1").remove(2);
      expect(await authorOf(2)).toBe("u2");
    });

    test("should refuse to-one relations and ambiguous owners", async () => {
      expect(relation(Post, "author").of(1).add("u1")).rejects.toBeInstanceOf(InvalidCriteriaError);
      expect(relation(Post, "author").of(1).remove("u1")).rejects.toBeInstanceOf(InvalidCriteriaError);
      expect(relation(User, "posts").of(["u1", "u2"]).add(1)).rejects.toBeInstanceOf(InvalidCriteriaError);
    });
  });

  describe("load", () => {
    test("loadOne and loadMany should return the related entities", async () => {
      const author = await relation(Post, "author").of(1).loadOne<User>();
      const tags = await relation(Post, "tags").of([1, 2]).loadMany<Tag>();
      const posts = await relation(User, "posts").of("u1").loadMany<Post>();

      expect(author).toBeInstanceOf(User);
      expect(author?.name).toBe("Alice");
      expect(tags.map((tag) => tag.label).sort()).toEqual(["intro", "news", "news"]);
      expect(posts.map((post) => post.title).sort()).toEqual(["First", "Second"]);
      expect(await relation(User, "posts").of("nobody").loadMany()).toEqual([]);
      expect(await relation(Post, "author").of([]).loadOne()).toBeUndefined();
    });
  });

  test("should reject unknown relations, missing targets and getQuery()", () => {
    const dialect = createDialectDataSource("sqlite");

    expect(() => dialect.createQueryBuilder().relation(Post, "nothing").of(1).loadMany()).toThrow(
      RelationNotFoundError,
    );
    expect(() => dialect.createQueryBuilder().relation("tags").of(1).loadMany()).toThrow(InvalidCriteriaError);
    expect(() => dialect.createQueryBuilder().relation(Post, "tags").getQuery()).toThrow(InvalidCriteriaError);
  });
});

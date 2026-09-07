import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DataSource } from "../../src/orm/DataSource";
import type { EntityManager } from "../../src/orm/EntityManager";
import { EntityNotFoundError, InvalidCriteriaError, QueryFailedError } from "../../src/orm/errors";
import { In, MoreThan } from "../../src/orm/FindOperator";
import type { QueryRunner } from "../../src/orm/QueryRunner";
import type { QueryBuilder } from "../../src/orm/query-builder/QueryBuilder";
import { Repository } from "../../src/orm/Repository";
import { createSqliteDataSource, Post, Profile, seedAlice, Tag, User } from "../fixtures/entities";

const runnerOf = (qb: QueryBuilder<object>): QueryRunner | undefined =>
  (qb as unknown as { queryRunner?: QueryRunner }).queryRunner;

describe("EntityManager", () => {
  let dataSource: DataSource;
  let manager: EntityManager;

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    manager = dataSource.manager;
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe("plumbing", () => {
    test("should expose the data source, its repositories and raw queries", async () => {
      expect(manager.dataSource).toBe(dataSource);
      expect(manager.connection).toBe(dataSource);
      expect(manager.queryRunner).toBeUndefined();
      expect(manager.getRepository(User)).toBe(dataSource.getRepository(User));
      expect(await manager.query<{ one: number }>("SELECT $1 AS one", [1])).toEqual([{ one: 1 }]);
      expect(manager.createQueryBuilder().expressionMap.mainAlias).toBeUndefined();
      expect(manager.createQueryBuilder(User, "u").expressionMap.mainAlias?.name).toBe("u");
      expect(manager.createQueryBuilder(User, "").expressionMap.mainAlias?.name).toBe("");

      await manager.release();
    });

    test("a transactional manager should hand out repositories bound to its runner and cache them", async () => {
      await manager.transaction(async (tx) => {
        const users = tx.getRepository(User);

        expect(tx.queryRunner?.isTransactionActive).toBe(true);
        expect(users).toBeInstanceOf(Repository);
        expect(users.manager).toBe(tx);
        expect(tx.getRepository(User)).toBe(users);
        expect(tx.getRepository("users")).toBe(users);
        expect(users).not.toBe(dataSource.getRepository(User));
        expect(runnerOf(tx.createQueryBuilder(User, "u"))).toBe(tx.queryRunner);
        expect(runnerOf(tx.createQueryBuilder())).toBe(tx.queryRunner);
        expect(runnerOf(users.createQueryBuilder())).toBe(tx.queryRunner);
        expect(runnerOf(manager.createQueryBuilder())).toBeUndefined();
      });
    });

    test("nested transactions should become savepoints that roll back on their own", async () => {
      await manager.transaction(async (tx) => {
        await tx.save(Object.assign(new Tag(), { label: "outer" }));

        await expect(
          tx.transaction(async (inner) => {
            expect(inner).toBe(tx);
            await inner.save(Object.assign(new Tag(), { label: "inner" }));
            expect(await inner.count(Tag)).toBe(2);
            throw new Error("undo inner");
          }),
        ).rejects.toThrow("undo inner");

        expect(await tx.count(Tag)).toBe(1);
        expect(tx.queryRunner?.isTransactionActive).toBe(true);
      });

      expect(await manager.count(Tag)).toBe(1);
      expect((await manager.find(Tag)).map((tag) => tag.label)).toEqual(["outer"]);
    });

    test("transaction should release its runner even when the work fails", async () => {
      let captured: EntityManager | undefined;

      await expect(
        manager.transaction("SERIALIZABLE", async (tx) => {
          captured = tx;
          throw new Error("fail");
        }),
      ).rejects.toThrow("fail");

      expect(captured?.queryRunner?.isReleased).toBe(true);
      expect(captured?.queryRunner?.isTransactionActive).toBe(false);
    });
  });

  describe("identity and plain objects", () => {
    test("hasId / getId should work with or without an explicit target", async () => {
      const alice = Object.assign(new User(), { id: "u1" });
      const post = new Post();

      expect(manager.hasId(alice)).toBe(true);
      expect(manager.hasId(User, alice)).toBe(true);
      expect(manager.hasId(post)).toBe(false);
      expect(manager.getId(alice)).toBe("u1");
      expect(manager.getId(Post, Object.assign(new Post(), { id: 4 }))).toBe(4);
      expect(manager.getId(post)).toBeUndefined();
    });

    test("create should instantiate entities and turn nested plain objects into related entities", () => {
      const empty = manager.create(User);
      const alice = manager.create(User, {
        id: "u1",
        name: "Alice",
        profile: { bio: "hi" },
        posts: [{ title: "a", tags: [{ label: "x" }, 7 as unknown as Tag] }],
      });
      const many = manager.create(Tag, [{ label: "a" }, { label: "b" }]);

      expect(empty).toBeInstanceOf(User);
      expect(empty.id).toBe("");
      expect(alice).toBeInstanceOf(User);
      expect(alice.profile).toBeInstanceOf(Profile);
      expect(alice.profile?.bio).toBe("hi");
      expect(alice.posts?.[0]).toBeInstanceOf(Post);
      expect(alice.posts?.[0]?.tags?.[0]).toBeInstanceOf(Tag);
      expect(alice.posts?.[0]?.tags?.[0]?.label).toBe("x");
      // A bare value stands for the related entity's primary key.
      expect(alice.posts?.[0]?.tags?.[1]).toBeInstanceOf(Tag);
      expect(alice.posts?.[0]?.tags?.[1]?.id).toBe(7);
      expect(many.map((tag) => tag.label)).toEqual(["a", "b"]);
      expect(many[0]).toBeInstanceOf(Tag);
    });

    test("create should keep entity instances, wrap single to-many values and accept null relations", () => {
      const tag = Object.assign(new Tag(), { id: 1, label: "kept" });
      const post = manager.create(Post, { tags: tag as unknown as Tag[], author: null });
      const author = manager.create(Post, { author: "u9" as unknown as User });

      expect(post.tags).toEqual([tag]);
      expect(post.tags?.[0]).toBe(tag);
      expect(post.author).toBeNull();
      expect(author.author).toBeInstanceOf(User);
      expect(author.author?.id).toBe("u9");
    });

    test("merge should apply several plain objects onto an entity", () => {
      const user = manager.create(User, { id: "u1", name: "A" });

      const merged = manager.merge(User, user, { name: "B" }, { age: 5, profile: { bio: "p" } });

      expect(merged).toBe(user);
      expect(user.name).toBe("B");
      expect(user.age).toBe(5);
      expect(user.profile).toBeInstanceOf(Profile);
    });

    test("preload should load the stored entity and merge the plain object into it", async () => {
      await seedAlice(dataSource);

      const loaded = await manager.preload(User, { id: "u1", name: "Alicia" });
      const missing = await manager.preload(User, { id: "nope", name: "x" });
      const noId = await manager.preload(User, { name: "x" });

      expect(loaded).toBeInstanceOf(User);
      expect(loaded?.name).toBe("Alicia");
      expect(loaded?.age).toBe(30);
      expect(loaded?.profile?.bio).toBe("hello");
      expect(missing).toBeUndefined();
      expect(noId).toBeUndefined();
    });
  });

  describe("save / remove", () => {
    test("save should insert a graph and hand back the same objects with generated values", async () => {
      const alice = await seedAlice(dataSource);

      expect(alice).toBeInstanceOf(User);
      expect(alice.createdAt).toBeInstanceOf(Date);
      expect(alice.version).toBe(1);
      expect(alice.profile?.id).toBe(1);
      expect(alice.posts?.map((post) => post.id)).toEqual([1, 2]);
      expect(alice.posts?.[0]?.tags?.map((tag) => tag.id)).toEqual([1, 2]);
      expect(await manager.count(Post)).toBe(2);
      expect(await manager.count(Tag)).toBe(2);
      expect(await manager.query("SELECT COUNT(*) AS n FROM post_tags")).toEqual([{ n: 3 }]);
    });

    test("save should accept every argument shape and return empty inputs untouched", async () => {
      const single = await manager.save(Object.assign(new Tag(), { label: "one" }));
      const list = await manager.save([Object.assign(new Tag(), { label: "two" })], { chunk: 1 });
      const targeted = await manager.save(Tag, { label: "three" });
      const targetedList = await manager.save(Tag, [{ label: "four" }, { label: "five" }], { transaction: false });
      const none = await manager.save([]);

      expect(single.id).toBe(1);
      expect(list[0]?.id).toBe(2);
      expect(targeted.id).toBe(3);
      expect(targetedList.map((tag) => tag.id)).toEqual([4, 5]);
      expect(none).toEqual([]);
      expect(await manager.count(Tag)).toBe(5);
    });

    test("save should update existing rows and bump the version", async () => {
      const alice = await seedAlice(dataSource);
      const updatedAt = alice.updatedAt;

      alice.name = "Alicia";
      alice.age = 31;

      const saved = await manager.save(alice);

      expect(saved).toBe(alice);
      expect(alice.version).toBe(2);
      expect(alice.updatedAt).toBeInstanceOf(Date);
      expect(alice.updatedAt).not.toBe(updatedAt);

      const stored = await manager.findOneBy(User, { id: "u1" });

      expect(stored?.name).toBe("Alicia");
      expect(stored?.age).toBe(31);
      expect(stored?.version).toBe(2);
    });

    test("save should skip reloading when asked", async () => {
      const tag = Object.assign(new Tag(), { label: "quiet" });

      await manager.save(tag, { reload: false });

      expect(tag.id).toBeUndefined();
      expect(await manager.count(Tag)).toBe(1);
    });

    test("save should roll back the whole graph when one write fails", async () => {
      await manager.save(Tag, { label: "dup" });

      await expect(manager.save(Tag, [{ label: "fresh" }, { label: "dup" }])).rejects.toBeInstanceOf(QueryFailedError);

      expect((await manager.find(Tag)).map((tag) => tag.label)).toEqual(["dup"]);
    });

    test("remove should delete the entities, cascade and clear their ids", async () => {
      const alice = await seedAlice(dataSource);
      const post = alice.posts?.[0] as Post;

      const removed = await manager.remove(alice);

      expect(removed).toBe(alice);
      expect(alice.id).toBeUndefined();
      expect(post.id).toBeUndefined();
      expect(alice.profile?.id).toBeUndefined();
      expect(await manager.count(User)).toBe(0);
      expect(await manager.count(Post)).toBe(0);
      expect(await manager.count(Profile)).toBe(0);
      // `cascade: true` on Post.tags removes the tags through the many-to-many as well.
      expect(await manager.count(Tag)).toBe(0);
      expect(await manager.query("SELECT COUNT(*) AS n FROM post_tags")).toEqual([{ n: 0 }]);
    });

    test("remove should accept every argument shape", async () => {
      const [a, b, c, d] = (await manager.save(
        manager.create(Tag, [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }]),
      )) as [Tag, Tag, Tag, Tag];

      expect(await manager.remove([])).toEqual([]);
      expect(await manager.remove(a)).toBe(a);
      expect(await manager.remove([b], { chunk: 1 })).toEqual([b]);
      expect(await manager.remove(Tag, c, { transaction: false })).toBe(c);
      expect(await manager.remove(Tag, [d])).toEqual([d]);
      expect(await manager.count(Tag)).toBe(0);
    });

    test("softRemove and recover should stamp and clear the delete date", async () => {
      const alice = await seedAlice(dataSource);

      const removed = await manager.softRemove(alice);

      expect(removed).toBe(alice);
      expect(alice.deletedAt).toBeInstanceOf(Date);
      expect(await manager.count(User)).toBe(0);
      expect(await manager.count(User, { withDeleted: true })).toBe(1);

      const recovered = await manager.recover(User, [alice], { transaction: false });

      expect(recovered).toEqual([alice]);
      expect(alice.deletedAt).toBeNull();
      expect(await manager.count(User)).toBe(1);
      expect(await manager.softRemove([])).toEqual([]);
      expect(await manager.recover(User, [], {})).toEqual([]);
    });
  });

  describe("bulk statements", () => {
    test("insert should write rows without loading entities and report identifiers", async () => {
      const result = await manager.insert(Tag, [{ label: "a" }, { label: "b" }]);

      expect(result.identifiers).toEqual([{ id: 1 }, { id: 2 }]);
      expect(await manager.count(Tag)).toBe(2);
    });

    test("update, delete, softDelete and restore should accept ids, id lists and where objects", async () => {
      await seedAlice(dataSource);
      await manager.save(User, { id: "u2", name: "Bob", age: 20 });

      expect((await manager.update(User, "u1", { age: 40 })).affected).toBe(1);
      expect((await manager.update(User, ["u1", "u2"], { isActive: false })).affected).toBe(2);
      expect((await manager.update(User, { name: "Bob" }, { age: 21 })).affected).toBe(1);
      expect((await manager.update(User, [{ name: "Bob" }, { name: "Alice" }], { roles: ["x"] })).affected).toBe(2);
      expect((await manager.findOneBy(User, { id: "u2" }))?.age).toBe(21);

      expect((await manager.softDelete(User, "u2")).affected).toBe(1);
      expect(await manager.count(User)).toBe(1);
      expect((await manager.restore(User, { id: "u2" })).affected).toBe(1);
      expect(await manager.count(User)).toBe(2);

      // SQLite counts the junction rows its foreign keys cascade-delete; clear them for a stable count.
      await manager.query("DELETE FROM post_tags");
      expect((await manager.delete(Post, [1, 2])).affected).toBe(2);
      expect((await manager.delete(User, { age: MoreThan(30) })).affected).toBe(1);
      expect(await manager.count(User)).toBe(1);
    });

    test("update and delete should refuse empty criteria", async () => {
      await expect(manager.update(User, {}, { age: 1 })).rejects.toBeInstanceOf(InvalidCriteriaError);
      await expect(manager.delete(User, [])).rejects.toBeInstanceOf(InvalidCriteriaError);
      await expect(manager.softDelete(User, undefined as unknown as string)).rejects.toBeInstanceOf(
        InvalidCriteriaError,
      );
      await expect(manager.restore(User, null as unknown as string)).rejects.toBeInstanceOf(InvalidCriteriaError);
    });

    test("upsert should insert new rows and update the conflicting ones", async () => {
      await manager.insert(Tag, { label: "keep" });

      const result = await manager.upsert(Tag, [{ id: 1, label: "renamed" }, { label: "new" }], ["id"]);

      expect(result.identifiers).toEqual([{ id: 1 }, { id: 2 }]);
      expect((await manager.find(Tag, { order: { id: "ASC" } })).map((tag) => tag.label)).toEqual(["renamed", "new"]);

      await manager.upsert(
        Tag,
        { label: "new" },
        { conflictPaths: { label: true }, skipUpdateIfNoValuesChanged: true },
      );
      expect(await manager.count(Tag)).toBe(2);
    });

    test("upsert should refresh the update date column and ignore unknown properties", async () => {
      await seedAlice(dataSource);
      const before = (await manager.findOneBy(User, { id: "u1" }))?.updatedAt;

      await Bun.sleep(5);
      await manager.upsert(User, { id: "u1", name: "Alice2", nope: 1 } as Partial<User>, ["id"]);

      const after = await manager.findOneBy(User, { id: "u1" });

      expect(after?.name).toBe("Alice2");
      expect(after?.updatedAt?.getTime()).toBeGreaterThan(before?.getTime() ?? Number.NaN);
    });

    test("clear should empty the table", async () => {
      await manager.insert(Tag, [{ label: "a" }, { label: "b" }]);

      await manager.clear(Tag);

      expect(await manager.count(Tag)).toBe(0);
    });

    test("increment and decrement should adjust a numeric column", async () => {
      await seedAlice(dataSource);

      expect((await manager.increment(Post, { title: "First" }, "views", 5)).affected).toBe(1);
      expect((await manager.decrement(Post, [1, 2], "views", "2")).affected).toBe(2);
      expect((await manager.find(Post, { order: { id: "ASC" } })).map((post) => post.views)).toEqual([13, 3]);

      await expect(manager.increment(Post, 1, "nope", 1)).rejects.toBeInstanceOf(InvalidCriteriaError);
      await expect(manager.increment(Post, 1, "views", "many")).rejects.toBeInstanceOf(InvalidCriteriaError);
    });
  });

  describe("reads", () => {
    beforeEach(async () => {
      await seedAlice(dataSource);
      await manager.save(User, { id: "u2", name: "Bob", age: 20, isActive: false });
      await manager.save(User, { id: "u3", name: "Carol", age: 45 });
    });

    test("find family should filter, order, page and load relations", async () => {
      const all = await manager.find(User, { order: { age: "DESC" } });
      const paged = await manager.find(User, { order: { age: "ASC" }, skip: 1, take: 1 });
      const by = await manager.findBy(User, { age: MoreThan(25) });
      const either = await manager.findBy(User, [{ name: "Bob" }, { name: "Carol" }]);
      const withPosts = await manager.find(User, { where: { id: "u1" }, relations: { posts: { tags: true } } });
      const selected = await manager.find(User, { select: { id: true, name: true }, where: { id: "u2" } });

      expect(all.map((user) => user.name)).toEqual(["Carol", "Alice", "Bob"]);
      expect(paged.map((user) => user.name)).toEqual(["Alice"]);
      expect(by.map((user) => user.name).sort()).toEqual(["Alice", "Carol"]);
      expect(either.length).toBe(2);
      expect(withPosts[0]?.posts?.length).toBe(2);
      expect(withPosts[0]?.posts?.flatMap((post) => post.tags?.map((tag) => tag.label) ?? []).sort()).toEqual([
        "intro",
        "news",
        "news",
      ]);
      expect(selected[0]?.name).toBe("Bob");
      expect(selected[0]?.settings).toBeUndefined();
      expect(selected[0]?.createdAt).toBeUndefined();
      expect((await manager.findOneBy(User, { id: "u2" }))?.settings).toBeNull();
    });

    test("findAndCount should return the page and the total", async () => {
      const [page, total] = await manager.findAndCount(User, { take: 2, order: { name: "ASC" } });
      const [bobs, bobCount] = await manager.findAndCountBy(User, { name: "Bob" });

      expect(page.map((user) => user.name)).toEqual(["Alice", "Bob"]);
      expect(total).toBe(3);
      expect(bobs.length).toBe(1);
      expect(bobCount).toBe(1);
    });

    test("findByIds should skip unknown ids and return nothing for none", async () => {
      expect((await manager.findByIds(User, ["u1", "u3", "zz"])).map((user) => user.id).sort()).toEqual(["u1", "u3"]);
      expect(await manager.findByIds(User, [])).toEqual([]);
    });

    test("findOne family should return one entity, null or throw", async () => {
      expect((await manager.findOne(User, { where: { name: "Bob" } }))?.id).toBe("u2");
      expect((await manager.findOneBy(User, { id: "u3" }))?.name).toBe("Carol");
      expect((await manager.findOneById(User, "u1"))?.name).toBe("Alice");
      expect((await manager.findOneById(Post, 2))?.title).toBe("Second");
      expect(await manager.findOneById(User, "nope")).toBeNull();
      expect(await manager.findOneBy(User, { name: "Nobody" })).toBeNull();
      expect((await manager.findOneOrFail(User, { where: { id: "u1" } })).name).toBe("Alice");
      expect((await manager.findOneByOrFail(User, { id: In(["u2"]) })).name).toBe("Bob");

      const failure = await manager.findOneOrFail(User, { where: { id: "nope" } }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(EntityNotFoundError);
      expect((failure as EntityNotFoundError).message).toContain("User");
      await expect(manager.findOneByOrFail(User, { id: "nope" })).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    test("count and exists should respect where options", async () => {
      expect(await manager.count(User)).toBe(3);
      expect(await manager.count(User, { where: { age: MoreThan(25) } })).toBe(2);
      expect(await manager.countBy(User, { isActive: false })).toBe(1);
      expect(await manager.exists(User)).toBe(true);
      expect(await manager.exists(User, { where: { name: "Zed" } })).toBe(false);
      expect(await manager.existsBy(User, { name: "Carol" })).toBe(true);
      expect(await manager.existsBy(User, [{ name: "Zed" }, { name: "Bob" }])).toBe(true);
    });

    test("aggregates should compute over the column or return null on no rows", async () => {
      expect(await manager.sum(User, "age")).toBe(95);
      expect(await manager.average(User, "age", { age: MoreThan(25) })).toBe(37.5);
      expect(await manager.minimum(User, "age")).toBe(20);
      expect(await manager.maximum(User, "age", [{ name: "Bob" }, { name: "Alice" }])).toBe(30);
      expect(await manager.sum(User, "age", { name: "Zed" })).toBeNull();
      expect(await manager.maximum(Post, "views")).toBe(10);
    });
  });
});

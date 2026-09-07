import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DataSource } from "../../src/orm/DataSource";
import { EntityNotFoundError, InvalidCriteriaError } from "../../src/orm/errors";
import { MoreThan } from "../../src/orm/FindOperator";
import type { Repository } from "../../src/orm/Repository";
import { createSqliteDataSource, Post, Profile, seedAlice, Tag, User } from "../fixtures/entities";

describe("Repository", () => {
  let dataSource: DataSource;
  let users: Repository<User>;
  let tags: Repository<Tag>;

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    users = dataSource.getRepository(User);
    tags = dataSource.getRepository(Tag);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  test("should know its target, metadata and manager", async () => {
    expect(users.target).toBe(User);
    expect(users.metadata).toBe(dataSource.getMetadata(User));
    expect(users.manager).toBe(dataSource.manager);
    expect(users.queryRunner).toBeUndefined();
    expect(users.createQueryBuilder().expressionMap.mainAlias?.name).toBe("users");
    expect(users.createQueryBuilder("u").expressionMap.mainAlias?.name).toBe("u");
    expect(await users.query<{ one: number }>("SELECT $1 AS one", [1])).toEqual([{ one: 1 }]);
  });

  test("should build entities and tell whether they have an id", () => {
    const alice = users.create({ id: "u1", name: "Alice", profile: { bio: "hi" } });
    const blank = users.create();
    const many = tags.create([{ label: "a" }, { label: "b" }]);

    expect(alice).toBeInstanceOf(User);
    expect(alice.profile).toBeInstanceOf(Profile);
    expect(blank).toBeInstanceOf(User);
    expect(many.map((tag) => tag.label)).toEqual(["a", "b"]);
    expect(users.hasId(alice)).toBe(true);
    expect(users.hasId(blank)).toBe(false);
    expect(users.getId(alice)).toBe("u1");
    expect(tags.getId(many[0] as Tag)).toBeUndefined();
    expect(users.merge(alice, { age: 3 }, { name: "B" })).toBe(alice);
    expect(alice.age).toBe(3);
    expect(alice.name).toBe("B");
  });

  test("should save, preload, soft-remove, recover and remove entities", async () => {
    const alice = await seedAlice(dataSource);

    expect(await users.count()).toBe(1);

    const preloaded = await users.preload({ id: "u1", age: 99 });

    expect(preloaded?.age).toBe(99);
    expect(preloaded?.name).toBe("Alice");
    expect(await users.preload({ id: "zz" })).toBeUndefined();

    await users.softRemove(alice);
    expect(await users.count()).toBe(0);
    expect(await users.count({ withDeleted: true })).toBe(1);

    await users.recover([alice]);
    expect(await users.count()).toBe(1);

    const saved = await tags.save([{ label: "x" }, { label: "y" }], { chunk: 1 });

    expect(saved.map((tag) => tag.id)).toEqual([3, 4]);

    await tags.remove(tags.create(saved));
    expect(await tags.count()).toBe(2);

    await users.remove([alice]);
    expect(await users.count()).toBe(0);
    expect(await dataSource.getRepository(Post).count()).toBe(0);
  });

  test("should run bulk statements", async () => {
    await seedAlice(dataSource);
    const posts = dataSource.getRepository(Post);

    expect((await tags.insert({ label: "bulk" })).identifiers).toEqual([{ id: 3 }]);
    expect((await tags.upsert({ id: 3, label: "bulk!" }, ["id"])).identifiers).toEqual([{ id: 3 }]);
    // Nothing to overwrite besides the conflict column: the row is left as it is.
    await tags.upsert([{ label: "bulk!" }], { conflictPaths: ["label"] });
    expect((await tags.findOneBy({ id: 3 }))?.label).toBe("bulk!");
    expect(await tags.count()).toBe(3);

    expect((await users.update("u1", { age: 50 })).affected).toBe(1);
    expect((await posts.increment({ title: "First" }, "views", 1)).affected).toBe(1);
    expect((await posts.decrement([1, 2], "views", 3)).affected).toBe(2);
    expect((await posts.find({ order: { id: "ASC" } })).map((post) => post.views)).toEqual([8, 2]);

    expect((await users.softDelete("u1")).affected).toBe(1);
    expect(await users.exists()).toBe(false);
    expect((await users.restore({ id: "u1" })).affected).toBe(1);
    expect(await users.existsBy({ age: 50 })).toBe(true);

    await dataSource.query("DELETE FROM post_tags");
    expect((await posts.delete({ views: MoreThan(5) })).affected).toBe(1);
    await expect(posts.delete({})).rejects.toBeInstanceOf(InvalidCriteriaError);

    await tags.clear();
    expect(await tags.count()).toBe(0);
  });

  test("should read through every find variant", async () => {
    await seedAlice(dataSource);
    await users.save([
      { id: "u2", name: "Bob", age: 20 },
      { id: "u3", name: "Carol", age: 45 },
    ]);

    expect((await users.find({ order: { age: "DESC" } })).map((user) => user.name)).toEqual(["Carol", "Alice", "Bob"]);
    expect((await users.findBy({ age: MoreThan(25) })).length).toBe(2);
    expect(await users.findAndCount({ take: 1, order: { name: "ASC" } })).toEqual([
      [expect.objectContaining({ name: "Alice" })],
      3,
    ]);
    expect((await users.findAndCountBy({ name: "Bob" }))[1]).toBe(1);
    expect((await users.findByIds(["u1", "u3"])).length).toBe(2);
    expect((await users.findOne({ where: { name: "Bob" } }))?.id).toBe("u2");
    expect((await users.findOneBy({ id: "u3" }))?.name).toBe("Carol");
    expect((await users.findOneById("u1"))?.name).toBe("Alice");
    expect(await users.findOneById("nope")).toBeNull();
    expect((await users.findOneOrFail({ where: { id: "u1" } })).name).toBe("Alice");
    expect((await users.findOneByOrFail({ id: "u2" })).name).toBe("Bob");
    await expect(users.findOneOrFail({ where: { id: "nope" } })).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(users.findOneByOrFail({ id: "nope" })).rejects.toBeInstanceOf(EntityNotFoundError);

    expect(await users.count({ where: { age: MoreThan(25) } })).toBe(2);
    expect(await users.countBy({ name: "Bob" })).toBe(1);
    expect(await users.sum("age")).toBe(95);
    expect(await users.average("age", { age: MoreThan(25) })).toBe(37.5);
    expect(await users.minimum("age")).toBe(20);
    expect(await users.maximum("age", { name: "Bob" })).toBe(20);
  });

  test("extend should add methods that see the repository as this", async () => {
    await seedAlice(dataSource);

    const extended = users.extend({
      async findByName(name: string): Promise<User | null> {
        return this.findOneBy({ name });
      },
      label(): string {
        return `${this.metadata.name}!`;
      },
    });

    expect((await extended.findByName("Alice"))?.id).toBe("u1");
    expect(extended.label()).toBe("User!");
    expect(await extended.count()).toBe(1);
    expect(extended.target).toBe(User);
    expect(Object.getPrototypeOf(extended)).toBe(users);
    expect((users as unknown as Record<string, unknown>).findByName).toBeUndefined();
  });

  test("a repository from a transactional manager should work inside the transaction", async () => {
    await dataSource
      .transaction(async (manager) => {
        const txTags = manager.getRepository(Tag);

        expect(txTags.manager).toBe(manager);
        await txTags.save({ label: "tx" });
        expect(await txTags.count()).toBe(1);
        throw new Error("rollback");
      })
      .catch(() => undefined);

    expect(await tags.count()).toBe(0);
  });
});

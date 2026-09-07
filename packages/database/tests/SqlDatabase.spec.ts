import { afterEach, describe, expect, test } from "bun:test";
import { DataSource } from "../src/orm/DataSource";
import { EntityManager } from "../src/orm/EntityManager";
import { Repository } from "../src/orm/Repository";
import { SqlDatabase } from "../src/SqlDatabase";
import { fixtureEntities, User } from "./fixtures/entities";

class MemoryDatabase extends SqlDatabase {
  public created = 0;

  public getSource(database?: string): DataSource {
    if (!this.source) {
      this.created += 1;
      this.source = new DataSource({
        type: "sqlite",
        database: database ?? ":memory:",
        entities: fixtureEntities,
        synchronize: true,
      });
    }

    return this.source;
  }
}

describe("SqlDatabase", () => {
  let database: MemoryDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  test("open should initialize the source once and return the entity repository", async () => {
    database = new MemoryDatabase();

    const users = await database.open(User);
    const again = await database.open(User);

    expect(users).toBeInstanceOf(Repository);
    expect(again).toBe(users);
    expect(database.created).toBe(1);
    expect(database.getSource().isInitialized).toBe(true);
  });

  test("open should expose a working repository", async () => {
    database = new MemoryDatabase();
    const users = await database.open(User);

    await users.save(users.create({ id: "u1", name: "Alice" }));

    expect(await users.count()).toBe(1);
  });

  test("close should destroy an initialized source and ignore a closed one", async () => {
    database = new MemoryDatabase();

    await database.open(User);
    await database.close();

    expect(database.getSource().isInitialized).toBe(false);

    await expect(database.close()).resolves.toBeUndefined();
  });

  test("drop should remove every table of an initialized source", async () => {
    database = new MemoryDatabase();
    const users = await database.open(User);

    await database.drop();

    await expect(users.count()).rejects.toThrow("no such table");
  });

  test("drop should do nothing when the source is not initialized", async () => {
    database = new MemoryDatabase();

    await expect(database.drop()).resolves.toBeUndefined();
    expect(database.getSource().isInitialized).toBe(false);
  });

  test("getEntityManager should return the manager of the source", async () => {
    database = new MemoryDatabase();

    expect(database.getEntityManager()).toBeInstanceOf(EntityManager);
    expect(database.getEntityManager()).toBe(database.getSource().manager);
  });
});

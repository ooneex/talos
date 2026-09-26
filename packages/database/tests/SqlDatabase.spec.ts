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

class CatalogDatabase extends SqlDatabase {
  public created = 0;

  public getSource(identity = "catalog"): DataSource {
    return this.sharedSource(identity, () => {
      this.created += 1;

      return new DataSource({
        type: "sqlite",
        database: ":memory:",
        entities: this.registeredEntities(),
      });
    });
  }
}

class OtherCatalogDatabase extends SqlDatabase {
  public getSource(): DataSource {
    return this.sharedSource("other-catalog", () => {
      return new DataSource({
        type: "sqlite",
        database: ":memory:",
        entities: this.registeredEntities(),
      });
    });
  }
}

class ConnectedDatabase extends SqlDatabase {
  public getSource(identity: string): DataSource {
    return this.sharedSource(identity, () => {
      return new DataSource({
        type: "sqlite",
        database: ":memory:",
        entities: this.registeredEntities(),
      });
    });
  }
}

const processSourceOf = (name: string): { identity: string; source: DataSource } | undefined => {
  return (globalThis as Record<symbol, { identity: string; source: DataSource } | undefined>)[
    Symbol.for(`@talosjs/database:source:${name}`)
  ];
};

describe("SqlDatabase.registerEntities", () => {
  test("should store each entity once and keep registries separate", () => {
    class Item {}
    class OtherItem {}
    class ForeignItem {}

    CatalogDatabase.registerEntities(Item);
    CatalogDatabase.registerEntities(OtherItem, Item);
    OtherCatalogDatabase.registerEntities(ForeignItem);

    const entities = new CatalogDatabase().getSource().options.entities as unknown[];
    const foreign = new OtherCatalogDatabase().getSource().options.entities as unknown[];
    const key = Symbol.for("@talosjs/database:entities:CatalogDatabase");
    const registry = (globalThis as Record<symbol, Set<unknown> | undefined>)[key];

    expect(entities).toContain(Item);
    expect(entities).toContain(OtherItem);
    expect(entities).not.toContain(ForeignItem);
    expect(entities.filter((entity) => entity === Item)).toHaveLength(1);
    expect(foreign).toEqual([ForeignItem]);
    expect(registry?.has(Item)).toBe(true);
  });
});

describe("SqlDatabase.sharedSource", () => {
  afterEach(async () => {
    for (const name of ["CatalogDatabase", "OtherCatalogDatabase", "ConnectedDatabase"]) {
      const cached = processSourceOf(name);

      if (cached?.source.isInitialized) {
        await cached.source.destroy();
      }

      delete (globalThis as Record<symbol, unknown>)[Symbol.for(`@talosjs/database:source:${name}`)];
    }
  });

  test("should reuse one source across instances with the same identity", () => {
    const first = new CatalogDatabase();
    const second = new CatalogDatabase();
    const source = first.getSource("shared");

    expect(second.getSource("shared")).toBe(source);
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(processSourceOf("CatalogDatabase")?.source).toBe(source);
  });

  test("should keep the instance source when asked again", () => {
    const database = new CatalogDatabase();
    const source = database.getSource("sticky");

    expect(database.getSource("other")).toBe(source);
    expect(database.created).toBe(1);
  });

  test("should open a new source when the identity changes and the previous one is closed", () => {
    const first = new CatalogDatabase().getSource("closed-a");
    const second = new CatalogDatabase().getSource("closed-b");

    expect(second).not.toBe(first);
    expect(first.isInitialized).toBe(false);
    expect(processSourceOf("CatalogDatabase")?.identity).toBe("closed-b");
  });

  test("should close the previous source when the identity changes and it is connected", async () => {
    const first = new ConnectedDatabase().getSource("open-a");

    await first.initialize();

    const second = new ConnectedDatabase().getSource("open-b");

    expect(second).not.toBe(first);
    expect(first.isInitialized).toBe(false);
    expect(second.isInitialized).toBe(false);

    await Bun.sleep(20);
  });
});

import { describe, expect, mock, spyOn, test } from "bun:test";
import type { DataSource, EntityManager, Repository } from "typeorm";
import { TypeormDatabase } from "../src/TypeormDatabase";

const makeMockSource = (initialized = false) => ({
  isInitialized: initialized,
  initialize: mock(() => Promise.resolve()),
  destroy: mock(() => Promise.resolve()),
  dropDatabase: mock(() => Promise.resolve()),
  getRepository: mock(() => ({}) as Repository<never>),
  manager: {} as EntityManager,
});

class TestDatabase extends TypeormDatabase {
  constructor(private mockSource: ReturnType<typeof makeMockSource>) {
    super();
  }

  public getSource(_database?: string): DataSource {
    return this.mockSource as unknown as DataSource;
  }
}

describe("TypeormDatabase", () => {
  describe("open", () => {
    test("should initialize source when not initialized", async () => {
      const source = makeMockSource(false);
      const db = new TestDatabase(source);
      await db.open(class Entity {});
      expect(source.initialize).toHaveBeenCalledTimes(1);
    });

    test("should skip initialize when already initialized", async () => {
      const source = makeMockSource(true);
      const db = new TestDatabase(source);
      await db.open(class Entity {});
      expect(source.initialize).not.toHaveBeenCalled();
    });

    test("should return repository from source", async () => {
      const source = makeMockSource(true);
      const db = new TestDatabase(source);
      const repo = await db.open(class Entity {});
      expect(repo).toBeDefined();
      expect(source.getRepository).toHaveBeenCalledTimes(1);
    });

    test("should pass database arg to getSource", async () => {
      const source = makeMockSource(true);
      const db = new TestDatabase(source);
      const spy = spyOn(db, "getSource");
      await db.open(class Entity {}, "mydb");
      expect(spy).toHaveBeenCalledWith("mydb");
    });
  });

  describe("close", () => {
    test("should destroy source when initialized", async () => {
      const source = makeMockSource(true);
      const db = new TestDatabase(source);
      await db.close();
      expect(source.destroy).toHaveBeenCalledTimes(1);
    });

    test("should skip destroy when not initialized", async () => {
      const source = makeMockSource(false);
      const db = new TestDatabase(source);
      await db.close();
      expect(source.destroy).not.toHaveBeenCalled();
    });

    test("should pass database arg to getSource", async () => {
      const source = makeMockSource(false);
      const db = new TestDatabase(source);
      const spy = spyOn(db, "getSource");
      await db.close("mydb");
      expect(spy).toHaveBeenCalledWith("mydb");
    });
  });

  describe("drop", () => {
    test("should drop database when initialized", async () => {
      const source = makeMockSource(true);
      const db = new TestDatabase(source);
      await db.drop();
      expect(source.dropDatabase).toHaveBeenCalledTimes(1);
    });

    test("should skip drop when not initialized", async () => {
      const source = makeMockSource(false);
      const db = new TestDatabase(source);
      await db.drop();
      expect(source.dropDatabase).not.toHaveBeenCalled();
    });

    test("should pass database arg to getSource", async () => {
      const source = makeMockSource(false);
      const db = new TestDatabase(source);
      const spy = spyOn(db, "getSource");
      await db.drop("mydb");
      expect(spy).toHaveBeenCalledWith("mydb");
    });
  });

  describe("getEntityManager", () => {
    test("should return entity manager from source", () => {
      const source = makeMockSource();
      const db = new TestDatabase(source);
      expect(db.getEntityManager()).toBe(source.manager);
    });

    test("should pass database arg to getSource", () => {
      const source = makeMockSource();
      const db = new TestDatabase(source);
      const spy = spyOn(db, "getSource");
      db.getEntityManager("mydb");
      expect(spy).toHaveBeenCalledWith("mydb");
    });
  });
});

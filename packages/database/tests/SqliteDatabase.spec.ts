import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { DatabaseException } from "../src/DatabaseException";
import { SqliteDriver } from "../src/orm/driver/SqliteDriver";
import { SqlDatabase } from "../src/SqlDatabase";
import { SqliteDatabase } from "../src/SqliteDatabase";
import { fixtureEntities, Tag } from "./fixtures/entities";

describe("SqliteDatabase", () => {
  const originalPath = process.env.SQLITE_DATABASE_PATH;

  beforeEach(() => {
    delete process.env.SQLITE_DATABASE_PATH;
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.SQLITE_DATABASE_PATH;
    } else {
      process.env.SQLITE_DATABASE_PATH = originalPath;
    }
  });

  test("should extend SqlDatabase", () => {
    expect(new SqliteDatabase(new AppEnv())).toBeInstanceOf(SqlDatabase);
  });

  test("getSource should throw a CONNECTION_FAILED exception without a path", () => {
    const database = new SqliteDatabase(new AppEnv());

    expect(() => database.getSource()).toThrow(DatabaseException);
    expect(() => database.getSource()).toThrow("SQLite database path is required");

    try {
      database.getSource();
    } catch (error) {
      expect((error as DatabaseException).key).toBe("CONNECTION_FAILED");
    }
  });

  test("getSource should read the path from SQLITE_DATABASE_PATH", () => {
    process.env.SQLITE_DATABASE_PATH = "var/test.sqlite";

    const source = new SqliteDatabase(new AppEnv()).getSource();

    expect(source.driver).toBeInstanceOf(SqliteDriver);
    expect(source.options).toMatchObject({
      type: "sqlite",
      database: "var/test.sqlite",
      synchronize: false,
      enableWAL: true,
      timeout: 30_000,
    });
  });

  test("getSource should prefer the explicit path and cache the data source", () => {
    process.env.SQLITE_DATABASE_PATH = "var/env.sqlite";
    const database = new SqliteDatabase(new AppEnv());

    const first = database.getSource(":memory:");
    const second = database.getSource("ignored-after-creation");

    expect(first.options).toMatchObject({ database: ":memory:" });
    expect(second).toBe(first);
  });

  test("open should connect to an in-memory database and synchronize the schema", async () => {
    const database = new SqliteDatabase(new AppEnv());
    const source = database.getSource(":memory:");

    Object.assign(source.options, { entities: fixtureEntities, synchronize: true });

    const tags = await database.open(Tag);

    await tags.insert({ label: "news" });

    expect(await tags.count()).toBe(1);

    await database.close();
    expect(source.isInitialized).toBe(false);
  });
});

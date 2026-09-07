import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { DatabaseException } from "../src/DatabaseException";
import { PostgresDriver } from "../src/orm/driver/PostgresDriver";
import { PostgresDatabase } from "../src/PostgresDatabase";
import { SqlDatabase } from "../src/SqlDatabase";

describe("PostgresDatabase", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  test("should extend SqlDatabase and default to a fresh AppEnv", () => {
    process.env.DATABASE_URL = "postgres://talos:secret@localhost:5432/talos";

    const database = new PostgresDatabase();

    expect(database).toBeInstanceOf(SqlDatabase);
    expect(database.getSource().options.type).toBe("postgres");
  });

  test("getSource should build a postgres data source from DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://talos:secret@localhost:5432/talos";

    const source = new PostgresDatabase(new AppEnv()).getSource();

    expect(source.driver).toBeInstanceOf(PostgresDriver);
    expect(source.options).toMatchObject({
      type: "postgres",
      url: "postgres://talos:secret@localhost:5432/talos",
      synchronize: false,
      poolSize: 10,
    });
    expect(source.isInitialized).toBe(false);
  });

  test("getSource should cache the data source and ignore the database argument", () => {
    process.env.DATABASE_URL = "postgres://talos:secret@localhost:5432/talos";
    const database = new PostgresDatabase(new AppEnv());

    const first = database.getSource();
    const second = database.getSource("other");

    expect(second).toBe(first);
  });

  test("getSource should throw a CONNECTION_FAILED exception without DATABASE_URL", () => {
    const database = new PostgresDatabase(new AppEnv());

    expect(() => database.getSource()).toThrow(DatabaseException);
    expect(() => database.getSource()).toThrow("Database URL is required");

    try {
      database.getSource();
    } catch (error) {
      expect((error as DatabaseException).key).toBe("CONNECTION_FAILED");
    }
  });
});

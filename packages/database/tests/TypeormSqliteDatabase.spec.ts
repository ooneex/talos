import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("typeorm", () => ({
  DataSource: class MockDataSource {
    constructor(public config: unknown) {}
    isInitialized = false;
    initialize = mock(() => Promise.resolve());
    destroy = mock(() => Promise.resolve());
    dropDatabase = mock(() => Promise.resolve());
    getRepository = mock(() => ({}));
    manager = {};
  },
}));

import { AppEnv } from "@talosjs/app-env";
import { DatabaseException } from "../src/DatabaseException";
import { TypeormDatabase } from "../src/TypeormDatabase";
import { TypeormSqliteDatabase } from "../src/TypeormSqliteDatabase";

describe("TypeormSqliteDatabase", () => {
  const originalPath = process.env.SQLITE_DATABASE_PATH;

  beforeEach(() => {
    delete process.env.SQLITE_DATABASE_PATH;
  });

  afterEach(() => {
    if (originalPath !== undefined) {
      process.env.SQLITE_DATABASE_PATH = originalPath;
    } else {
      delete process.env.SQLITE_DATABASE_PATH;
    }
  });

  test("should extend TypeormDatabase", () => {
    process.env.SQLITE_DATABASE_PATH = ":memory:";
    const db = new TypeormSqliteDatabase(new AppEnv());
    expect(db).toBeInstanceOf(TypeormDatabase);
  });

  describe("getSource", () => {
    test("should throw DatabaseException when no path is provided or set in env", () => {
      const db = new TypeormSqliteDatabase(new AppEnv());
      expect(() => db.getSource()).toThrow(DatabaseException);
    });

    test("should throw with CONNECTION_FAILED key when no path available", () => {
      const db = new TypeormSqliteDatabase(new AppEnv());
      try {
        db.getSource();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        expect((error as DatabaseException).key).toBe("CONNECTION_FAILED");
      }
    });

    test("should throw with descriptive message about SQLITE_DATABASE_PATH", () => {
      const db = new TypeormSqliteDatabase(new AppEnv());
      expect(() => db.getSource()).toThrow("SQLite database path is required");
    });

    test("should throw when empty string is provided as path", () => {
      const db = new TypeormSqliteDatabase(new AppEnv());
      expect(() => db.getSource("")).toThrow(DatabaseException);
    });

    test("should use SQLITE_DATABASE_PATH environment variable", () => {
      process.env.SQLITE_DATABASE_PATH = ":memory:";
      const db = new TypeormSqliteDatabase(new AppEnv());
      const source = db.getSource();
      expect(source).toBeDefined();
    });

    test("should use provided database arg over env variable", () => {
      process.env.SQLITE_DATABASE_PATH = "/fallback.db";
      const db = new TypeormSqliteDatabase(new AppEnv());
      const source = db.getSource(":memory:");
      expect(source).toBeDefined();
    });

    test("should return same cached source on subsequent calls", () => {
      process.env.SQLITE_DATABASE_PATH = ":memory:";
      const db = new TypeormSqliteDatabase(new AppEnv());
      const source1 = db.getSource();
      const source2 = db.getSource();
      expect(source1).toBe(source2);
    });

    test("should return cached source even when different database arg is passed", () => {
      const db = new TypeormSqliteDatabase(new AppEnv());
      const source1 = db.getSource(":memory:");
      const source2 = db.getSource("/other.db");
      expect(source1).toBe(source2);
    });
  });
});

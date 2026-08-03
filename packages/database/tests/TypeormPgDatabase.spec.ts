import { describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { DatabaseException } from "../src/DatabaseException";
import { TypeormDatabase } from "../src/TypeormDatabase";
import { TypeormPgDatabase } from "../src/TypeormPgDatabase";

describe("TypeormPgDatabase", () => {
  const originalEnv = { ...Bun.env };

  const restoreEnv = (): void => {
    Bun.env.DATABASE_URL = originalEnv.DATABASE_URL;
  };

  test("constructor should support direct instantiation", () => {
    const database = new TypeormPgDatabase(new AppEnv());

    expect(database).toBeInstanceOf(TypeormPgDatabase);
  });

  test("should extend TypeormDatabase", () => {
    expect(new TypeormPgDatabase()).toBeInstanceOf(TypeormDatabase);
  });

  describe("getSource", () => {
    test("should create a postgres DataSource when DATABASE_URL is configured", () => {
      Bun.env.DATABASE_URL = "postgres://talos:secret@localhost:5432/talos";

      const database = new TypeormPgDatabase(new AppEnv());
      const source = database.getSource();

      expect(source).toBeDefined();
      expect(source).toBe(database.getSource());

      restoreEnv();
    });

    test("should cache and return the same DataSource instance", () => {
      Bun.env.DATABASE_URL = "postgres://talos:secret@localhost:5432/talos";

      const database = new TypeormPgDatabase(new AppEnv());
      const firstSource = database.getSource();
      const secondSource = database.getSource();

      expect(firstSource).toBe(secondSource);

      restoreEnv();
    });

    test("should throw DatabaseException when no URL is configured", () => {
      delete Bun.env.DATABASE_URL;
      const db = new TypeormPgDatabase();
      expect(() => db.getSource()).toThrow(DatabaseException);
      restoreEnv();
    });

    test("should throw with CONNECTION_FAILED key", () => {
      delete Bun.env.DATABASE_URL;
      const db = new TypeormPgDatabase();
      try {
        db.getSource();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        expect((error as DatabaseException).key).toBe("CONNECTION_FAILED");
      }
      restoreEnv();
    });

    test("should throw with descriptive message about DATABASE_URL", () => {
      delete Bun.env.DATABASE_URL;
      const db = new TypeormPgDatabase();
      expect(() => db.getSource()).toThrow("Database URL is required");
      restoreEnv();
    });

    test("should throw regardless of database arg", () => {
      delete Bun.env.DATABASE_URL;
      const db = new TypeormPgDatabase();
      expect(() => db.getSource("mydb")).toThrow(DatabaseException);
      restoreEnv();
    });
  });
});

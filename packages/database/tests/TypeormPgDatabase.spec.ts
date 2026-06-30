import { describe, expect, test } from "bun:test";
import { DatabaseException } from "../src/DatabaseException";
import { TypeormDatabase } from "../src/TypeormDatabase";
import { TypeormPgDatabase } from "../src/TypeormPgDatabase";

describe("TypeormPgDatabase", () => {
  test("should extend TypeormDatabase", () => {
    expect(new TypeormPgDatabase()).toBeInstanceOf(TypeormDatabase);
  });

  describe("getSource", () => {
    test("should throw DatabaseException when no URL is configured", () => {
      const db = new TypeormPgDatabase();
      expect(() => db.getSource()).toThrow(DatabaseException);
    });

    test("should throw with CONNECTION_FAILED key", () => {
      const db = new TypeormPgDatabase();
      try {
        db.getSource();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        expect((error as DatabaseException).key).toBe("CONNECTION_FAILED");
      }
    });

    test("should throw with descriptive message about DATABASE_URL", () => {
      const db = new TypeormPgDatabase();
      expect(() => db.getSource()).toThrow("Database URL is required");
    });

    test("should throw regardless of database arg", () => {
      const db = new TypeormPgDatabase();
      expect(() => db.getSource("mydb")).toThrow(DatabaseException);
    });
  });
});

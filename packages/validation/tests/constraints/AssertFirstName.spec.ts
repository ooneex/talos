import { describe, expect, test } from "bun:test";
import { AssertFirstName } from "@/constraints";

describe("AssertFirstName", () => {
  const validator = new AssertFirstName();

  test("should validate valid first names", () => {
    const validNames = ["John", "Mary", "Alexander", "A"];

    for (const name of validNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject names with numbers", () => {
    const invalidNames = ["John123", "Mary2", "Al3x"];

    for (const name of invalidNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "First name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
      );
    }
  });

  test("should reject names with special characters", () => {
    const invalidNames = ["John@", "Mary!", "Alex#"];

    for (const name of invalidNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "First name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
      );
    }
  });

  test("should reject empty strings", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "First name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
    );
  });

  test("should reject names that are too long", () => {
    const longName = "A".repeat(51);
    const result = validator.validate(longName);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "First name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
    );
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should accept names with spaces, hyphens, and apostrophes", () => {
    const validNames = ["Mary Jane", "Jean-Luc", "O'Connor", "Van Der Berg"];

    for (const name of validNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });
});

import { describe, expect, test } from "bun:test";
import { AssertLastName } from "@/constraints";

describe("AssertLastName", () => {
  const validator = new AssertLastName();

  test("should validate valid last names", () => {
    const validNames = ["Smith", "Johnson", "Brown", "A"];

    for (const name of validNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject names with numbers", () => {
    const invalidNames = ["Smith123", "Johnson2", "Br0wn"];

    for (const name of invalidNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Last name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
      );
    }
  });

  test("should reject names with special characters", () => {
    const invalidNames = ["Smith@", "Johnson!", "Brown#"];

    for (const name of invalidNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Last name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
      );
    }
  });

  test("should reject empty strings", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Last name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
    );
  });

  test("should reject names that are too long", () => {
    const longName = "A".repeat(51);
    const result = validator.validate(longName);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Last name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
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
    const validNames = ["Van Der Berg", "O'Malley", "Smith-Jones", "De La Cruz"];

    for (const name of validNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });
});

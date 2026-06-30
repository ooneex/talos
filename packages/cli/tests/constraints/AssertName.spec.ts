import { describe, expect, test } from "bun:test";
import { AssertName } from "@/constraints/AssertName";

describe("AssertName", () => {
  const validator = new AssertName();

  describe("getConstraint", () => {
    test("should return a string constraint with min length 1", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });
  });

  describe("getErrorMessage", () => {
    test("should return appropriate error message", () => {
      const message = validator.getErrorMessage();
      expect(message).toBe("Name must start with a letter and contain only letters, numbers, and hyphens");
    });
  });

  describe("validate", () => {
    describe("valid names", () => {
      test("should accept names starting with a letter", () => {
        expect(validator.validate("User").isValid).toBe(true);
        expect(validator.validate("user123").isValid).toBe(true);
        expect(validator.validate("User123Name").isValid).toBe(true);
        expect(validator.validate("a").isValid).toBe(true);
        expect(validator.validate("ABC").isValid).toBe(true);
      });

      test("should accept names with hyphens", () => {
        expect(validator.validate("user-name").isValid).toBe(true);
        expect(validator.validate("my-app-123").isValid).toBe(true);
        expect(validator.validate("A-B-C").isValid).toBe(true);
      });
    });

    describe("invalid names", () => {
      test("should reject empty string", () => {
        const result = validator.validate("");
        expect(result.isValid).toBe(false);
      });

      test("should reject names starting with a non-letter", () => {
        expect(validator.validate("123").isValid).toBe(false);
        expect(validator.validate("-name").isValid).toBe(false);
        expect(validator.validate("1abc").isValid).toBe(false);
      });

      test("should reject names with special characters", () => {
        expect(validator.validate("user_name").isValid).toBe(false);
        expect(validator.validate("user.name").isValid).toBe(false);
        expect(validator.validate("user@name").isValid).toBe(false);
        expect(validator.validate("user name").isValid).toBe(false);
      });

      test("should reject non-string values", () => {
        expect(validator.validate(123).isValid).toBe(false);
        expect(validator.validate(null).isValid).toBe(false);
        expect(validator.validate(undefined).isValid).toBe(false);
        expect(validator.validate({}).isValid).toBe(false);
        expect(validator.validate([]).isValid).toBe(false);
      });
    });
  });
});

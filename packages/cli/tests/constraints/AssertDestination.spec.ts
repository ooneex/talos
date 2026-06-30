import { describe, expect, test } from "bun:test";
import { AssertDestination } from "@/constraints/AssertDestination";

describe("AssertDestination", () => {
  const validator = new AssertDestination();

  describe("getConstraint", () => {
    test("should return a string constraint with min length 1", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });
  });

  describe("getErrorMessage", () => {
    test("should return appropriate error message", () => {
      const message = validator.getErrorMessage();
      expect(message).toBe(
        "Destination must be a valid path (letters, numbers, dots, hyphens, underscores, and slashes)",
      );
    });
  });

  describe("validate", () => {
    describe("valid destinations", () => {
      test("should accept the current directory", () => {
        expect(validator.validate(".").isValid).toBe(true);
      });

      test("should accept simple names", () => {
        expect(validator.validate("my-app").isValid).toBe(true);
        expect(validator.validate("my_app").isValid).toBe(true);
        expect(validator.validate("app.v2").isValid).toBe(true);
      });

      test("should accept nested paths", () => {
        expect(validator.validate("apps/my-app").isValid).toBe(true);
        expect(validator.validate("a/b/c").isValid).toBe(true);
      });

      test("should accept relative segments", () => {
        expect(validator.validate("../my-app").isValid).toBe(true);
        expect(validator.validate("./my-app").isValid).toBe(true);
      });
    });

    describe("invalid destinations", () => {
      test("should reject empty string", () => {
        expect(validator.validate("").isValid).toBe(false);
      });

      test("should reject whitespace-only input", () => {
        expect(validator.validate(" ").isValid).toBe(false);
        expect(validator.validate("   ").isValid).toBe(false);
      });

      test("should reject paths containing whitespace", () => {
        expect(validator.validate("my app").isValid).toBe(false);
        expect(validator.validate("apps/my app").isValid).toBe(false);
      });

      test("should reject special characters", () => {
        expect(validator.validate("my*app").isValid).toBe(false);
        expect(validator.validate("app?").isValid).toBe(false);
      });

      test("should reject non-string values", () => {
        expect(validator.validate(123).isValid).toBe(false);
        expect(validator.validate(null).isValid).toBe(false);
        expect(validator.validate(undefined).isValid).toBe(false);
        expect(validator.validate({}).isValid).toBe(false);
      });
    });
  });
});

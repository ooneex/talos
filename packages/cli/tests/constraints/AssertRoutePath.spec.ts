import { describe, expect, test } from "bun:test";
import { AssertRoutePath } from "@/constraints/AssertRoutePath";

describe("AssertRoutePath", () => {
  const validator = new AssertRoutePath();

  describe("getConstraint", () => {
    test("should return a string constraint with min length 1", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });
  });

  describe("getErrorMessage", () => {
    test("should return appropriate error message with examples", () => {
      const message = validator.getErrorMessage();
      expect(message).toContain("/users");
      expect(message).toContain("/api/users/:id");
    });
  });

  describe("validate", () => {
    describe("valid paths", () => {
      test("should accept root path", () => {
        expect(validator.validate("/").isValid).toBe(true);
      });

      test("should accept simple paths", () => {
        expect(validator.validate("/users").isValid).toBe(true);
        expect(validator.validate("/api").isValid).toBe(true);
        expect(validator.validate("/status").isValid).toBe(true);
      });

      test("should accept nested paths", () => {
        expect(validator.validate("/api/users").isValid).toBe(true);
        expect(validator.validate("/api/v1/users").isValid).toBe(true);
        expect(validator.validate("/admin/settings/general").isValid).toBe(true);
      });

      test("should accept paths with parameter segments", () => {
        expect(validator.validate("/users/:id").isValid).toBe(true);
        expect(validator.validate("/api/users/:userId").isValid).toBe(true);
        expect(validator.validate("/users/:id/posts/:postId").isValid).toBe(true);
      });

      test("should accept paths with hyphens and underscores", () => {
        expect(validator.validate("/user-profile").isValid).toBe(true);
        expect(validator.validate("/user_settings").isValid).toBe(true);
        expect(validator.validate("/api/user-accounts/list").isValid).toBe(true);
      });

      test("should accept paths with numbers", () => {
        expect(validator.validate("/v1").isValid).toBe(true);
        expect(validator.validate("/api/v2/users").isValid).toBe(true);
        expect(validator.validate("/user123").isValid).toBe(true);
      });
    });

    describe("invalid paths", () => {
      test("should reject paths with whitespace", () => {
        expect(validator.validate(" /users").isValid).toBe(false);
        expect(validator.validate("/users ").isValid).toBe(false);
        expect(validator.validate(" /users ").isValid).toBe(false);
      });

      test("should reject paths not starting with /", () => {
        const result = validator.validate("users");
        expect(result.isValid).toBe(false);
        expect(result.message).toContain("must start with '/'");
      });

      test("should reject paths with trailing slash (except root)", () => {
        const result = validator.validate("/users/");
        expect(result.isValid).toBe(false);
        expect(result.message).toContain("cannot end with '/'");
      });

      test("should reject paths with double slashes", () => {
        const result = validator.validate("/users//posts");
        expect(result.isValid).toBe(false);
        expect(result.message).toContain("empty segments");
      });

      test("should reject paths with invalid parameter format", () => {
        const result = validator.validate("/users/:123id");
        expect(result.isValid).toBe(false);
        expect(result.message).toContain("Invalid parameter segment");
      });

      test("should reject empty string", () => {
        expect(validator.validate("").isValid).toBe(false);
      });

      test("should reject non-string values", () => {
        expect(validator.validate(123).isValid).toBe(false);
        expect(validator.validate(null).isValid).toBe(false);
        expect(validator.validate(undefined).isValid).toBe(false);
      });
    });
  });
});

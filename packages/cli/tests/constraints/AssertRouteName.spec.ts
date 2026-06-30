import { describe, expect, test } from "bun:test";
import { AssertRouteName } from "@/constraints/AssertRouteName";

describe("AssertRouteName", () => {
  const validator = new AssertRouteName();

  describe("getConstraint", () => {
    test("should return a string constraint with min length 7", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });
  });

  describe("getErrorMessage", () => {
    test("should return appropriate error message with format example", () => {
      const message = validator.getErrorMessage();
      expect(message).toContain("namespace.resource.action");
      expect(message).toContain("api.users.list");
    });
  });

  describe("validate", () => {
    describe("valid route names", () => {
      test("should accept valid route names", () => {
        expect(validator.validate("api.users.list").isValid).toBe(true);
        expect(validator.validate("client.posts.show").isValid).toBe(true);
        expect(validator.validate("admin.settings.update").isValid).toBe(true);
        expect(validator.validate("webhook.events.process").isValid).toBe(true);
        expect(validator.validate("api.user123.list").isValid).toBe(true);
        expect(validator.validate("api.Users.list").isValid).toBe(true);
        expect(validator.validate("api.userPosts.create").isValid).toBe(true);
      });
    });

    describe("invalid route names", () => {
      test("should reject route names with whitespace", () => {
        expect(validator.validate(" api.users.list").isValid).toBe(false);
        expect(validator.validate("api.users.list ").isValid).toBe(false);
        expect(validator.validate(" api.users.list ").isValid).toBe(false);
      });

      test("should reject route names without three segments", () => {
        expect(validator.validate("api.users").isValid).toBe(false);
        expect(validator.validate("api").isValid).toBe(false);
        expect(validator.validate("api.users.list.extra").isValid).toBe(false);
      });

      test("should reject route names with special characters", () => {
        expect(validator.validate("api.user-name.list").isValid).toBe(false);
        expect(validator.validate("api.user_name.list").isValid).toBe(false);
      });

      test("should reject too short strings", () => {
        expect(validator.validate("a.b.c").isValid).toBe(false);
      });

      test("should reject non-string values", () => {
        expect(validator.validate(123).isValid).toBe(false);
        expect(validator.validate(null).isValid).toBe(false);
        expect(validator.validate(undefined).isValid).toBe(false);
      });
    });
  });
});

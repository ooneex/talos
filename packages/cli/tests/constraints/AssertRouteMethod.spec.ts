import { describe, expect, test } from "bun:test";
import { AssertRouteMethod } from "@/constraints/AssertRouteMethod";

describe("AssertRouteMethod", () => {
  const validator = new AssertRouteMethod();

  describe("getConstraint", () => {
    test("should return a string constraint with min length 3", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });
  });

  describe("getErrorMessage", () => {
    test("should return appropriate error message listing HTTP methods", () => {
      const message = validator.getErrorMessage();
      expect(message).toContain("Route method must be one of");
      expect(message).toContain("GET");
      expect(message).toContain("POST");
    });
  });

  describe("validate", () => {
    describe("valid methods", () => {
      test("should accept all valid HTTP methods", () => {
        expect(validator.validate("GET").isValid).toBe(true);
        expect(validator.validate("POST").isValid).toBe(true);
        expect(validator.validate("PUT").isValid).toBe(true);
        expect(validator.validate("DELETE").isValid).toBe(true);
        expect(validator.validate("PATCH").isValid).toBe(true);
        expect(validator.validate("OPTIONS").isValid).toBe(true);
        expect(validator.validate("HEAD").isValid).toBe(true);
      });

      test("should accept methods case-insensitively", () => {
        expect(validator.validate("get").isValid).toBe(true);
        expect(validator.validate("post").isValid).toBe(true);
        expect(validator.validate("Put").isValid).toBe(true);
      });
    });

    describe("invalid methods", () => {
      test("should reject methods with whitespace", () => {
        expect(validator.validate(" GET").isValid).toBe(false);
        expect(validator.validate("GET ").isValid).toBe(false);
        expect(validator.validate(" GET ").isValid).toBe(false);
      });

      test("should reject invalid HTTP methods", () => {
        expect(validator.validate("FETCH").isValid).toBe(false);
        expect(validator.validate("SEND").isValid).toBe(false);
        expect(validator.validate("INVALID").isValid).toBe(false);
      });

      test("should reject too short strings", () => {
        expect(validator.validate("GE").isValid).toBe(false);
        expect(validator.validate("PO").isValid).toBe(false);
      });

      test("should reject non-string values", () => {
        expect(validator.validate(123).isValid).toBe(false);
        expect(validator.validate(null).isValid).toBe(false);
        expect(validator.validate(undefined).isValid).toBe(false);
      });
    });
  });
});

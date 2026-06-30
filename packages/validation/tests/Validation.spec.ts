import { describe, expect, test } from "bun:test";
import type { AssertType, ValidationResultType } from "@/types";
import { Assert } from "@/utils";
import { Validation } from "@/Validation";

class TestValidation extends Validation {
  private errorMessage: string | null = null;

  constructor(private constraint: AssertType) {
    super();
  }

  public getConstraint(): AssertType {
    return this.constraint;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public setErrorMessage(message: string | null): void {
    this.errorMessage = message;
  }
}

describe("Validation", () => {
  describe("validate method", () => {
    test("should return isValid: true for valid data", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate("hello");

      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    test("should return isValid: false for invalid data", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate(123);

      expect(result.isValid).toBe(false);
      expect(result.message).toBeDefined();
    });

    test("should use custom error message when provided", () => {
      const validator = new TestValidation(Assert("string"));
      validator.setErrorMessage("Custom error message");
      const result = validator.validate(123);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Custom error message");
    });

    test("should use arktype summary when no custom error message", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate(123);

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("must be a string");
    });

    test("should accept custom constraint in validate method", () => {
      const validator = new TestValidation(Assert("string"));
      const customConstraint = Assert("number");
      const result = validator.validate(123, customConstraint);

      expect(result.isValid).toBe(true);
    });

    test("should use default constraint when no custom constraint provided", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate("hello");

      expect(result.isValid).toBe(true);
    });
  });

  describe("constraint types", () => {
    test("should validate string type", () => {
      const validator = new TestValidation(Assert("string"));

      expect(validator.validate("hello").isValid).toBe(true);
      expect(validator.validate(123).isValid).toBe(false);
      expect(validator.validate(null).isValid).toBe(false);
      expect(validator.validate(undefined).isValid).toBe(false);
    });

    test("should validate number type", () => {
      const validator = new TestValidation(Assert("number"));

      expect(validator.validate(123).isValid).toBe(true);
      expect(validator.validate(3.14).isValid).toBe(true);
      expect(validator.validate("123").isValid).toBe(false);
      expect(validator.validate(null).isValid).toBe(false);
    });

    test("should validate boolean type", () => {
      const validator = new TestValidation(Assert("boolean"));

      expect(validator.validate(true).isValid).toBe(true);
      expect(validator.validate(false).isValid).toBe(true);
      expect(validator.validate("true").isValid).toBe(false);
      expect(validator.validate(1).isValid).toBe(false);
    });

    test("should validate string length constraints", () => {
      const validator = new TestValidation(Assert("1 <= string <= 10"));

      expect(validator.validate("hello").isValid).toBe(true);
      expect(validator.validate("a").isValid).toBe(true);
      expect(validator.validate("1234567890").isValid).toBe(true);
      expect(validator.validate("").isValid).toBe(false);
      expect(validator.validate("12345678901").isValid).toBe(false);
    });

    test("should validate number range constraints", () => {
      const validator = new TestValidation(Assert("1 <= number <= 100"));

      expect(validator.validate(1).isValid).toBe(true);
      expect(validator.validate(50).isValid).toBe(true);
      expect(validator.validate(100).isValid).toBe(true);
      expect(validator.validate(0).isValid).toBe(false);
      expect(validator.validate(101).isValid).toBe(false);
    });

    test("should validate regex patterns", () => {
      const validator = new TestValidation(Assert(/^[a-z]+$/));

      expect(validator.validate("hello").isValid).toBe(true);
      expect(validator.validate("abc").isValid).toBe(true);
      expect(validator.validate("Hello").isValid).toBe(false);
      expect(validator.validate("123").isValid).toBe(false);
    });

    test("should validate email format", () => {
      const validator = new TestValidation(Assert("string.email"));

      expect(validator.validate("test@example.com").isValid).toBe(true);
      expect(validator.validate("invalid-email").isValid).toBe(false);
    });

    test("should validate integer constraint", () => {
      const validator = new TestValidation(Assert("number.integer"));

      expect(validator.validate(42).isValid).toBe(true);
      expect(validator.validate(3.14).isValid).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("should handle null values", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate(null);

      expect(result.isValid).toBe(false);
    });

    test("should handle undefined values", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate(undefined);

      expect(result.isValid).toBe(false);
    });

    test("should handle empty strings", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate("");

      expect(result.isValid).toBe(true);
    });

    test("should handle empty objects", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate({});

      expect(result.isValid).toBe(false);
    });

    test("should handle empty arrays", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate([]);

      expect(result.isValid).toBe(false);
    });

    test("should handle NaN", () => {
      const validator = new TestValidation(Assert("number"));
      const result = validator.validate(Number.NaN);

      expect(result.isValid).toBe(false);
    });

    test("should handle Infinity", () => {
      const validator = new TestValidation(Assert("number"));
      const result = validator.validate(Number.POSITIVE_INFINITY);

      expect(result.isValid).toBe(true);
    });

    test("should handle negative Infinity", () => {
      const validator = new TestValidation(Assert("number"));
      const result = validator.validate(Number.NEGATIVE_INFINITY);

      expect(result.isValid).toBe(true);
    });
  });

  describe("abstract methods", () => {
    test("getConstraint should return the constraint", () => {
      const constraint = Assert("string");
      const validator = new TestValidation(constraint);

      expect(validator.getConstraint()).toBe(constraint);
    });

    test("getErrorMessage should return null by default", () => {
      const validator = new TestValidation(Assert("string"));

      expect(validator.getErrorMessage()).toBeNull();
    });

    test("getErrorMessage should return custom message when set", () => {
      const validator = new TestValidation(Assert("string"));
      validator.setErrorMessage("Custom error");

      expect(validator.getErrorMessage()).toBe("Custom error");
    });
  });

  describe("invalidResult helper", () => {
    test("should use custom error message over fallback", () => {
      const validator = new TestValidation(Assert("string"));
      validator.setErrorMessage("Custom error");
      const result = validator.validate(123);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Custom error");
    });

    test("should use fallback message when no custom error message", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate(123);

      expect(result.isValid).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain("must be a string");
    });
  });

  describe("validResult helper", () => {
    test("should return isValid true with no message", () => {
      const validator = new TestValidation(Assert("string"));
      const result = validator.validate("hello");

      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });
  });

  describe("ValidationResultType", () => {
    test("should return correct structure for valid data", () => {
      const validator = new TestValidation(Assert("string"));
      const result: ValidationResultType = validator.validate("test");

      expect(result).toHaveProperty("isValid");
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    test("should return correct structure for invalid data", () => {
      const validator = new TestValidation(Assert("string"));
      const result: ValidationResultType = validator.validate(123);

      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("message");
      expect(result.isValid).toBe(false);
      expect(typeof result.message).toBe("string");
    });
  });
});

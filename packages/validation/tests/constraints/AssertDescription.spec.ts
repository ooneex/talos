import { describe, expect, test } from "bun:test";
import { AssertDescription } from "@/constraints";

describe("AssertDescription", () => {
  const validator = new AssertDescription();

  test("should validate valid descriptions", () => {
    const validDescriptions = [
      "A",
      "A short description",
      "This is a longer description with multiple sentences. It covers various topics.",
      "Description with numbers 123 and special chars: @#$%!",
    ];

    for (const desc of validDescriptions) {
      const result = validator.validate(desc);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject empty strings", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Description must be between 1 and 5000 characters");
  });

  test("should accept descriptions at maximum length", () => {
    const maxDesc = "A".repeat(5000);
    const result = validator.validate(maxDesc);
    expect(result.isValid).toBe(true);
  });

  test("should reject descriptions that are too long", () => {
    const longDesc = "A".repeat(5001);
    const result = validator.validate(longDesc);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Description must be between 1 and 5000 characters");
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should accept descriptions with newlines and whitespace", () => {
    const validDescriptions = ["Line one\nLine two", "Paragraph one\n\nParagraph two", "Text with\ttabs"];

    for (const desc of validDescriptions) {
      const result = validator.validate(desc);
      expect(result.isValid).toBe(true);
    }
  });

  test("should accept single character description", () => {
    const result = validator.validate("x");
    expect(result.isValid).toBe(true);
  });
});

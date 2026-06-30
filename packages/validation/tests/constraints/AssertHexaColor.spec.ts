import { describe, expect, test } from "bun:test";
import { AssertHexaColor } from "@/constraints";

describe("AssertHexaColor", () => {
  const validator = new AssertHexaColor();

  test("should validate valid 3-digit hex colors", () => {
    const valid3DigitColors = ["#fff", "#000", "#123", "#abc", "#ABC", "#DeF", "#f0f", "#a1b", "#F9E", "#999"];

    for (const color of valid3DigitColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate valid 6-digit hex colors", () => {
    const valid6DigitColors = [
      "#ffffff",
      "#000000",
      "#123456",
      "#abcdef",
      "#ABCDEF",
      "#DeF123",
      "#f0f0f0",
      "#a1b2c3",
      "#F9E8D7",
      "#999999",
      "#FF5733",
      "#28A745",
      "#007BFF",
      "#6C757D",
      "#FFC107",
    ];

    for (const color of valid6DigitColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject colors missing hash symbol", () => {
    const colorsWithoutHash = ["fff", "000", "123456", "abcdef", "FFFFFF", "f0f", "a1b2c3"];

    for (const color of colorsWithoutHash) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should reject colors with invalid lengths", () => {
    const invalidLengthColors = ["#ff", "#ffff", "#fffff", "#fffffff", "#ffffffff", "#f", "#"];

    for (const color of invalidLengthColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should reject colors with invalid characters", () => {
    const invalidCharColors = [
      "#ggf",
      "#12g",
      "#xyz",
      "#fff!",
      "#ff@ff",
      "#12 34",
      "#ff-ff",
      "#ff.ff",
      "#ffffff.",
      "#ffffff ",
      " #ffffff",
      "#FGH123",
      "#123GHI",
    ];

    for (const color of invalidCharColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should reject non-string values", () => {
    const nonStringValues = [
      123,
      0xff0000,
      null,
      undefined,
      {},
      [],
      true,
      false,
      0,
      -1,
      3.14,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ];

    for (const value of nonStringValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject empty string", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
  });

  test("should reject colors with mixed valid and invalid patterns", () => {
    const mixedInvalidColors = ["##fff", "#fff#", "##ffffff", "#ff#fff", "#fff#fff"];

    for (const color of mixedInvalidColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should handle edge cases with case sensitivity", () => {
    const caseSensitiveColors = ["#AbC", "#aBc", "#AbCdEf", "#aBcDeF", "#A1B2C3", "#a1B2c3"];

    for (const color of caseSensitiveColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject colors with whitespace", () => {
    const colorsWithWhitespace = [
      " #fff",
      "#fff ",
      " #fff ",
      "#f f f",
      "#ff f",
      "#ffffff ",
      " #ffffff",
      " #ffffff ",
      "#ff ff ff",
      "#fff\n",
      "#fff\t",
      "\n#fff",
      "\t#fff",
    ];

    for (const color of colorsWithWhitespace) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should validate boundary hex values", () => {
    const boundaryColors = ["#000", "#fff", "#FFF", "#000000", "#ffffff", "#FFFFFF"];

    for (const color of boundaryColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject colors that look like hex but are not", () => {
    const almostValidColors = [
      "rgb(255, 255, 255)",
      "hsl(0, 0%, 100%)",
      "#fff;",
      "#fff,",
      "#fff)",
      "(#fff)",
      "[#fff]",
      "{#fff}",
      "'#fff'",
      '"#fff"',
      "#fff.",
      "#fff:",
    ];

    for (const color of almostValidColors) {
      const result = validator.validate(color);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
    }
  });

  test("should provide correct error message", () => {
    const result = validator.validate("invalid");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe("Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)");
  });
});

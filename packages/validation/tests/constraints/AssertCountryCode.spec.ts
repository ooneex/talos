import { describe, expect, test } from "bun:test";
import { AssertCountryCode } from "@/constraints";

describe("AssertCountryCode", () => {
  const validator = new AssertCountryCode();

  test("should validate valid ISO 3166-1 alpha-2 country codes", () => {
    const validCodes = ["US", "GB", "FR", "DE", "JP", "CA", "AU", "IT"];

    for (const code of validCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject lowercase country codes", () => {
    const invalidCodes = ["us", "gb", "fr", "de"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject mixed case country codes", () => {
    const invalidCodes = ["Us", "Gb", "Fr", "uS"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject codes that are too short", () => {
    const invalidCodes = ["U", "G", ""];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject codes that are too long", () => {
    const invalidCodes = ["USA", "GBR", "FRA", "DEU", "ABCD"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject codes with numbers", () => {
    const invalidCodes = ["U1", "2B", "F3", "12"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject codes with special characters", () => {
    const invalidCodes = ["U@", "G!", "F#", "$$"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject codes with spaces", () => {
    const invalidCodes = ["U ", " S", " U", "U S"];

    for (const code of invalidCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code");
    }
  });
});

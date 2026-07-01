import { describe, expect, test } from "bun:test";
import { locales } from "@talosjs/translation";
import { AssertLocale } from "@/constraints/AssertLocale";

describe("AssertLocale", () => {
  const validator = new AssertLocale();

  test("should validate all supported locale codes", () => {
    for (const locale of locales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject invalid locale codes", () => {
    const invalidLocales = ["xx", "abc", "foo", "bar", "test", "invalid"];

    for (const locale of invalidLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should reject uppercase locale codes", () => {
    const uppercaseLocales = ["EN", "FR", "DE", "ES", "IT"];

    for (const locale of uppercaseLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should reject mixed case locale codes", () => {
    const mixedCaseLocales = ["En", "fR", "De", "eS"];

    for (const locale of mixedCaseLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should reject empty string", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Locale must be a valid locale code");
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true, false];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject locale codes with spaces", () => {
    const localesWithSpaces = ["en ", " fr", " de ", "e n"];

    for (const locale of localesWithSpaces) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should reject locale codes with special characters", () => {
    const localesWithSpecialChars = ["en@", "fr#", "de$", "es!"];

    for (const locale of localesWithSpecialChars) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should validate common European locales", () => {
    const europeanLocales = ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "sv", "da", "fi", "no"];

    for (const locale of europeanLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate Asian locales", () => {
    const asianLocales = ["ja", "ko", "zh", "th"];

    for (const locale of asianLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate locale with region code", () => {
    const result = validator.validate("zh-tw");
    expect(result.isValid).toBe(true);
  });

  test("should reject incorrect region code format", () => {
    const invalidRegionFormats = ["zh_tw", "zh-TW", "ZH-tw", "ZH-TW"];

    for (const locale of invalidRegionFormats) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Locale must be a valid locale code");
    }
  });

  test("should validate special locales", () => {
    const specialLocales = ["eo", "eu", "hy"];

    for (const locale of specialLocales) {
      const result = validator.validate(locale);
      expect(result.isValid).toBe(true);
    }
  });
});

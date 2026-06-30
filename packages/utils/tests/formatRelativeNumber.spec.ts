import { describe, expect, test } from "bun:test";
import { formatRelativeNumber } from "@/formatRelativeNumber";

describe("formatRelativeNumber", () => {
  describe("basic functionality", () => {
    test("should format small numbers without compacting", () => {
      expect(formatRelativeNumber(42)).toBe("42");
      expect(formatRelativeNumber(123)).toBe("123");
      expect(formatRelativeNumber(999)).toBe("999");
    });

    test("should format thousands with K suffix", () => {
      expect(formatRelativeNumber(1000)).toBe("1K");
      expect(formatRelativeNumber(1500)).toBe("1.5K");
      expect(formatRelativeNumber(2300)).toBe("2.3K");
      expect(formatRelativeNumber(10_000)).toBe("10K");
      expect(formatRelativeNumber(50_000)).toBe("50K");
      expect(formatRelativeNumber(999_000)).toBe("999K");
    });

    test("should format millions with M suffix", () => {
      expect(formatRelativeNumber(1_000_000)).toBe("1M");
      expect(formatRelativeNumber(1_500_000)).toBe("1.5M");
      expect(formatRelativeNumber(2_300_000)).toBe("2.3M");
      expect(formatRelativeNumber(10_000_000)).toBe("10M");
      expect(formatRelativeNumber(999_000_000)).toBe("999M");
    });

    test("should format billions with B suffix", () => {
      expect(formatRelativeNumber(1_000_000_000)).toBe("1B");
      expect(formatRelativeNumber(1_500_000_000)).toBe("1.5B");
      expect(formatRelativeNumber(2_300_000_000)).toBe("2.3B");
    });

    test("should format trillions with T suffix", () => {
      expect(formatRelativeNumber(1_000_000_000_000)).toBe("1T");
      expect(formatRelativeNumber(1_500_000_000_000)).toBe("1.5T");
    });
  });

  describe("precision configuration", () => {
    test("should respect precision 0", () => {
      expect(formatRelativeNumber(1500, { precision: 0 })).toBe("2K");
      expect(formatRelativeNumber(1_500_000, { precision: 0 })).toBe("2M");
      expect(formatRelativeNumber(2_300_000, { precision: 0 })).toBe("2M");
    });

    test("should respect precision 1 (default)", () => {
      expect(formatRelativeNumber(1500)).toBe("1.5K");
      expect(formatRelativeNumber(1500, { precision: 1 })).toBe("1.5K");
      expect(formatRelativeNumber(2_300_000)).toBe("2.3M");
    });

    test("should respect precision 2", () => {
      expect(formatRelativeNumber(1234, { precision: 2 })).toBe("1.23K");
      expect(formatRelativeNumber(1_234_567, { precision: 2 })).toBe("1.23M");
      expect(formatRelativeNumber(9_876_543, { precision: 2 })).toBe("9.88M");
    });

    test("should respect precision 3", () => {
      expect(formatRelativeNumber(1234, { precision: 3 })).toBe("1.234K");
      expect(formatRelativeNumber(1_234_567, { precision: 3 })).toBe("1.235M");
    });

    test("should handle precision 0 with edge cases", () => {
      expect(formatRelativeNumber(1499, { precision: 0 })).toBe("1K");
      expect(formatRelativeNumber(1999, { precision: 0 })).toBe("2K");
    });
  });

  describe("language configuration", () => {
    test("should use en-GB as default", () => {
      expect(formatRelativeNumber(1500)).toBe("1.5K");
      expect(formatRelativeNumber(1_500_000)).toBe("1.5M");
    });

    test("should format with en-US locale", () => {
      expect(formatRelativeNumber(1500, { lang: "en-US" })).toBe("1.5K");
      expect(formatRelativeNumber(1_500_000, { lang: "en-US" })).toBe("1.5M");
    });

    test("should format with de-DE locale", () => {
      // German has different compact notation thresholds
      expect(formatRelativeNumber(1500, { lang: "de-DE" })).toBe("1500");
      expect(formatRelativeNumber(1_500_000, { lang: "de-DE" })).toBe("1,5\u00A0Mio.");
      expect(formatRelativeNumber(10_000, { lang: "de-DE" })).toBe("10.000");
    });

    test("should format with fr-FR locale", () => {
      expect(formatRelativeNumber(1500, { lang: "fr-FR" })).toBe("1,5\u00A0k");
      expect(formatRelativeNumber(1_500_000, { lang: "fr-FR" })).toBe("1,5\u00A0M");
    });

    test("should format with es-ES locale", () => {
      expect(formatRelativeNumber(1500, { lang: "es-ES" })).toBe("1,5\u00A0mil");
      expect(formatRelativeNumber(1_500_000, { lang: "es-ES" })).toBe("1,5\u00A0M");
    });

    test("should format with ja-JP locale", () => {
      // Japanese has different compact notation behavior for smaller numbers
      expect(formatRelativeNumber(1500, { lang: "ja-JP" })).toBe("1500");
      expect(formatRelativeNumber(1_500_000, { lang: "ja-JP" })).toBe("150万");
      expect(formatRelativeNumber(10_000, { lang: "ja-JP" })).toBe("1万");
    });

    test("should handle locale-specific compact notation thresholds", () => {
      // Test numbers where compact notation definitely applies across locales
      expect(formatRelativeNumber(100_000, { lang: "de-DE" })).toBe("100.000");
      expect(formatRelativeNumber(100_000, { lang: "fr-FR" })).toBe("100\u00A0k");
      expect(formatRelativeNumber(100_000, { lang: "es-ES" })).toBe("100\u00A0mil");
      expect(formatRelativeNumber(100_000, { lang: "ja-JP" })).toBe("10万");
    });
  });

  describe("combined configuration", () => {
    test("should use both precision and language", () => {
      expect(formatRelativeNumber(1234, { precision: 2, lang: "en-US" })).toBe("1.23K");
      expect(formatRelativeNumber(1234, { precision: 2, lang: "de-DE" })).toBe("1234");
      expect(formatRelativeNumber(1_234_567, { precision: 0, lang: "fr-FR" })).toBe("1\u00A0M");
    });

    test("should handle edge cases with configuration", () => {
      expect(formatRelativeNumber(999_999, { precision: 3, lang: "en-GB" })).toBe("999.999K");
      expect(formatRelativeNumber(1_000_000, { precision: 3, lang: "en-GB" })).toBe("1M");
    });
  });

  describe("edge cases", () => {
    test("should handle zero", () => {
      expect(formatRelativeNumber(0)).toBe("0");
      expect(formatRelativeNumber(0, { precision: 2 })).toBe("0");
    });

    test("should handle negative numbers", () => {
      expect(formatRelativeNumber(-42)).toBe("-42");
      expect(formatRelativeNumber(-1500)).toBe("-1.5K");
      expect(formatRelativeNumber(-1_500_000)).toBe("-1.5M");
    });

    test("should handle decimal inputs", () => {
      expect(formatRelativeNumber(1.5)).toBe("1.5");
      expect(formatRelativeNumber(999.9)).toBe("999.9");
      expect(formatRelativeNumber(1000.5)).toBe("1K");
    });

    test("should handle very small positive numbers", () => {
      expect(formatRelativeNumber(0.1)).toBe("0.1");
      expect(formatRelativeNumber(0.01)).toBe("0");
      expect(formatRelativeNumber(0.99)).toBe("1");
    });

    test("should handle very large numbers", () => {
      expect(formatRelativeNumber(1e15)).toBe("1000T");
      expect(formatRelativeNumber(1e18)).toBe("1,000,000T");
    });

    test("should handle Number.MAX_SAFE_INTEGER", () => {
      const result = formatRelativeNumber(Number.MAX_SAFE_INTEGER);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/\d+(\.\d+)?[KMBT]/);
    });

    test("should handle Number.MIN_SAFE_INTEGER", () => {
      const result = formatRelativeNumber(Number.MIN_SAFE_INTEGER);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/-\d+(\.\d+)?[KMBT]/);
    });
  });

  describe("parametrized tests", () => {
    test.each([
      [0, "0"],
      [1, "1"],
      [10, "10"],
      [100, "100"],
      [1000, "1K"],
      [10_000, "10K"],
      [100_000, "100K"],
      [1_000_000, "1M"],
      [10_000_000, "10M"],
      [100_000_000, "100M"],
      [1_000_000_000, "1B"],
    ])("formatRelativeNumber(%s) should return %s", (input, expected) => {
      expect(formatRelativeNumber(input)).toBe(expected);
    });

    test.each([
      [1234, 0, "1K"],
      [1234, 1, "1.2K"],
      [1234, 2, "1.23K"],
      [1_234_567, 0, "1M"],
      [1_234_567, 1, "1.2M"],
      [1_234_567, 2, "1.23M"],
    ])("formatRelativeNumber(%s, {precision: %s}) should return %s", (input, precision, expected) => {
      expect(formatRelativeNumber(input, { precision })).toBe(expected);
    });
  });

  describe("type safety and configuration validation", () => {
    test("should handle undefined config", () => {
      expect(formatRelativeNumber(1500, undefined)).toBe("1.5K");
    });

    test("should handle empty config object", () => {
      expect(formatRelativeNumber(1500, {})).toBe("1.5K");
    });

    test("should handle partial config with precision only", () => {
      expect(formatRelativeNumber(1234, { precision: 2 })).toBe("1.23K");
    });

    test("should handle partial config with lang only", () => {
      expect(formatRelativeNumber(1500, { lang: "de-DE" })).toBe("1500");
    });

    test("should use defaults when config properties are undefined", () => {
      expect(formatRelativeNumber(1500, {})).toBe("1.5K");
    });
  });

  describe("function behavior", () => {
    test("should return string type", () => {
      const result = formatRelativeNumber(1000);
      expect(typeof result).toBe("string");
    });

    test("should handle consecutive calls consistently", () => {
      const num = 1500;
      const result1 = formatRelativeNumber(num);
      const result2 = formatRelativeNumber(num);
      expect(result1).toBe(result2);
      expect(result1).toBe("1.5K");
    });

    test("should not mutate config object", () => {
      const config = { precision: 2, lang: "en-US" };
      const originalConfig = { ...config };
      formatRelativeNumber(1000, config);
      expect(config).toEqual(originalConfig);
    });

    test("should handle different input types that coerce to numbers", () => {
      // These should work as TypeScript allows number type
      expect(formatRelativeNumber(1000)).toBe("1K");
      expect(formatRelativeNumber(1000.0)).toBe("1K");
      expect(formatRelativeNumber(1e3)).toBe("1K");
    });
  });

  describe("real world examples", () => {
    test("should format social media metrics", () => {
      expect(formatRelativeNumber(1200)).toBe("1.2K"); // followers
      expect(formatRelativeNumber(15_000)).toBe("15K"); // likes
      expect(formatRelativeNumber(250_000)).toBe("250K"); // views
      expect(formatRelativeNumber(1_800_000)).toBe("1.8M"); // subscribers
    });

    test("should format financial numbers", () => {
      expect(formatRelativeNumber(50_000)).toBe("50K"); // salary
      expect(formatRelativeNumber(125_000)).toBe("125K"); // house price
      expect(formatRelativeNumber(2_500_000)).toBe("2.5M"); // company value
      expect(formatRelativeNumber(1_200_000_000)).toBe("1.2B"); // market cap
    });

    test("should format file sizes (as numbers)", () => {
      expect(formatRelativeNumber(1024)).toBe("1K"); // 1KB
      expect(formatRelativeNumber(1_048_576)).toBe("1M"); // 1MB
      expect(formatRelativeNumber(1_073_741_824)).toBe("1.1B"); // 1GB
    });

    test("should format population numbers", () => {
      expect(formatRelativeNumber(8_500_000)).toBe("8.5M"); // NYC population
      expect(formatRelativeNumber(37_000_000)).toBe("37M"); // California population
      expect(formatRelativeNumber(331_000_000)).toBe("331M"); // US population
    });
  });

  describe("browser compatibility", () => {
    test("should work with Intl.NumberFormat", () => {
      // This ensures Intl.NumberFormat is available and working
      expect(() => formatRelativeNumber(1000)).not.toThrow();
      expect(formatRelativeNumber(1000)).toBeTruthy();
    });

    test("should handle various locales gracefully", () => {
      const locales = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "ru-RU", "zh-CN", "ja-JP"];

      for (const locale of locales) {
        expect(() => formatRelativeNumber(1500, { lang: locale })).not.toThrow();
        const result = formatRelativeNumber(1500, { lang: locale });
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });

    test("should handle invalid locale gracefully", () => {
      // Invalid locales should fallback gracefully
      expect(() => formatRelativeNumber(1500, { lang: "invalid-locale" })).not.toThrow();
      const result = formatRelativeNumber(1500, { lang: "invalid-locale" });
      expect(typeof result).toBe("string");
    });
  });
});

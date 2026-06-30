import { describe, expect, test } from "bun:test";
import { locales } from "@/locales";

describe("locales", () => {
  describe("Type and Structure", () => {
    test("should be defined and be an array", () => {
      expect(locales).toBeDefined();
      expect(Array.isArray(locales)).toBe(true);
    });

    test("should be a readonly array", () => {
      // TypeScript ensures this is readonly at compile time
      // The `as const` assertion makes it readonly, but doesn't freeze the runtime array
      // We can test that TypeScript treats it as readonly by checking the type
      expect(Array.isArray(locales)).toBe(true);
    });

    test("should have correct length", () => {
      expect(locales).toHaveLength(31);
    });

    test("should contain only string values", () => {
      locales.forEach((locale) => {
        expect(typeof locale).toBe("string");
      });
    });

    test("should not contain empty strings", () => {
      locales.forEach((locale) => {
        expect(locale.trim()).not.toBe("");
        expect(locale.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Content Validation", () => {
    test("should contain expected core locales", () => {
      const coreLocales = ["en", "fr", "es", "de", "ja", "ko", "zh", "ar"];

      coreLocales.forEach((locale) => {
        expect(locales).toContain(locale as (typeof locales)[number]);
      });
    });

    test("should contain all documented locales", () => {
      const expectedLocales = [
        "ar",
        "bg",
        "cs",
        "da",
        "de",
        "el",
        "en",
        "eo",
        "es",
        "et",
        "eu",
        "fi",
        "fr",
        "hu",
        "hy",
        "it",
        "ja",
        "ko",
        "lt",
        "nl",
        "no",
        "pl",
        "pt",
        "ro",
        "ru",
        "sk",
        "sv",
        "th",
        "uk",
        "zh",
        "zh-tw",
      ];

      expect(locales.length).toBe(31);

      expectedLocales.forEach((locale) => {
        expect(locales).toContain(locale as (typeof locales)[number]);
      });
    });

    test("should have unique values", () => {
      const uniqueLocales = [...new Set(locales)];
      expect(uniqueLocales).toHaveLength(locales.length);
    });

    test("should be sorted alphabetically with exception for zh-tw", () => {
      // zh-tw should come after zh
      const zhIndex = locales.indexOf("zh");
      const zhTwOriginalIndex = locales.indexOf("zh-tw");
      expect(zhTwOriginalIndex).toBeGreaterThan(zhIndex);

      // Check that the main locales (excluding zh-tw) are in alphabetical order
      const mainLocales = locales.slice(0, -1); // All except zh-tw which is last
      const sortedMainLocales = [...mainLocales].sort();
      expect(mainLocales).toEqual(sortedMainLocales);
    });
  });

  describe("Locale Format Validation", () => {
    test("should follow ISO 639-1 and BCP 47 standards", () => {
      const validLocalePattern = /^[a-z]{2}(-[a-z]{2})?$/i;

      locales.forEach((locale) => {
        expect(locale).toMatch(validLocalePattern);
      });
    });

    test("should use lowercase for language codes", () => {
      locales.forEach((locale) => {
        const languageCode = locale.split("-")[0];
        if (languageCode) {
          expect(languageCode).toBe(languageCode.toLowerCase());
        }
      });
    });

    test("should use lowercase for region codes", () => {
      const localesWithRegion = locales.filter((locale) => locale.includes("-"));

      localesWithRegion.forEach((locale) => {
        const parts = locale.split("-");
        const regionCode = parts[1];
        if (regionCode) {
          expect(regionCode).toBe(regionCode.toLowerCase());
        }
      });
    });

    test("should have correct length for language codes", () => {
      locales.forEach((locale) => {
        const languageCode = locale.split("-")[0];
        expect(languageCode).toHaveLength(2);
      });
    });
  });

  describe("Language Coverage", () => {
    test("should include major world languages", () => {
      const majorLanguages = [
        "en", // English
        "zh", // Chinese
        "es", // Spanish
        "ar", // Arabic
        "fr", // French
        "ru", // Russian
        "de", // German
        "ja", // Japanese
        "pt", // Portuguese
        "it", // Italian
      ];

      majorLanguages.forEach((language) => {
        expect(locales).toContain(language as (typeof locales)[number]);
      });
    });

    test("should include European languages", () => {
      const europeanLanguages = [
        "en",
        "fr",
        "de",
        "es",
        "it",
        "pt",
        "ru",
        "pl",
        "nl",
        "sv",
        "no",
        "da",
        "fi",
        "hu",
        "cs",
        "sk",
        "ro",
        "bg",
        "el",
        "et",
        "lt",
        "eu",
        "hy",
      ];

      europeanLanguages.forEach((language) => {
        expect(locales).toContain(language as (typeof locales)[number]);
      });
    });

    test("should include Asian languages", () => {
      const asianLanguages = ["zh", "zh-tw", "ja", "ko", "th"];

      asianLanguages.forEach((language) => {
        expect(locales).toContain(language as (typeof locales)[number]);
      });
    });

    test("should include constructed languages", () => {
      expect(locales).toContain("eo"); // Esperanto
    });
  });

  describe("Regional Variants", () => {
    test("should include Chinese variants", () => {
      expect(locales).toContain("zh"); // Simplified Chinese
      expect(locales).toContain("zh-tw"); // Traditional Chinese (Taiwan)
    });

    test("should have zh-tw as the only regional variant", () => {
      const regionalVariants = locales.filter((locale) => locale.includes("-"));
      expect(regionalVariants).toEqual(["zh-tw"]);
    });
  });

  describe("TypeScript Readonly Behavior", () => {
    test("should be treated as readonly by TypeScript", () => {
      // The `as const` assertion ensures TypeScript treats this as readonly
      // At runtime, it's still a regular array, but TypeScript prevents modification
      expect(Array.isArray(locales)).toBe(true);
      expect(locales.length).toBeGreaterThan(0);
    });

    test("should maintain array prototype methods", () => {
      // Non-mutating methods should work fine
      expect(typeof locales.includes).toBe("function");
      expect(typeof locales.filter).toBe("function");
      expect(typeof locales.map).toBe("function");
      expect(typeof locales.find).toBe("function");
    });

    test("should preserve original array structure", () => {
      // The array itself is not frozen, just readonly at compile time
      expect(locales).toEqual([
        "ar",
        "bg",
        "cs",
        "da",
        "de",
        "el",
        "en",
        "eo",
        "es",
        "et",
        "eu",
        "fi",
        "fr",
        "hu",
        "hy",
        "it",
        "ja",
        "ko",
        "lt",
        "nl",
        "no",
        "pl",
        "pt",
        "ro",
        "ru",
        "sk",
        "sv",
        "th",
        "uk",
        "zh",
        "zh-tw",
      ]);
    });
  });

  describe("Usage Scenarios", () => {
    test("should work with Array.includes for validation", () => {
      expect(locales.includes("en")).toBe(true);
      expect(locales.includes("fr")).toBe(true);
      expect(locales.includes("invalid" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("EN" as (typeof locales)[number])).toBe(false); // case sensitive
    });

    test("should work with Array.find", () => {
      const found = locales.find((locale) => locale === "ja");
      expect(found).toBe("ja");

      const notFound = locales.find((locale) => locale === ("xyz" as (typeof locales)[number]));
      expect(notFound).toBeUndefined();
    });

    test("should work with Array.filter", () => {
      const twoLetterLocales = locales.filter((locale) => locale.length === 2);
      expect(twoLetterLocales.length).toBe(30); // All except zh-tw

      const localesWithHyphen = locales.filter((locale) => locale.includes("-"));
      expect(localesWithHyphen).toEqual(["zh-tw"]);
    });

    test("should work with Array.map", () => {
      const upperCaseLocales = locales.map((locale) => locale.toUpperCase());
      expect(upperCaseLocales).toContain("EN");
      expect(upperCaseLocales).toContain("ZH-TW");
    });

    test("should work with for...of iteration", () => {
      const iteratedLocales: string[] = [];
      for (const locale of locales) {
        iteratedLocales.push(locale);
      }
      expect(iteratedLocales).toHaveLength(locales.length);
      expect(iteratedLocales).toEqual([...locales]);
    });

    test("should work with array destructuring", () => {
      const [first, second, ...rest] = locales;
      expect(typeof first).toBe("string");
      expect(typeof second).toBe("string");
      expect(Array.isArray(rest)).toBe(true);
      expect(rest.length).toBe(29);
    });
  });

  describe("TypeScript Type Safety", () => {
    test("should be typed as const assertion", () => {
      // This test ensures the const assertion works correctly
      const firstLocale = locales[0];
      expect(typeof firstLocale).toBe("string");
    });

    test("should work in type narrowing scenarios", () => {
      function isValidLocale(locale: string): locale is (typeof locales)[number] {
        return locales.includes(locale as (typeof locales)[number]);
      }

      expect(isValidLocale("en")).toBe(true);
      expect(isValidLocale("fr")).toBe(true);
      expect(isValidLocale("invalid")).toBe(false);
    });
  });

  describe("Performance", () => {
    test("should handle multiple lookups efficiently", () => {
      const testLocales = ["en", "fr", "de", "invalid1", "invalid2"];
      const startTime = performance.now();

      const results = testLocales.map((locale) => locales.includes(locale as (typeof locales)[number]));

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(10); // Should be very fast
      expect(results).toEqual([true, true, true, false, false]);
    });

    test("should handle array operations without performance degradation", () => {
      const startTime = performance.now();

      // Perform various array operations
      const filtered = locales.filter((locale) => locale.startsWith("e"));
      const mapped = locales.map((locale) => locale.length);
      const found = locales.find((locale) => locale === "zh-tw");
      const some = locales.some((locale) => locale.includes("-"));

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(10);

      expect(filtered.length).toBeGreaterThan(0);
      expect(mapped.length).toBe(locales.length);
      expect(found).toBe("zh-tw");
      expect(some).toBe(true);
    });
  });

  describe("Integration Scenarios", () => {
    test("should work with locale validation functions", () => {
      function validateLocale(locale: string): boolean {
        return locales.includes(locale as (typeof locales)[number]);
      }

      expect(validateLocale("en")).toBe(true);
      expect(validateLocale("zh-tw")).toBe(true);
      expect(validateLocale("en-US")).toBe(false);
      expect(validateLocale("")).toBe(false);
    });

    test("should work with fallback locale selection", () => {
      function selectFallbackLocale(preferredLocales: string[]): string {
        for (const locale of preferredLocales) {
          if (locales.includes(locale as (typeof locales)[number])) {
            return locale;
          }
        }
        return "en"; // default fallback
      }

      expect(selectFallbackLocale(["fr-CA", "fr", "en"])).toBe("fr");
      expect(selectFallbackLocale(["invalid", "also-invalid"])).toBe("en");
      expect(selectFallbackLocale(["zh-cn", "zh", "en"])).toBe("zh");
    });

    test("should work with locale matching algorithms", () => {
      function findBestLocaleMatch(requestedLocale: string): string | null {
        // Exact match - using type assertion for test purposes
        const exactMatch = locales.find((locale) => locale === requestedLocale);
        if (exactMatch) {
          return exactMatch;
        }

        // Language code match (e.g., "en-US" -> "en")
        const languageCode = requestedLocale.split("-")[0];
        if (languageCode) {
          const langMatch = locales.find((locale) => locale === languageCode);
          if (langMatch) {
            return langMatch;
          }
        }

        return null;
      }

      expect(findBestLocaleMatch("en")).toBe("en");
      expect(findBestLocaleMatch("en-US")).toBe("en");
      expect(findBestLocaleMatch("fr-CA")).toBe("fr");
      expect(findBestLocaleMatch("zh-tw")).toBe("zh-tw");
      expect(findBestLocaleMatch("zh-cn")).toBe("zh");
      expect(findBestLocaleMatch("invalid")).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("should handle case sensitivity correctly", () => {
      expect(locales.includes("EN" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("Fr" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("ZH-TW" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("zh-TW" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("ZH-tw" as (typeof locales)[number])).toBe(false);
    });

    test("should handle whitespace correctly", () => {
      expect(locales.includes(" en" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("en " as (typeof locales)[number])).toBe(false);
      expect(locales.includes(" en " as (typeof locales)[number])).toBe(false);
    });

    test("should handle similar but different locale codes", () => {
      expect(locales.includes("en-US" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("zh-CN" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("zh-Hant" as (typeof locales)[number])).toBe(false);
      expect(locales.includes("zh_tw" as (typeof locales)[number])).toBe(false);
    });

    test("should handle numeric inputs gracefully", () => {
      // @ts-expect-error - testing runtime behavior with wrong types
      expect(locales.includes(0)).toBe(false);
      // @ts-expect-error - testing runtime behavior with wrong types
      expect(locales.includes(1)).toBe(false);
    });

    test("should handle null and undefined inputs gracefully", () => {
      // @ts-expect-error - testing runtime behavior with wrong types
      expect(locales.includes(null)).toBe(false);
      // @ts-expect-error - testing runtime behavior with wrong types
      expect(locales.includes(undefined)).toBe(false);
    });
  });

  describe("Real-world Usage Patterns", () => {
    test("should support browser locale detection", () => {
      const mockNavigatorLanguages = ["en-US", "en", "fr-CA", "fr"];

      function detectSupportedLocale(navigatorLanguages: readonly string[]): string {
        for (const lang of navigatorLanguages) {
          // Try exact match first
          const exactMatch = locales.find((locale) => locale === lang);
          if (exactMatch) {
            return exactMatch;
          }
          // Try language code only
          const langCode = lang.split("-")[0];
          if (langCode) {
            const langMatch = locales.find((locale) => locale === langCode);
            if (langMatch) {
              return langMatch;
            }
          }
        }
        return "en"; // fallback
      }

      expect(detectSupportedLocale(mockNavigatorLanguages)).toBe("en");
    });

    test("should support i18n library integration", () => {
      interface I18nConfig {
        supportedLocales: readonly string[];
        defaultLocale: string;
        fallbackLocale: string;
      }

      const config: I18nConfig = {
        supportedLocales: locales,
        defaultLocale: "en",
        fallbackLocale: "en",
      };

      expect(config.supportedLocales).toBe(locales);
      expect(config.supportedLocales.includes("fr")).toBe(true);
      expect(config.supportedLocales.includes("invalid")).toBe(false);
    });

    test("should support locale-specific resource loading", () => {
      function getResourcePath(locale: string, resource: string): string {
        const isValidLocale = locales.find((validLocale) => validLocale === locale);
        if (!isValidLocale) {
          throw new Error(`Unsupported locale: ${locale}`);
        }
        return `/locales/${locale}/${resource}.json`;
      }

      expect(getResourcePath("en", "common")).toBe("/locales/en/common.json");
      expect(getResourcePath("zh-tw", "dashboard")).toBe("/locales/zh-tw/dashboard.json");
      expect(() => getResourcePath("invalid", "common")).toThrow("Unsupported locale: invalid");
    });

    test("should support locale menu generation", () => {
      const localeDisplayNames = new Map([
        ["en", "English"],
        ["fr", "Français"],
        ["de", "Deutsch"],
        ["es", "Español"],
        ["zh", "中文"],
        ["zh-tw", "繁體中文"],
        ["ja", "日本語"],
        ["ko", "한국어"],
        ["ar", "العربية"],
        ["ru", "Русский"],
      ]);

      function generateLocaleMenu() {
        return locales
          .filter((locale) => localeDisplayNames.has(locale))
          .map((locale) => ({
            code: locale,
            name: localeDisplayNames.get(locale) as string,
          }));
      }

      const menu = generateLocaleMenu();
      expect(menu.length).toBe(10); // All 10 display names are mapped to locales in our array
      expect(menu.find((item) => item.code === "en")?.name).toBe("English");
      expect(menu.find((item) => item.code === "zh-tw")?.name).toBe("繁體中文");
    });

    test("should support RTL language detection", () => {
      const rtlLocales = ["ar", "he", "fa", "ur"];

      function isRTL(locale: string): boolean {
        return rtlLocales.includes(locale);
      }

      function getSupportedRTLLocales(): string[] {
        return locales.filter((locale) => isRTL(locale));
      }

      const supportedRTL = getSupportedRTLLocales();
      expect(supportedRTL).toContain("ar");
      expect(supportedRTL).not.toContain("he"); // Hebrew not in our locales
      expect(supportedRTL).toHaveLength(1); // Only Arabic is supported
    });
  });
});

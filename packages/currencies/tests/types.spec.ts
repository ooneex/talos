import { describe, expect, it } from "bun:test";
import type { CurrencyCodeType, CurrencyIconType, CurrencyNameType, CurrencySymbolType } from "@/index";
import { CURRENCIES } from "@/index";

describe("Currency Types", () => {
  describe("CurrencyCodeType", () => {
    it("should accept valid currency codes", () => {
      // Test with a sample of currency codes from the constants
      const validCodes: CurrencyCodeType[] = ["USD", "EUR", "GBP", "JPY"];

      validCodes.forEach((code) => {
        expect(typeof code).toBe("string");
        expect(code).toMatch(/^[A-Z]{3}$/);
      });
    });

    it("should include all currency codes from CURRENCIES constant", () => {
      const allCodes = CURRENCIES.map((currency) => currency.code);

      // Type assertion to verify all codes are valid CurrencyCodeType
      const typedCodes: CurrencyCodeType[] = allCodes;

      expect(typedCodes).toHaveLength(CURRENCIES.length);
      expect(typedCodes).toEqual(allCodes);
    });

    it("should have proper TypeScript literal union type behavior", () => {
      // Test that the type accepts only valid values
      const testCode: CurrencyCodeType = "USD";
      expect(testCode).toBe("USD");

      // Test with another valid code
      const anotherCode: CurrencyCodeType = "EUR";
      expect(anotherCode).toBe("EUR");
    });

    it("should match expected major currency codes", () => {
      const majorCodes = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"];
      const allCodes = CURRENCIES.map((currency) => currency.code);

      majorCodes.forEach((code) => {
        expect(allCodes).toContain(code as CurrencyCodeType);
      });
    });
  });

  describe("CurrencyNameType", () => {
    it("should accept valid currency names", () => {
      // Test with a sample of currency names from the constants
      const validNames: CurrencyNameType[] = ["US Dollar", "Euro", "British Pound Sterling", "Japanese Yen"];

      validNames.forEach((name) => {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
        expect(name.trim()).toBe(name);
      });
    });

    it("should include all currency names from CURRENCIES constant", () => {
      const allNames = CURRENCIES.map((currency) => currency.name);

      // Type assertion to verify all names are valid CurrencyNameType
      const typedNames: CurrencyNameType[] = allNames;

      expect(typedNames).toHaveLength(CURRENCIES.length);
      expect(typedNames).toEqual(allNames);
    });

    it("should have proper descriptive currency names", () => {
      const testName: CurrencyNameType = "US Dollar";
      expect(testName).toBe("US Dollar");

      // Test with another valid name
      const anotherName: CurrencyNameType = "Euro";
      expect(anotherName).toBe("Euro");
    });

    it("should contain expected major currency names", () => {
      const majorNames = ["US Dollar", "Euro", "British Pound Sterling", "Japanese Yen"];
      const allNames = CURRENCIES.map((currency) => currency.name);

      majorNames.forEach((name) => {
        expect(allNames).toContain(name as CurrencyNameType);
      });
    });

    it("should have unique currency names", () => {
      const allNames = CURRENCIES.map((currency) => currency.name);
      const uniqueNames = new Set(allNames);

      expect(uniqueNames.size).toBe(allNames.length);
    });
  });

  describe("CurrencyIconType", () => {
    it("should accept valid currency icons", () => {
      // Test with a sample of currency icons from the constants
      const validIcons: CurrencyIconType[] = ["🇺🇸", "🇪🇺", "🇬🇧", "🇯🇵"];

      validIcons.forEach((icon) => {
        expect(typeof icon).toBe("string");
        expect(icon.length).toBeGreaterThan(0);
      });
    });

    it("should include all currency icons from CURRENCIES constant", () => {
      const allIcons = CURRENCIES.map((currency) => currency.icon);

      // Type assertion to verify all icons are valid CurrencyIconType
      const typedIcons: CurrencyIconType[] = allIcons;

      expect(typedIcons).toHaveLength(CURRENCIES.length);
      expect(typedIcons).toEqual(allIcons);
    });

    it("should have proper flag emoji icons for most currencies", () => {
      const testIcon: CurrencyIconType = "🇺🇸";
      expect(testIcon).toBe("🇺🇸");

      // Test with another valid icon
      const anotherIcon: CurrencyIconType = "🇪🇺";
      expect(anotherIcon).toBe("🇪🇺");
    });

    it("should contain expected major currency icons", () => {
      const majorIcons = ["🇺🇸", "🇪🇺", "🇬🇧", "🇯🇵"];
      const allIcons = CURRENCIES.map((currency) => currency.icon);

      majorIcons.forEach((icon) => {
        expect(allIcons).toContain(icon as CurrencyIconType);
      });
    });

    it("should handle special icons like IMF and regional currencies", () => {
      const allIcons = CURRENCIES.map((currency) => currency.icon);

      // Test IMF icon
      expect(allIcons).toContain("🏛️");

      // Test regional icons (like for CFA franc)
      expect(allIcons).toContain("🌍");
    });

    it("should have mostly Unicode flag emojis", () => {
      const allIcons = CURRENCIES.map((currency) => currency.icon);
      const flagEmojis = allIcons.filter((icon) => /[\u{1F1E6}-\u{1F1FF}]/u.test(icon));

      // Most icons should be flag emojis (allowing for some exceptions like IMF and regional)
      expect(flagEmojis.length).toBeGreaterThan(allIcons.length * 0.9);
    });
  });

  describe("CurrencySymbolType", () => {
    it("should accept valid currency symbols", () => {
      // Test with a sample of currency symbols from the constants
      const validSymbols: CurrencySymbolType[] = ["$", "€", "£", "¥"];

      validSymbols.forEach((symbol) => {
        expect(typeof symbol).toBe("string");
        expect(symbol.length).toBeGreaterThan(0);
      });
    });

    it("should include all currency symbols from CURRENCIES constant", () => {
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);

      // Type assertion to verify all symbols are valid CurrencySymbolType
      const typedSymbols: CurrencySymbolType[] = allSymbols;

      expect(typedSymbols).toHaveLength(CURRENCIES.length);
      expect(typedSymbols).toEqual(allSymbols);
    });

    it("should have proper currency symbols", () => {
      const testSymbol: CurrencySymbolType = "$";
      expect(testSymbol).toBe("$");

      // Test with another valid symbol
      const anotherSymbol: CurrencySymbolType = "€";
      expect(anotherSymbol).toBe("€");
    });

    it("should contain expected major currency symbols", () => {
      const majorSymbols = ["$", "€", "£", "¥"];
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);

      majorSymbols.forEach((symbol) => {
        expect(allSymbols).toContain(symbol as CurrencySymbolType);
      });
    });

    it("should handle special Unicode currency symbols", () => {
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);
      const specialSymbols = ["₹", "₽", "₩", "₺", "₴", "₸", "₼", "₾", "₵", "₪", "₱", "₫", "₦", "₨"];

      // Check that some special Unicode symbols are present
      const foundSpecialSymbols = specialSymbols.filter((symbol) => allSymbols.includes(symbol as CurrencySymbolType));
      expect(foundSpecialSymbols.length).toBeGreaterThan(0);
    });

    it("should handle Arabic/RTL currency symbols", () => {
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);
      const arabicSymbols = ["د.إ", "﷼", "ج.س.", "د.م.", "د.ت", "د.ج"];

      // Check that some Arabic symbols are present
      const foundArabicSymbols = arabicSymbols.filter((symbol) => allSymbols.includes(symbol as CurrencySymbolType));
      expect(foundArabicSymbols.length).toBeGreaterThan(0);
    });

    it("should handle multi-character symbols", () => {
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);
      const multiCharSymbols = allSymbols.filter((symbol) => symbol.length > 1);

      expect(multiCharSymbols.length).toBeGreaterThan(0);

      // Test some known multi-character symbols
      expect(allSymbols).toContain("A$" as CurrencySymbolType);
      expect(allSymbols).toContain("C$" as CurrencySymbolType);
      expect(allSymbols).toContain("CHF" as CurrencySymbolType);
      expect(allSymbols).toContain("HK$" as CurrencySymbolType);
    });
  });

  describe("Type relationships and consistency", () => {
    it("should maintain proper relationships between all currency types", () => {
      // Test that the types are derived from the same source
      CURRENCIES.forEach((currency, index) => {
        const code: CurrencyCodeType = currency.code;
        const name: CurrencyNameType = currency.name;
        const icon: CurrencyIconType = currency.icon;
        const symbol: CurrencySymbolType = currency.symbol;

        const currentCurrency = CURRENCIES[index];
        expect(currentCurrency).toBeDefined();
        if (currentCurrency) {
          expect(code).toBe(currentCurrency.code);
          expect(name).toBe(currentCurrency.name);
          expect(icon).toBe(currentCurrency.icon);
          expect(symbol).toBe(currentCurrency.symbol);
        }
      });
    });

    it("should have consistent array lengths for all type unions", () => {
      const codes = CURRENCIES.map((currency) => currency.code);
      const names = CURRENCIES.map((currency) => currency.name);
      const icons = CURRENCIES.map((currency) => currency.icon);
      const symbols = CURRENCIES.map((currency) => currency.symbol);

      expect(codes.length).toBe(names.length);
      expect(names.length).toBe(icons.length);
      expect(icons.length).toBe(symbols.length);
    });

    it("should ensure type safety with literal types", () => {
      // This test verifies that the types are literal unions, not just string
      // The types should only accept values that exist in the CURRENCIES constant
      const validCombination = {
        code: "USD" as CurrencyCodeType,
        name: "US Dollar" as CurrencyNameType,
        icon: "🇺🇸" as CurrencyIconType,
        symbol: "$" as CurrencySymbolType,
      };

      expect(validCombination.code).toBe("USD");
      expect(validCombination.name).toBe("US Dollar");
      expect(validCombination.icon).toBe("🇺🇸");
      expect(validCombination.symbol).toBe("$");
    });

    it("should work with array operations preserving type safety", () => {
      const codes: CurrencyCodeType[] = CURRENCIES.map((currency) => currency.code);
      const names: CurrencyNameType[] = CURRENCIES.map((currency) => currency.name);
      const icons: CurrencyIconType[] = CURRENCIES.map((currency) => currency.icon);
      const symbols: CurrencySymbolType[] = CURRENCIES.map((currency) => currency.symbol);

      expect(codes).toBeInstanceOf(Array);
      expect(names).toBeInstanceOf(Array);
      expect(icons).toBeInstanceOf(Array);
      expect(symbols).toBeInstanceOf(Array);

      // Test that filtering works correctly
      const usdCode = codes.filter((code) => code === "USD");
      expect(usdCode).toEqual(["USD"]);
    });
  });

  describe("TypeScript const assertion behavior", () => {
    it("should respect readonly constraints from const assertion", () => {
      // Verify that the types are derived from a const-asserted array
      // This ensures the types are literal unions rather than generic string types
      const firstCurrency = CURRENCIES[0];

      expect(typeof firstCurrency.code).toBe("string");
      expect(typeof firstCurrency.name).toBe("string");
      expect(typeof firstCurrency.icon).toBe("string");
      expect(typeof firstCurrency.symbol).toBe("string");

      // The specific values should be preserved as literal types
      const code: CurrencyCodeType = firstCurrency.code;
      const name: CurrencyNameType = firstCurrency.name;
      const icon: CurrencyIconType = firstCurrency.icon;
      const symbol: CurrencySymbolType = firstCurrency.symbol;

      expect(code).toBe(firstCurrency.code);
      expect(name).toBe(firstCurrency.name);
      expect(icon).toBe(firstCurrency.icon);
      expect(symbol).toBe(firstCurrency.symbol);
    });
  });

  describe("Edge cases and boundary testing", () => {
    it("should handle all special characters in currency symbols", () => {
      const allSymbols = CURRENCIES.map((currency) => currency.symbol);

      // Test that no symbol is empty
      allSymbols.forEach((symbol) => {
        expect(symbol).toBeTruthy();
        expect(symbol.length).toBeGreaterThan(0);
      });

      // Test various character encodings are handled
      const hasUnicodeSymbols = allSymbols.some((symbol) => /[\u0080-\uFFFF]/.test(symbol));
      expect(hasUnicodeSymbols).toBe(true);
    });

    it("should handle all emoji icons correctly", () => {
      const allIcons = CURRENCIES.map((currency) => currency.icon);

      // Test that no icon is empty
      allIcons.forEach((icon) => {
        expect(icon).toBeTruthy();
        expect(icon.length).toBeGreaterThan(0);
      });

      // Most icons should be emojis (Unicode symbols)
      const hasEmojiIcons = allIcons.some((icon) => /[\u{1F000}-\u{1F9FF}]/u.test(icon));
      expect(hasEmojiIcons).toBe(true);
    });

    it("should ensure all currency names are properly formatted", () => {
      const allNames = CURRENCIES.map((currency) => currency.name);

      allNames.forEach((name) => {
        // No leading/trailing whitespace
        expect(name.trim()).toBe(name);

        // Should be properly capitalized (first letter uppercase)
        expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());

        // Should not be empty
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it("should ensure all currency codes follow ISO standards", () => {
      const allCodes = CURRENCIES.map((currency) => currency.code);

      allCodes.forEach((code) => {
        // Should be exactly 3 characters
        expect(code.length).toBe(3);

        // Should be all uppercase
        expect(code).toBe(code.toUpperCase() as CurrencyCodeType);

        // Should contain only letters (with rare exceptions like XDR)
        expect(code).toMatch(/^[A-Z]{3}$/);
      });
    });
  });
});

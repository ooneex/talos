import { describe, expect, it } from "bun:test";
import { CURRENCIES } from "@/constants";
import type { CurrencyCodeType } from "@/types";

describe("Currency Utilities", () => {
  // Helper functions that could be used with the currencies
  const getCurrencyByCode = (code: CurrencyCodeType) => CURRENCIES.find((currency) => currency.code === code);

  const getCurrenciesBySymbol = (symbol: string) => CURRENCIES.filter((currency) => currency.symbol === symbol);

  const getCurrenciesByRegion = (countryFlag: string) => CURRENCIES.filter((currency) => currency.icon === countryFlag);

  const formatAmount = (amount: number, currencyCode: CurrencyCodeType) => {
    const currency = getCurrencyByCode(currencyCode);
    if (!currency) throw new Error(`Currency ${currencyCode} not found`);

    return `${currency.symbol}${amount.toLocaleString()}`;
  };

  const searchCurrencies = (query: string) => {
    const lowerQuery = query.toLowerCase();
    return CURRENCIES.filter(
      (currency) =>
        currency.code.toLowerCase().includes(lowerQuery) || currency.name.toLowerCase().includes(lowerQuery),
    );
  };

  const createCurrencyMap = () => new Map(CURRENCIES.map((currency) => [currency.code, currency]));

  const validateCurrencyCode = (code: string): code is CurrencyCodeType =>
    CURRENCIES.some((currency) => currency.code === code);

  describe("getCurrencyByCode", () => {
    it("should return currency for valid code", () => {
      const usd = getCurrencyByCode("USD");
      expect(usd).toBeDefined();
      expect(usd?.code).toBe("USD");
      expect(usd?.name).toBe("US Dollar");
    });

    it("should return undefined for invalid code", () => {
      // Testing with invalid code by bypassing type checking
      const invalid = getCurrencyByCode("INVALID" as unknown as CurrencyCodeType);
      expect(invalid).toBeUndefined();
    });

    it("should work with all valid currency codes", () => {
      CURRENCIES.forEach((currency) => {
        const found = getCurrencyByCode(currency.code);
        expect(found).toBeDefined();
        expect(found?.code).toBe(currency.code);
      });
    });
  });

  describe("getCurrenciesBySymbol", () => {
    it("should return currencies with dollar symbol", () => {
      const dollarCurrencies = getCurrenciesBySymbol("$");
      expect(dollarCurrencies.length).toBeGreaterThan(0);
      expect(dollarCurrencies.every((c) => c.symbol === "$")).toBe(true);
      expect(dollarCurrencies.some((c) => c.code === "USD")).toBe(true);
    });

    it("should return single currency for unique symbol", () => {
      const euroCurrencies = getCurrenciesBySymbol("€");
      expect(euroCurrencies.length).toBe(1);
      if (euroCurrencies[0]) {
        expect(euroCurrencies[0].code).toBe("EUR");
      }
    });

    it("should return empty array for non-existent symbol", () => {
      const result = getCurrenciesBySymbol("¤");
      expect(result).toEqual([]);
    });

    it("should handle special Unicode symbols", () => {
      const yenCurrencies = getCurrenciesBySymbol("¥");
      expect(yenCurrencies.length).toBeGreaterThan(0);
      expect(yenCurrencies.some((c) => c.code === "JPY")).toBe(true);
    });
  });

  describe("getCurrenciesByRegion", () => {
    it("should return currency for specific country flag", () => {
      const usCurrencies = getCurrenciesByRegion("🇺🇸");
      expect(usCurrencies.length).toBe(1);
      if (usCurrencies[0]) {
        expect(usCurrencies[0].code).toBe("USD");
      }
    });

    it("should return empty array for non-existent flag", () => {
      const result = getCurrenciesByRegion("🏳️");
      expect(result).toEqual([]);
    });

    it("should handle special regional icons", () => {
      const cfaCurrencies = getCurrenciesByRegion("🌍");
      expect(cfaCurrencies.length).toBeGreaterThan(0);
      if (cfaCurrencies.length > 0) {
        expect(cfaCurrencies.some((c) => c.code === "XOF" || c.code === "XAF")).toBe(true);
      }
    });
  });

  describe("formatAmount", () => {
    it("should format USD amounts correctly", () => {
      expect(formatAmount(1000, "USD")).toBe("$1,000");
      expect(formatAmount(1500.5, "USD")).toBe("$1,500.5");
    });

    it("should format EUR amounts correctly", () => {
      expect(formatAmount(1000, "EUR")).toBe("€1,000");
    });

    it("should format GBP amounts correctly", () => {
      expect(formatAmount(1000, "GBP")).toBe("£1,000");
    });

    it("should throw error for invalid currency code", () => {
      expect(() => {
        // Testing with invalid code by bypassing type checking
        formatAmount(1000, "INVALID" as unknown as CurrencyCodeType);
      }).toThrow("Currency INVALID not found");
    });

    it("should handle zero amounts", () => {
      expect(formatAmount(0, "USD")).toBe("$0");
    });

    it("should handle negative amounts", () => {
      expect(formatAmount(-500, "USD")).toBe("$-500");
    });
  });

  describe("searchCurrencies", () => {
    it("should find currencies by code", () => {
      const results = searchCurrencies("USD");
      expect(results.length).toBe(1);
      if (results[0]) {
        expect(results[0].code).toBe("USD");
      }
    });

    it("should find currencies by name", () => {
      const results = searchCurrencies("dollar");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.code === "USD")).toBe(true);
      expect(results.some((c) => c.code === "AUD")).toBe(true);
    });

    it("should be case insensitive", () => {
      const lowerResults = searchCurrencies("euro");
      const upperResults = searchCurrencies("EURO");
      expect(lowerResults.length).toBe(upperResults.length);
      expect(lowerResults[0]).toEqual(upperResults[0]);
    });

    it("should return empty array for no matches", () => {
      const results = searchCurrencies("nonexistent");
      expect(results).toEqual([]);
    });

    it("should handle partial matches", () => {
      const results = searchCurrencies("pound");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.code === "GBP")).toBe(true);
      expect(results.some((c) => c.code === "EGP")).toBe(true);
    });
  });

  describe("createCurrencyMap", () => {
    it("should create a map with all currencies", () => {
      const map = createCurrencyMap();
      expect(map.size).toBe(CURRENCIES.length);
    });

    it("should provide O(1) lookup", () => {
      const map = createCurrencyMap();
      const usd = map.get("USD");
      expect(usd).toBeDefined();
      if (usd) {
        expect(usd.code).toBe("USD");
        expect(usd.name).toBe("US Dollar");
      }
    });

    it("should maintain all currency data", () => {
      const map = createCurrencyMap();
      CURRENCIES.forEach((currency) => {
        const mapped = map.get(currency.code);
        expect(mapped).toEqual(currency);
      });
    });

    it("should support efficient lookups", () => {
      const map = createCurrencyMap();
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        map.get("USD");
        map.get("EUR");
        map.get("GBP");
      }

      const end = performance.now();
      expect(end - start).toBeLessThan(10); // Should be very fast
    });
  });

  describe("validateCurrencyCode", () => {
    it("should return true for valid codes", () => {
      expect(validateCurrencyCode("USD")).toBe(true);
      expect(validateCurrencyCode("EUR")).toBe(true);
      expect(validateCurrencyCode("GBP")).toBe(true);
    });

    it("should return false for invalid codes", () => {
      expect(validateCurrencyCode("INVALID")).toBe(false);
      expect(validateCurrencyCode("usd")).toBe(false);
      expect(validateCurrencyCode("")).toBe(false);
      expect(validateCurrencyCode("US")).toBe(false);
      expect(validateCurrencyCode("USDD")).toBe(false);
    });

    it("should work as type guard", () => {
      const code: string = "USD";
      if (validateCurrencyCode(code)) {
        // TypeScript should now know `code` is CurrencyCodeType
        const currency = getCurrencyByCode(code);
        expect(currency).toBeDefined();
      }
    });

    it("should validate all existing currency codes", () => {
      CURRENCIES.forEach((currency) => {
        expect(validateCurrencyCode(currency.code)).toBe(true);
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should support currency conversion workflow", () => {
      const fromCurrency = getCurrencyByCode("USD");
      const toCurrency = getCurrencyByCode("EUR");

      expect(fromCurrency).toBeDefined();
      expect(toCurrency).toBeDefined();

      const amount = 100;
      const fromFormatted = formatAmount(amount, "USD");
      const toFormatted = formatAmount(amount * 0.85, "EUR"); // Mock conversion rate

      expect(fromFormatted).toBe("$100");
      expect(toFormatted).toBe("€85");
    });

    it("should support currency picker component", () => {
      const popularCurrencies = ["USD", "EUR", "GBP", "JPY"] as const;
      const currencyOptions = popularCurrencies
        .map((code) => getCurrencyByCode(code))
        .filter((currency): currency is NonNullable<typeof currency> => Boolean(currency))
        .map((currency) => ({
          value: currency.code,
          label: `${currency.icon} ${currency.code} - ${currency.name}`,
          symbol: currency.symbol,
        }));

      expect(currencyOptions.length).toBe(4);
      if (currencyOptions[0]) {
        expect(currencyOptions[0].value).toBe("USD");
        expect(currencyOptions[0].label).toBe("🇺🇸 USD - US Dollar");
        expect(currencyOptions[0].symbol).toBe("$");
      }
    });

    it("should support currency statistics", () => {
      const symbolCounts = new Map<string, number>();

      CURRENCIES.forEach((currency) => {
        const count = symbolCounts.get(currency.symbol) || 0;
        symbolCounts.set(currency.symbol, count + 1);
      });

      const dollarCount = symbolCounts.get("$") || 0;
      expect(dollarCount).toBeGreaterThan(1);

      const euroCount = symbolCounts.get("€") || 0;
      expect(euroCount).toBe(1);
    });

    it("should support bulk operations", () => {
      const start = performance.now();

      // Simulate processing all currencies
      const processed = CURRENCIES.map((currency) => ({
        ...currency,
        displayName: `${currency.icon} ${currency.code}`,
        searchableText: `${currency.code} ${currency.name}`.toLowerCase(),
      }));

      const end = performance.now();

      expect(processed.length).toBe(CURRENCIES.length);
      expect(end - start).toBeLessThan(50); // Should be reasonably fast

      // Verify processed data
      const usd = processed.find((c) => c.code === "USD");
      if (usd) {
        expect(usd.displayName).toBe("🇺🇸 USD");
        expect(usd.searchableText).toBe("usd us dollar");
      }
    });
  });
});

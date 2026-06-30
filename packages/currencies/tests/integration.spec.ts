import { describe, expect, it } from "bun:test";
import { CURRENCIES } from "@/constants";
import type { CurrencyCodeType, CurrencyIconType, CurrencyNameType, CurrencySymbolType } from "@/types";

describe("Constants and Types Integration", () => {
  describe("Type compatibility", () => {
    it("should allow currency codes to be assigned to CurrencyCodeType", () => {
      CURRENCIES.forEach((currency) => {
        const code: CurrencyCodeType = currency.code;
        expect(code).toBe(currency.code);
      });
    });

    it("should allow currency names to be assigned to CurrencyNameType", () => {
      CURRENCIES.forEach((currency) => {
        const name: CurrencyNameType = currency.name;
        expect(name).toBe(currency.name);
      });
    });

    it("should allow currency icons to be assigned to CurrencyIconType", () => {
      CURRENCIES.forEach((currency) => {
        const icon: CurrencyIconType = currency.icon;
        expect(icon).toBe(currency.icon);
      });
    });

    it("should allow currency symbols to be assigned to CurrencySymbolType", () => {
      CURRENCIES.forEach((currency) => {
        const symbol: CurrencySymbolType = currency.symbol;
        expect(symbol).toBe(currency.symbol);
      });
    });
  });

  describe("Type inference", () => {
    it("should infer correct union types from CURRENCIES array", () => {
      // Test that specific currency codes exist in the type
      const usdCode: CurrencyCodeType = "USD";
      const eurCode: CurrencyCodeType = "EUR";
      const gbpCode: CurrencyCodeType = "GBP";

      expect(usdCode).toBe("USD");
      expect(eurCode).toBe("EUR");
      expect(gbpCode).toBe("GBP");
    });

    it("should work with currency lookup functions", () => {
      const findCurrencyByCode = (code: CurrencyCodeType) => CURRENCIES.find((currency) => currency.code === code);

      const usd = findCurrencyByCode("USD");
      expect(usd).toBeDefined();
      expect(usd?.code).toBe("USD");

      const eur = findCurrencyByCode("EUR");
      expect(eur).toBeDefined();
      expect(eur?.code).toBe("EUR");
    });

    it("should work with currency filtering functions", () => {
      const filterCurrenciesBySymbol = (symbol: CurrencySymbolType) =>
        CURRENCIES.filter((currency) => currency.symbol === symbol);

      const dollarCurrencies = filterCurrenciesBySymbol("$");
      expect(dollarCurrencies.length).toBeGreaterThan(0);
      expect(dollarCurrencies.every((c) => c.symbol === "$")).toBe(true);

      const euroCurrencies = filterCurrenciesBySymbol("€");
      expect(euroCurrencies.length).toBe(1);
      if (euroCurrencies[0]) {
        expect(euroCurrencies[0].code).toBe("EUR");
      }
    });
  });

  describe("Practical usage scenarios", () => {
    it("should support currency dropdown/select scenarios", () => {
      interface CurrencyOption {
        value: CurrencyCodeType;
        label: CurrencyNameType;
        icon: CurrencyIconType;
        symbol: CurrencySymbolType;
      }

      const currencyOptions: CurrencyOption[] = CURRENCIES.map((currency) => ({
        value: currency.code,
        label: currency.name,
        icon: currency.icon,
        symbol: currency.symbol,
      }));

      expect(currencyOptions.length).toBe(CURRENCIES.length);
      expect(currencyOptions[0]).toHaveProperty("value");
      expect(currencyOptions[0]).toHaveProperty("label");
      expect(currencyOptions[0]).toHaveProperty("icon");
      expect(currencyOptions[0]).toHaveProperty("symbol");
    });

    it("should support currency formatting scenarios", () => {
      const formatCurrency = (amount: number, code: CurrencyCodeType): string => {
        const currency = CURRENCIES.find((c) => c.code === code);
        if (!currency) throw new Error(`Currency ${code} not found`);

        return `${currency.symbol}${amount.toLocaleString()}`;
      };

      expect(formatCurrency(1000, "USD")).toBe("$1,000");
      expect(formatCurrency(1000, "EUR")).toBe("€1,000");
      expect(formatCurrency(1000, "GBP")).toBe("£1,000");
    });

    it("should support currency validation scenarios", () => {
      const isValidCurrencyCode = (code: string): code is CurrencyCodeType =>
        CURRENCIES.some((currency) => currency.code === code);

      expect(isValidCurrencyCode("USD")).toBe(true);
      expect(isValidCurrencyCode("EUR")).toBe(true);
      expect(isValidCurrencyCode("INVALID")).toBe(false);
      expect(isValidCurrencyCode("usd")).toBe(false);
    });

    it("should support currency grouping scenarios", () => {
      interface CurrencyGroup {
        region: string;
        currencies: (typeof CURRENCIES)[number][];
      }

      const majorCurrencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"] as const;
      const majorGroup: CurrencyGroup = {
        region: "Major",
        currencies: CURRENCIES.filter((c) => (majorCurrencies as readonly string[]).includes(c.code)),
      };

      expect(majorGroup.currencies.length).toBe(6);
      expect(majorGroup.currencies.every((c) => (majorCurrencies as readonly string[]).includes(c.code))).toBe(true);
    });

    it("should support currency search scenarios", () => {
      const searchCurrencies = (query: string) => {
        const lowerQuery = query.toLowerCase();
        return CURRENCIES.filter(
          (currency) =>
            currency.code.toLowerCase().includes(lowerQuery) || currency.name.toLowerCase().includes(lowerQuery),
        );
      };

      const dollarResults = searchCurrencies("dollar");
      expect(dollarResults.length).toBeGreaterThan(0);
      expect(dollarResults.some((c) => c.code === "USD")).toBe(true);

      const euroResults = searchCurrencies("euro");
      expect(euroResults.length).toBeGreaterThan(0);
      expect(euroResults.some((c) => c.code === "EUR")).toBe(true);
    });
  });

  describe("Type safety", () => {
    it("should prevent invalid currency codes at compile time", () => {
      // These would fail at TypeScript compile time, but we can test the runtime behavior
      const validCodes = CURRENCIES.map((c) => c.code);

      expect(validCodes).toContain("USD");
      expect(validCodes).toContain("EUR");
      expect(validCodes).not.toContain("INVALID");
    });

    it("should maintain immutability through const assertion", () => {
      // The 'as const' assertion should make the array readonly at type level
      // At runtime, JavaScript doesn't prevent mutations, but TypeScript should
      const originalCode = CURRENCIES[0].code;
      const originalLength = CURRENCIES.length;

      // Verify the original data follows expected format
      expect(originalCode).toMatch(/^[A-Z]{3}$/);
      expect(CURRENCIES).toHaveLength(originalLength);

      // Test that the structure is preserved
      expect(CURRENCIES[0]).toHaveProperty("code");
      expect(CURRENCIES[0]).toHaveProperty("name");
      expect(CURRENCIES[0]).toHaveProperty("icon");
      expect(CURRENCIES[0]).toHaveProperty("symbol");
    });
  });

  describe("Performance considerations", () => {
    it("should handle large-scale operations efficiently", () => {
      const start = performance.now();

      // Simulate common operations
      for (let i = 0; i < 1000; i++) {
        CURRENCIES.find((c) => c.code === "USD");
        CURRENCIES.filter((c) => c.symbol === "$");
        CURRENCIES.map((c) => c.name);
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(100); // 100ms
    });

    it("should support efficient currency lookup maps", () => {
      // Create lookup maps for O(1) access
      const codeMap = new Map(CURRENCIES.map((c) => [c.code, c]));
      const nameMap = new Map(CURRENCIES.map((c) => [c.name, c]));

      // Find actual currencies that exist
      const firstCurrency = CURRENCIES[0];
      const usdCurrency = CURRENCIES.find((c) => c.code === "USD");
      const eurCurrency = CURRENCIES.find((c) => c.code === "EUR");

      expect(codeMap.get(firstCurrency.code)).toBeDefined();
      if (usdCurrency) expect(codeMap.get("USD")).toBeDefined();
      if (eurCurrency) expect(codeMap.get("EUR")).toBeDefined();

      expect(nameMap.get(firstCurrency.name)).toBeDefined();
      if (usdCurrency) expect(nameMap.get("US Dollar")).toBeDefined();
      if (eurCurrency) expect(nameMap.get("Euro")).toBeDefined();

      expect(codeMap.size).toBe(CURRENCIES.length);
      expect(nameMap.size).toBe(CURRENCIES.length);
    });
  });
});

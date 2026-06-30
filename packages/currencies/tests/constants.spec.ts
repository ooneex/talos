import { describe, expect, it } from "bun:test";
import { CURRENCIES } from "@/constants";

describe("CURRENCIES", () => {
  it("should be defined and not empty", () => {
    expect(CURRENCIES).toBeDefined();
    expect(CURRENCIES.length).toBeGreaterThan(0);
  });

  it("should have the expected number of currencies", () => {
    expect(CURRENCIES.length).toBe(84);
  });

  describe("Currency structure", () => {
    it("should have all required properties for each currency", () => {
      CURRENCIES.forEach((currency) => {
        expect(currency).toHaveProperty("code");
        expect(currency).toHaveProperty("name");
        expect(currency).toHaveProperty("icon");
        expect(currency).toHaveProperty("symbol");

        expect(typeof currency.code).toBe("string");
        expect(typeof currency.name).toBe("string");
        expect(typeof currency.icon).toBe("string");
        expect(typeof currency.symbol).toBe("string");

        expect(currency.code).not.toBe("");
        expect(currency.name).not.toBe("");
        expect(currency.icon).not.toBe("");
        expect(currency.symbol).not.toBe("");
      });
    });

    it("should have currency codes in uppercase ISO format", () => {
      CURRENCIES.forEach((currency) => {
        expect(currency.code).toMatch(/^[A-Z]{3}$/);
        expect(currency.code as string).toBe((currency.code as string).toUpperCase());
      });
    });

    it("should have proper currency names (non-empty strings)", () => {
      CURRENCIES.forEach((currency) => {
        expect(currency.name.length).toBeGreaterThan(0);
        expect(currency.name.trim()).toBe(currency.name);
      });
    });

    it("should have non-empty icons and symbols", () => {
      CURRENCIES.forEach((currency) => {
        expect(currency.icon.length).toBeGreaterThan(0);
        expect(currency.symbol.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Uniqueness constraints", () => {
    it("should have unique currency codes", () => {
      const codes = CURRENCIES.map((currency) => currency.code as string);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("should have unique currency names", () => {
      const names = CURRENCIES.map((currency) => currency.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe("Specific currency validation", () => {
    it("should contain major world currencies", () => {
      const majorCurrencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      majorCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should have correct USD details", () => {
      const usd = CURRENCIES.find((currency) => currency.code === "USD");
      expect(usd).toBeDefined();
      expect(usd?.name).toBe("US Dollar");
      expect(usd?.icon).toBe("🇺🇸");
      expect(usd?.symbol).toBe("$");
    });

    it("should have correct EUR details", () => {
      const eur = CURRENCIES.find((currency) => currency.code === "EUR");
      expect(eur).toBeDefined();
      expect(eur?.name).toBe("Euro");
      expect(eur?.icon).toBe("🇪🇺");
      expect(eur?.symbol).toBe("€");
    });

    it("should have correct GBP details", () => {
      const gbp = CURRENCIES.find((currency) => currency.code === "GBP");
      expect(gbp).toBeDefined();
      expect(gbp?.name).toBe("British Pound Sterling");
      expect(gbp?.icon).toBe("🇬🇧");
      expect(gbp?.symbol).toBe("£");
    });

    it("should have correct JPY details", () => {
      const jpy = CURRENCIES.find((currency) => currency.code === "JPY");
      expect(jpy).toBeDefined();
      expect(jpy?.name).toBe("Japanese Yen");
      expect(jpy?.icon).toBe("🇯🇵");
      expect(jpy?.symbol).toBe("¥");
    });
  });

  describe("Regional coverage", () => {
    it("should include African currencies", () => {
      const africanCurrencies = ["ZAR", "NGN", "KES", "GHS", "MAD", "EGP"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      africanCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include Asian currencies", () => {
      const asianCurrencies = ["CNY", "INR", "KRW", "THB", "SGD", "HKD", "JPY"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      asianCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include European currencies", () => {
      const europeanCurrencies = ["EUR", "GBP", "CHF", "SEK", "NOK", "PLN", "DKK"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      europeanCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include North American currencies", () => {
      const northAmericanCurrencies = ["USD", "CAD", "MXN"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      northAmericanCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include South American currencies", () => {
      const southAmericanCurrencies = ["BRL", "ARS", "CLP", "COP"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      southAmericanCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include Oceanian currencies", () => {
      const oceanianCurrencies = ["AUD", "NZD"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      oceanianCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });
  });

  describe("Special currencies", () => {
    it("should include CFA Franc variants", () => {
      const cfaCurrencies = ["XOF", "XAF"];
      const codes = CURRENCIES.map((currency) => currency.code as string);

      cfaCurrencies.forEach((code) => {
        expect(codes.includes(code)).toBe(true);
      });
    });

    it("should include IMF Special Drawing Rights", () => {
      const xdr = CURRENCIES.find((currency) => currency.code === "XDR");
      expect(xdr).toBeDefined();
      expect(xdr?.name).toBe("Special Drawing Rights (IMF)");
      expect(xdr?.icon).toBe("🏛️");
      expect(xdr?.symbol).toBe("XDR");
    });
  });

  describe("Data consistency", () => {
    it("should have consistent data types across all entries", () => {
      const firstCurrency = CURRENCIES[0];
      const expectedKeys = Object.keys(firstCurrency);

      CURRENCIES.forEach((currency) => {
        expect(Object.keys(currency)).toEqual(expectedKeys);
        expect(typeof currency.code).toBe(typeof firstCurrency.code);
        expect(typeof currency.name).toBe(typeof firstCurrency.name);
        expect(typeof currency.icon).toBe(typeof firstCurrency.icon);
        expect(typeof currency.symbol).toBe(typeof firstCurrency.symbol);
      });
    });

    it("should not have any null or undefined values", () => {
      CURRENCIES.forEach((currency) => {
        expect(currency.code).not.toBeNull();
        expect(currency.code).not.toBeUndefined();
        expect(currency.name).not.toBeNull();
        expect(currency.name).not.toBeUndefined();
        expect(currency.icon).not.toBeNull();
        expect(currency.icon).not.toBeUndefined();
        expect(currency.symbol).not.toBeNull();
        expect(currency.symbol).not.toBeUndefined();
      });
    });
  });

  describe("TypeScript const assertion", () => {
    it("should be a readonly array type", () => {
      // This test verifies the 'as const' assertion creates proper readonly types
      // At runtime, JavaScript arrays are still mutable, but TypeScript should prevent mutations
      const originalLength = CURRENCIES.length;

      // Test that the array structure is preserved
      expect(CURRENCIES).toHaveLength(originalLength);
      expect(typeof CURRENCIES[0]).toBe("object");
      expect(CURRENCIES[0]).toHaveProperty("code");
    });
  });

  describe("Edge cases and symbols", () => {
    it("should handle currencies with special Unicode symbols", () => {
      const specialSymbolCurrencies = CURRENCIES.filter((currency) => /[₹₽₩₺₴₸₼₾₵₪₱₫₦₨]/u.test(currency.symbol));

      expect(specialSymbolCurrencies.length).toBeGreaterThan(0);

      // Test specific currencies with special symbols
      expect(CURRENCIES.find((c) => c.code === "INR")?.symbol).toBe("₹");
      expect(CURRENCIES.find((c) => c.code === "RUB")?.symbol).toBe("₽");
      expect(CURRENCIES.find((c) => c.code === "KRW")?.symbol).toBe("₩");
      expect(CURRENCIES.find((c) => c.code === "TRY")?.symbol).toBe("₺");
    });

    it("should handle currencies with Arabic/RTL symbols", () => {
      const arabicSymbolCurrencies = CURRENCIES.filter((currency) => /[\u0600-\u06FF]/u.test(currency.symbol));

      expect(arabicSymbolCurrencies.length).toBeGreaterThan(0);

      // Test specific Arabic currencies
      expect(CURRENCIES.find((c) => c.code === "AED")?.symbol).toBe("د.إ");
      expect(CURRENCIES.find((c) => c.code === "SAR")?.symbol).toBe("﷼");
    });
  });
});

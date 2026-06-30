import { describe, expect, test } from "bun:test";
import { CURRENCIES } from "@talosjs/currencies";
import { AssertCurrency } from "@/constraints";

describe("AssertCurrency", () => {
  const validator = new AssertCurrency();

  test("should validate all supported currency codes from the package", () => {
    for (const currency of CURRENCIES) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject invalid currency codes", () => {
    const invalidCurrencies = ["ABC", "XYZ", "FOO", "BAR", "TEST", "FAKE", "INVALID"];

    for (const currency of invalidCurrencies) {
      const result = validator.validate(currency);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject lowercase currency codes", () => {
    const sampleCurrencies = CURRENCIES.slice(0, 4);

    for (const currency of sampleCurrencies) {
      const lowercaseCode = currency.code.toLowerCase();
      const result = validator.validate(lowercaseCode);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject mixed case currency codes", () => {
    const mixedCaseCurrencies = ["Usd", "eUR", "GbP", "UsD"];

    for (const currency of mixedCaseCurrencies) {
      const result = validator.validate(currency);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject codes that are too short", () => {
    const shortCodes = ["US", "EU", "A", ""];

    for (const code of shortCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject codes that are too long", () => {
    const longCodes = ["USDA", "EURO", "DOLLARS", "POUNDS"];

    for (const code of longCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject codes with numbers", () => {
    const codesWithNumbers = ["US1", "E2R", "GB3", "123"];

    for (const code of codesWithNumbers) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject codes with special characters", () => {
    const codesWithSpecialChars = ["US$", "EU@", "GB#", "U*D"];

    for (const code of codesWithSpecialChars) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true, false];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject codes with spaces", () => {
    const codesWithSpaces = ["U S", "US ", " US", " USD ", "U SD"];

    for (const code of codesWithSpaces) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should validate major world currencies from the package", () => {
    const majorCurrencyCodes = ["USD", "EUR", "GBP", "JPY", "CNY", "INR"];
    const majorCurrencies = CURRENCIES.filter((currency) => majorCurrencyCodes.includes(currency.code));

    expect(majorCurrencies.length).toBeGreaterThan(0);

    for (const currency of majorCurrencies) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate African currencies from the package", () => {
    const africanCurrencyCodes = [
      "ZAR",
      "NGN",
      "EGP",
      "KES",
      "GHS",
      "MAD",
      "TND",
      "DZD",
      "XOF",
      "XAF",
      "BWP",
      "ETB",
      "TZS",
      "UGX",
      "RWF",
      "MUR",
      "SDG",
      "CVE",
      "SZL",
      "LSL",
      "MZN",
      "AOA",
      "MWK",
      "GMD",
      "SLL",
      "SCR",
      "DJF",
      "SOS",
      "MGA",
      "BIF",
      "KMF",
      "ERN",
      "LYD",
    ];

    const africanCurrencies = CURRENCIES.filter((currency) => africanCurrencyCodes.includes(currency.code));

    expect(africanCurrencies.length).toBeGreaterThan(0);

    for (const currency of africanCurrencies) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate special currencies from the package", () => {
    const specialCurrencyCodes = ["XOF", "XAF", "XDR"];
    const specialCurrencies = CURRENCIES.filter((currency) => specialCurrencyCodes.includes(currency.code));

    expect(specialCurrencies.length).toBe(3);

    for (const currency of specialCurrencies) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject historical or invalid ISO codes", () => {
    const historicalCodes = ["DEM", "FRF", "ITL", "ESP", "NLG", "FIM"];

    for (const code of historicalCodes) {
      const result = validator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Currency code must be a valid ISO 4217 currency code (3 uppercase letters)");
    }
  });

  test("should validate currencies with specific symbols", () => {
    const currenciesWithDollarSign = CURRENCIES.filter((currency) => currency.symbol.includes("$"));

    expect(currenciesWithDollarSign.length).toBeGreaterThan(0);

    for (const currency of currenciesWithDollarSign) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate currencies by region using currency data", () => {
    const euroSymbolCurrencies = CURRENCIES.filter((currency) => currency.symbol === "€");

    const yenSymbolCurrencies = CURRENCIES.filter((currency) => currency.symbol === "¥");

    expect(euroSymbolCurrencies.length).toBeGreaterThan(0);
    expect(euroSymbolCurrencies.some((c) => c.code === "EUR")).toBe(true);
    expect(yenSymbolCurrencies.length).toBeGreaterThan(0);
    expect(yenSymbolCurrencies.some((c) => c.code === "JPY" || c.code === "CNY")).toBe(true);
    expect(yenSymbolCurrencies.length).toBeGreaterThan(0);
    expect(yenSymbolCurrencies.some((c) => c.code === "JPY")).toBe(true);
    expect(yenSymbolCurrencies.some((c) => c.code === "CNY")).toBe(true);

    for (const currency of [...euroSymbolCurrencies, ...yenSymbolCurrencies]) {
      const result = validator.validate(currency.code);
      expect(result.isValid).toBe(true);
    }
  });
});

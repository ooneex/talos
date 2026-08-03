import { describe, expect, it } from "bun:test";
import { CurrencyConverter, type ExchangeRatesType } from "@/converter";

describe("CurrencyConverter", () => {
  describe("constructor", () => {
    it("should pin the base currency to a rate of 1", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.getBaseCurrency()).toBe("EUR");
      expect(converter.getRate("EUR")).toBe(1);
    });

    it("should seed the rates it is given", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1, GBP: 0.85 });
      expect(converter.getRate("USD")).toBe(1.1);
      expect(converter.getRate("GBP")).toBe(0.85);
    });

    it("should let a seeded rate override the base currency", () => {
      const converter = new CurrencyConverter("EUR", { EUR: 2 });
      expect(converter.getRate("EUR")).toBe(2);
    });
  });

  describe("setRate", () => {
    it("should store the rate and chain", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.setRate("USD", 1.1)).toBe(converter);
      expect(converter.getRate("USD")).toBe(1.1);
    });

    it("should overwrite an existing rate", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1 });
      converter.setRate("USD", 1.2);
      expect(converter.getRate("USD")).toBe(1.2);
    });

    it("should reject a zero or negative rate", () => {
      const converter = new CurrencyConverter("EUR");
      expect(() => converter.setRate("USD", 0)).toThrow("Exchange rate must be positive, got 0");
      expect(() => converter.setRate("USD", -1.5)).toThrow("Exchange rate must be positive, got -1.5");
      expect(converter.hasRate("USD")).toBe(false);
    });
  });

  describe("setRates", () => {
    it("should store every rate and chain", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.setRates({ USD: 1.1, GBP: 0.85 })).toBe(converter);
      expect(converter.getRate("USD")).toBe(1.1);
      expect(converter.getRate("GBP")).toBe(0.85);
    });

    it("should skip undefined rates", () => {
      const converter = new CurrencyConverter("EUR");
      // A Partial record lets a caller hand over an explicitly undefined rate.
      const rates: ExchangeRatesType = { USD: 1.1 };
      Object.assign(rates, { GBP: undefined });

      converter.setRates(rates);
      expect(converter.hasRate("GBP")).toBe(false);
    });

    it("should reject a non-positive rate", () => {
      const converter = new CurrencyConverter("EUR");
      expect(() => converter.setRates({ USD: -1 })).toThrow("Exchange rate must be positive, got -1");
    });
  });

  describe("getRate / hasRate / getRates", () => {
    it("should report an unknown currency as missing", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.getRate("JPY")).toBeUndefined();
      expect(converter.hasRate("JPY")).toBe(false);
    });

    it("should expose every known rate", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1 });
      expect([...converter.getRates()]).toEqual([
        ["EUR", 1],
        ["USD", 1.1],
      ]);
    });
  });

  describe("convert", () => {
    it("should convert through the base currency", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.2, GBP: 0.8 });
      const result = converter.convert(100, "USD", "GBP");
      expect(result).toEqual({
        from: "USD",
        to: "GBP",
        amount: 100,
        result: 100 * (0.8 / 1.2),
        rate: 0.8 / 1.2,
      });
    });

    it("should short-circuit when both sides are the same currency", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.convert(42, "JPY", "JPY")).toEqual({
        from: "JPY",
        to: "JPY",
        amount: 42,
        result: 42,
        rate: 1,
      });
    });

    it("should convert from the base currency", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.5 });
      expect(converter.convert(10, "EUR", "USD").result).toBe(15);
    });

    it("should throw when the source rate is unknown", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1 });
      expect(() => converter.convert(10, "JPY", "USD")).toThrow("No exchange rate found for JPY");
    });

    it("should throw when the target rate is unknown", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1 });
      expect(() => converter.convert(10, "USD", "JPY")).toThrow("No exchange rate found for JPY");
    });
  });

  describe("format", () => {
    it("should prefix the amount with the currency symbol", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.format(1234.5, "USD")).toBe("$1234.50");
    });

    it("should honour the requested decimals", () => {
      const converter = new CurrencyConverter("EUR");
      expect(converter.format(1234.567, "USD", 0)).toBe("$1235");
      expect(converter.format(1234.567, "USD", 3)).toBe("$1234.567");
    });

    it("should throw on a currency that is not in the catalogue", () => {
      const converter = new CurrencyConverter("EUR");
      expect(() => converter.format(1, "XXX" as never)).toThrow("Currency XXX not found");
    });
  });

  describe("convertAndFormat", () => {
    it("should convert then format the result", () => {
      const converter = new CurrencyConverter("EUR", { USD: 2 });
      expect(converter.convertAndFormat(10, "EUR", "USD")).toBe("$20.00");
      expect(converter.convertAndFormat(10, "EUR", "USD", 0)).toBe("$20");
    });

    it("should propagate a missing rate", () => {
      const converter = new CurrencyConverter("EUR");
      expect(() => converter.convertAndFormat(10, "EUR", "JPY")).toThrow("No exchange rate found for JPY");
    });
  });

  describe("getSupportedCurrencies", () => {
    it("should list the base currency and every rate added", () => {
      const converter = new CurrencyConverter("EUR", { USD: 1.1 });
      converter.setRate("GBP", 0.85);
      expect(converter.getSupportedCurrencies()).toEqual(["EUR", "USD", "GBP"]);
    });
  });
});

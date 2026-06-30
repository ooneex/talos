import { CURRENCIES } from "./constants";
import type { CurrencyCodeType } from "./types";

export type ExchangeRatesType = Partial<Record<CurrencyCodeType, number>>;

export type ConversionResultType = {
  from: CurrencyCodeType;
  to: CurrencyCodeType;
  amount: number;
  result: number;
  rate: number;
};

export class CurrencyConverter {
  private readonly baseCurrency: CurrencyCodeType;
  private readonly rates: Map<CurrencyCodeType, number> = new Map();

  constructor(baseCurrency: CurrencyCodeType, rates?: ExchangeRatesType) {
    this.baseCurrency = baseCurrency;
    this.rates.set(baseCurrency, 1);

    if (rates) {
      for (const [code, rate] of Object.entries(rates)) {
        this.rates.set(code as CurrencyCodeType, rate);
      }
    }
  }

  getBaseCurrency(): CurrencyCodeType {
    return this.baseCurrency;
  }

  setRate(code: CurrencyCodeType, rate: number): this {
    if (rate <= 0) {
      throw new Error(`Exchange rate must be positive, got ${rate}`);
    }
    this.rates.set(code, rate);
    return this;
  }

  setRates(rates: ExchangeRatesType): this {
    for (const [code, rate] of Object.entries(rates)) {
      if (rate !== undefined) {
        this.setRate(code as CurrencyCodeType, rate);
      }
    }
    return this;
  }

  getRate(code: CurrencyCodeType): number | undefined {
    return this.rates.get(code);
  }

  getRates(): ReadonlyMap<CurrencyCodeType, number> {
    return this.rates;
  }

  hasRate(code: CurrencyCodeType): boolean {
    return this.rates.has(code);
  }

  convert(amount: number, from: CurrencyCodeType, to: CurrencyCodeType): ConversionResultType {
    if (from === to) {
      return { from, to, amount, result: amount, rate: 1 };
    }

    const fromRate = this.rates.get(from);
    const toRate = this.rates.get(to);

    if (fromRate === undefined) {
      throw new Error(`No exchange rate found for ${from}`);
    }
    if (toRate === undefined) {
      throw new Error(`No exchange rate found for ${to}`);
    }

    const rate = toRate / fromRate;
    const result = amount * rate;

    return { from, to, amount, result, rate };
  }

  format(amount: number, code: CurrencyCodeType, decimals = 2): string {
    const currency = CURRENCIES.find((c) => c.code === code);
    if (!currency) {
      throw new Error(`Currency ${code} not found`);
    }

    const formatted = amount.toFixed(decimals);
    return `${currency.symbol}${formatted}`;
  }

  convertAndFormat(amount: number, from: CurrencyCodeType, to: CurrencyCodeType, decimals = 2): string {
    const { result } = this.convert(amount, from, to);
    return this.format(result, to, decimals);
  }

  getSupportedCurrencies(): CurrencyCodeType[] {
    return [...this.rates.keys()];
  }
}

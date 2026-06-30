# @talosjs/currencies

Comprehensive currency dataset with ISO 4217 codes, symbols, names, and TypeScript type definitions for financial and e-commerce applications. This package provides a complete list of world currencies with their codes, names, symbols, and country flag icons, plus a built-in currency converter class for exchange rate calculations.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Currency Data** - Complete list of world currencies with ISO 4217 codes, names, symbols, and flag icons

✅ **Currency Converter** - Built-in `CurrencyConverter` class for exchange rate management and conversion

✅ **Formatting** - Format monetary amounts with correct currency symbols

✅ **Type-Safe** - Union types for currency codes, names, symbols, and icons

✅ **Zero Config** - Ready to use out of the box with no external dependencies

✅ **Lightweight** - Minimal bundle size with tree-shakeable exports

## Installation

```bash
bun add @talosjs/currencies
```

## Usage

### Accessing Currency Data

```typescript
import { CURRENCIES } from '@talosjs/currencies';

// Access all currencies
CURRENCIES.forEach(currency => {
  console.log(`${currency.icon} ${currency.name} (${currency.code}) - ${currency.symbol}`);
});

// Find a specific currency
const usd = CURRENCIES.find(c => c.code === 'USD');
console.log(usd); // { code: 'USD', name: 'US Dollar', icon: '...', symbol: '$' }
```

### Using Currency Types

```typescript
import type { CurrencyCodeType, CurrencyNameType, CurrencySymbolType } from '@talosjs/currencies';

const code: CurrencyCodeType = 'EUR'; // Valid
const name: CurrencyNameType = 'Euro'; // Valid
const symbol: CurrencySymbolType = '$'; // Valid
```

### Currency Conversion

```typescript
import { CurrencyConverter } from '@talosjs/currencies';

const converter = new CurrencyConverter('USD', {
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.50,
});

// Convert amounts
const result = converter.convert(100, 'USD', 'EUR');
console.log(result); // { from: 'USD', to: 'EUR', amount: 100, result: 92, rate: 0.92 }

// Format with currency symbol
console.log(converter.format(99.99, 'EUR')); // "...99.99"

// Convert and format in one step
console.log(converter.convertAndFormat(100, 'USD', 'GBP')); // "...79.00"
```

### Managing Exchange Rates

```typescript
import { CurrencyConverter } from '@talosjs/currencies';

const converter = new CurrencyConverter('USD');

// Set individual rates
converter.setRate('EUR', 0.92).setRate('GBP', 0.79);

// Set multiple rates at once
converter.setRates({
  JPY: 149.50,
  CAD: 1.36,
  AUD: 1.53,
});

// Check and get rates
console.log(converter.hasRate('EUR')); // true
console.log(converter.getRate('EUR')); // 0.92
console.log(converter.getSupportedCurrencies()); // ['USD', 'EUR', 'GBP', ...]
```

## API Reference

### Constants

#### `CURRENCIES`

Array of currency objects with code, name, icon, and symbol.

```typescript
const CURRENCIES: readonly { code: string; name: string; icon: string; symbol: string }[];
```

**Example:**
```typescript
import { CURRENCIES } from '@talosjs/currencies';

console.log(CURRENCIES[0]); // { code: 'USD', name: 'US Dollar', icon: '...', symbol: '$' }
```

### Classes

#### `CurrencyConverter`

Class for managing exchange rates and converting between currencies.

**Constructor:**
```typescript
new CurrencyConverter(baseCurrency: CurrencyCodeType, rates?: ExchangeRatesType)
```

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getBaseCurrency()` | `CurrencyCodeType` | Get the base currency code |
| `setRate(code, rate)` | `this` | Set exchange rate for a currency |
| `setRates(rates)` | `this` | Set multiple exchange rates at once |
| `getRate(code)` | `number \| undefined` | Get exchange rate for a currency |
| `getRates()` | `ReadonlyMap` | Get all exchange rates |
| `hasRate(code)` | `boolean` | Check if a rate exists for a currency |
| `convert(amount, from, to)` | `ConversionResultType` | Convert an amount between currencies |
| `format(amount, code, decimals?)` | `string` | Format an amount with currency symbol |
| `convertAndFormat(amount, from, to, decimals?)` | `string` | Convert and format in one step |
| `getSupportedCurrencies()` | `CurrencyCodeType[]` | Get list of currencies with rates |

### Types

#### `CurrencyCodeType`

Union type of all valid ISO 4217 currency codes.

```typescript
type CurrencyCodeType = 'USD' | 'EUR' | 'GBP' | 'JPY' | /* ... */ ;
```

#### `CurrencyNameType`

Union type of all currency names.

```typescript
type CurrencyNameType = 'US Dollar' | 'Euro' | 'British Pound Sterling' | /* ... */ ;
```

#### `CurrencySymbolType`

Union type of all currency symbols.

```typescript
type CurrencySymbolType = '$' | '...' | '...' | /* ... */ ;
```

#### `CurrencyIconType`

Union type of all currency flag icons.

#### `ExchangeRatesType`

```typescript
type ExchangeRatesType = Partial<Record<CurrencyCodeType, number>>;
```

#### `ConversionResultType`

```typescript
type ConversionResultType = {
  from: CurrencyCodeType;
  to: CurrencyCodeType;
  amount: number;
  result: number;
  rate: number;
};
```

### Interfaces

#### `ICurrency`

Interface for currency entities extending the base interface.

```typescript
interface ICurrency extends IBase {
  code: string;
  name: string;
  icon?: string;
  symbol: string;
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team

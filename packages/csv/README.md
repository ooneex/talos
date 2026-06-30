# @talosjs/csv

A lightweight, type-safe CSV file loader and parser for TypeScript applications. Built on Bun's streaming API, it provides memory-efficient, generator-based iteration over CSV rows with support for multiple separators, row filtering, and format conversion to JSON and YAML.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![Deno](https://img.shields.io/badge/Deno-Compatible-blue?style=flat-square&logo=deno)
![Node.js](https://img.shields.io/badge/Node.js-Compatible-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Streaming Parser** - Memory-efficient processing of large CSV files using async generators

✅ **Multiple Separators** - Supports comma, semicolon, colon, pipe, and tab delimiters

✅ **Quoted Fields** - Proper handling of quoted values containing separators and escaped quotes

✅ **Row Filtering** - Regex-based ignore patterns to filter out unwanted rows

✅ **Format Conversion** - Export CSV data to JSON or YAML files

✅ **Type-Safe** - Full TypeScript generics support with proper type definitions

## Installation

```bash
bun add @talosjs/csv
```

## Usage

### Basic Usage

```typescript
import { Csv } from '@talosjs/csv';

type Color = { id: string; name: string; hex: string };

const csv = new Csv<Color>('colors.csv');

for await (const row of csv.load()) {
  console.log(row);
  // { id: "a1", name: "Blue", hex: "#3B82F6" }
}
```

### Custom Separator

```typescript
import { Csv } from '@talosjs/csv';

// Tab-separated file
const tsv = new Csv<Color>('data.tsv', '\t');

// Semicolon-separated file
const csv = new Csv<Color>('data.csv', ';');

for await (const row of tsv.load()) {
  console.log(row);
}
```

### Filtering Rows

```typescript
import { Csv } from '@talosjs/csv';

const csv = new Csv<Color>('colors.csv');

// Skip rows where name starts with "B"
for await (const row of csv.load({ ignore: { name: /^B/ } })) {
  console.log(row);
}

// Multiple ignore patterns (rows matching ANY pattern are skipped)
for await (const row of csv.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
  console.log(row);
}
```

### Export to JSON

```typescript
import { Csv } from '@talosjs/csv';

const csv = new Csv<Color>('colors.csv');

// Convert entire CSV to JSON array
await csv.toJson({ path: 'output.json' });

// With filtering
await csv.toJson({
  path: 'filtered.json',
  ignore: { name: /^Test/ },
});
```

### Export to YAML

```typescript
import { Csv } from '@talosjs/csv';

const csv = new Csv<Color>('colors.csv');

// Convert entire CSV to YAML
await csv.toYaml({ path: 'output.yml' });

// With filtering
await csv.toYaml({
  path: 'filtered.yml',
  ignore: { name: /inactive/ },
});
```

### Error Handling

```typescript
import { Csv, CsvException } from '@talosjs/csv';

try {
  const csv = new Csv<Color>('missing.csv');
  for await (const row of csv.load()) {
    console.log(row);
  }
} catch (error) {
  if (error instanceof CsvException) {
    console.error(error.key);     // "FILE_NOT_FOUND" or "READ_FAILED"
    console.error(error.message);
    console.error(error.data);    // { path: "missing.csv" }
  }
}
```

## API Reference

### Classes

#### `Csv<T>`

Main class for loading, parsing, and converting CSV files.

**Constructor:**
```typescript
new Csv<T>(path: string, separator?: CsvSeparatorType)
```

**Parameters:**
- `path` - Path to the CSV file
- `separator` - Field delimiter (default: `","`)

**Methods:**

##### `getPath(): string`

Returns the file path provided in the constructor.

##### `load(options?: CsvLoadOptionsType<T>): AsyncGenerator<T>`

Streams the CSV file and yields each row as a typed object. The first non-empty line is treated as headers; subsequent lines are parsed as data rows.

**Parameters:**
- `options.ignore` - Optional regex patterns to filter rows

**Returns:** An async generator yielding objects of type `T`

##### `toJson(options: CsvToJsonOptionsType<T>): Promise<void>`

Converts the CSV file to a JSON array and writes it to the specified path.

**Parameters:**
- `options.path` - Output file path
- `options.ignore` - Optional regex patterns to filter rows

##### `toYaml(options: CsvToYamlOptionsType<T>): Promise<void>`

Converts the CSV file to YAML format and writes it to the specified path.

**Parameters:**
- `options.path` - Output file path
- `options.ignore` - Optional regex patterns to filter rows

---

#### `CsvException`

Custom exception class for CSV-related errors. Extends `Exception` from `@talosjs/exception`.

**Constructor:**
```typescript
new CsvException(message: string, key: string, data?: Record<string, unknown>)
```

**Error Codes:**
- `FILE_NOT_FOUND` - CSV file does not exist
- `READ_FAILED` - Stream reading failed

**Properties:**
- `message` - Error description
- `key` - Error code
- `status` - HTTP status code (always `500`)
- `data` - Frozen metadata object
- `date` - Creation timestamp
- `stackToJson()` - Convert stack trace to JSON array

### Types

#### `CsvSeparatorType`

```typescript
type CsvSeparatorType = "," | ";" | ":" | "|" | "\t";
```

#### `CsvIgnoreType<T>`

```typescript
type CsvIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };
```

Maps field names to regex patterns. Rows matching any pattern are filtered out.

#### `CsvLoadOptionsType<T>`

```typescript
type CsvLoadOptionsType<T = unknown> = {
  ignore?: CsvIgnoreType<T>;
};
```

#### `CsvToJsonOptionsType<T>`

```typescript
type CsvToJsonOptionsType<T = unknown> = {
  path: string;
  ignore?: CsvIgnoreType<T>;
};
```

#### `CsvToYamlOptionsType<T>`

```typescript
type CsvToYamlOptionsType<T = unknown> = {
  path: string;
  ignore?: CsvIgnoreType<T>;
};
```

### Interfaces

#### `ICsv<T>`

```typescript
interface ICsv<T = unknown> {
  getPath: () => string;
  load: (options?: CsvLoadOptionsType<T>) => AsyncGenerator<T>;
  toJson: (options: CsvToJsonOptionsType<T>) => Promise<void>;
  toYaml: (options: CsvToYamlOptionsType<T>) => Promise<void>;
}
```

## Advanced Usage

### Processing Large Files

The streaming architecture means you can process files of any size without loading everything into memory:

```typescript
import { Csv } from '@talosjs/csv';

type LogEntry = { timestamp: string; level: string; message: string };

const csv = new Csv<LogEntry>('large-access-log.csv');

let errorCount = 0;
for await (const entry of csv.load()) {
  if (entry.level === 'ERROR') {
    errorCount++;
  }
}
console.log(`Found ${errorCount} errors`);
```

### Chaining with Ignore Patterns

```typescript
import { Csv } from '@talosjs/csv';

type Product = { id: string; name: string; category: string; status: string };

const csv = new Csv<Product>('products.csv');

// Export only active electronics to JSON
await csv.toJson({
  path: 'active-electronics.json',
  ignore: {
    status: /^inactive$/i,
    category: /^(?!electronics$)/i,
  },
});
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

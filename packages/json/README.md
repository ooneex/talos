# @talosjs/json

A lightweight, type-safe JSON file loader and parser for TypeScript applications. Built on Bun's streaming API, it provides memory-efficient, generator-based iteration over JSON arrays with support for row filtering and format conversion to YAML and CSV.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![Deno](https://img.shields.io/badge/Deno-Compatible-blue?style=flat-square&logo=deno)
![Node.js](https://img.shields.io/badge/Node.js-Compatible-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Streaming Parser** - Memory-efficient processing of large JSON files using async generators

✅ **Smart Parsing** - Character-by-character parsing with bracket depth tracking for reliable object extraction

✅ **Item Filtering** - Regex-based ignore patterns to filter out unwanted items

✅ **YAML Export** - Convert JSON data to YAML format with proper escaping

✅ **CSV Export** - Convert JSON data to CSV with configurable separators and RFC 4180 quoting

✅ **Type-Safe** - Full TypeScript generics support with proper type definitions

## Installation

```bash
bun add @talosjs/json
```

## Usage

### Basic Usage

```typescript
import { Json } from '@talosjs/json';

type Color = { id: string; name: string; hex: string };

const json = new Json<Color>('colors.json');

for await (const item of json.load()) {
  console.log(item);
  // { id: "a1", name: "Blue", hex: "#3B82F6" }
}
```

### Filtering Items

```typescript
import { Json } from '@talosjs/json';

const json = new Json<Color>('colors.json');

// Skip items where name starts with "B"
for await (const item of json.load({ ignore: { name: /^B/ } })) {
  console.log(item);
}

// Multiple ignore patterns (items matching ANY pattern are skipped)
for await (const item of json.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
  console.log(item);
}
```

### Export to YAML

```typescript
import { Json } from '@talosjs/json';

const json = new Json<Color>('colors.json');

// Convert entire JSON to YAML
await json.toYaml({ path: 'output.yml' });

// With filtering
await json.toYaml({
  path: 'filtered.yml',
  ignore: { name: /^Test/ },
});
```

### Export to CSV

```typescript
import { Json } from '@talosjs/json';

const json = new Json<Color>('colors.json');

// Convert JSON to CSV with specific headers and separator
await json.toCsv({
  path: 'output.csv',
  headers: ['id', 'name', 'hex'],
  separator: ',',
});

// With tab separator and filtering
await json.toCsv({
  path: 'filtered.tsv',
  headers: ['name', 'hex'],
  separator: '\t',
  ignore: { name: /^Test/ },
});
```

### Error Handling

```typescript
import { Json, JsonException } from '@talosjs/json';

try {
  const json = new Json<Color>('missing.json');
  for await (const item of json.load()) {
    console.log(item);
  }
} catch (error) {
  if (error instanceof JsonException) {
    console.error(error.key);     // "FILE_NOT_FOUND", "PARSE_FAILED", or "READ_FAILED"
    console.error(error.message);
    console.error(error.data);    // { path: "missing.json" }
  }
}
```

## API Reference

### Classes

#### `Json<T>`

Main class for loading, parsing, and converting JSON files.

**Constructor:**
```typescript
new Json<T>(path: string)
```

**Parameters:**
- `path` - Path to the JSON file

**Methods:**

##### `getPath(): string`

Returns the file path provided in the constructor.

##### `load(options?: JsonLoadOptionsType<T>): AsyncGenerator<T>`

Streams the JSON file and yields each item as a typed object. Uses character-by-character parsing with bracket depth tracking to identify complete JSON objects within arrays.

**Parameters:**
- `options.ignore` - Optional regex patterns to filter items

**Returns:** An async generator yielding objects of type `T`

##### `toYaml(options: JsonToYamlOptionsType<T>): Promise<void>`

Converts the JSON file to YAML format and writes it to the specified path. Values containing special YAML characters are automatically quoted and escaped.

**Parameters:**
- `options.path` - Output file path
- `options.ignore` - Optional regex patterns to filter items

##### `toCsv(options: JsonToCsvOptionsType<T>): Promise<void>`

Converts the JSON file to CSV format and writes it to the specified path. Values containing separators, quotes, or newlines are automatically quoted per RFC 4180.

**Parameters:**
- `options.path` - Output file path
- `options.headers` - Column headers to include in the CSV
- `options.separator` - Field delimiter character
- `options.ignore` - Optional regex patterns to filter items

---

#### `JsonException`

Custom exception class for JSON-related errors. Extends `Exception` from `@talosjs/exception`.

**Constructor:**
```typescript
new JsonException(message: string, key: string, data?: Record<string, unknown>)
```

**Error Codes:**
- `FILE_NOT_FOUND` - JSON file does not exist
- `PARSE_FAILED` - JSON content is malformed
- `READ_FAILED` - Stream reading failed

**Properties:**
- `message` - Error description
- `key` - Error code
- `status` - HTTP status code (always `500`)
- `data` - Frozen metadata object
- `date` - Creation timestamp
- `stackToJson()` - Convert stack trace to JSON array

### Types

#### `JsonCsvSeparatorType`

```typescript
type JsonCsvSeparatorType = "," | ";" | ":" | "|" | "\t";
```

#### `JsonIgnoreType<T>`

```typescript
type JsonIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };
```

Maps field names to regex patterns. Items matching any pattern are filtered out.

#### `JsonLoadOptionsType<T>`

```typescript
type JsonLoadOptionsType<T = unknown> = {
  ignore?: JsonIgnoreType<T>;
};
```

#### `JsonToYamlOptionsType<T>`

```typescript
type JsonToYamlOptionsType<T = unknown> = {
  path: string;
  ignore?: JsonIgnoreType<T>;
};
```

#### `JsonToCsvOptionsType<T>`

```typescript
type JsonToCsvOptionsType<T = unknown> = {
  path: string;
  headers: Array<keyof T & string>;
  separator: JsonCsvSeparatorType;
  ignore?: JsonIgnoreType<T>;
};
```

### Interfaces

#### `IJson<T>`

```typescript
interface IJson<T = unknown> {
  getPath: () => string;
  load: (options?: JsonLoadOptionsType<T>) => AsyncGenerator<T>;
  toYaml: (options: JsonToYamlOptionsType<T>) => Promise<void>;
  toCsv: (options: JsonToCsvOptionsType<T>) => Promise<void>;
}
```

## Advanced Usage

### Processing Large Files

The streaming architecture means you can process files of any size without loading everything into memory:

```typescript
import { Json } from '@talosjs/json';

type LogEntry = { timestamp: string; level: string; message: string };

const json = new Json<LogEntry>('large-log.json');

let errorCount = 0;
for await (const entry of json.load()) {
  if (entry.level === 'ERROR') {
    errorCount++;
  }
}
console.log(`Found ${errorCount} errors`);
```

### Selective CSV Export

```typescript
import { Json } from '@talosjs/json';

type User = { id: string; name: string; email: string; role: string };

const json = new Json<User>('users.json');

// Export only name and email columns, excluding admins
await json.toCsv({
  path: 'contacts.csv',
  headers: ['name', 'email'],
  separator: ',',
  ignore: { role: /^admin$/i },
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

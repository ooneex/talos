# @talosjs/yml

A lightweight, type-safe YAML file loader and parser for TypeScript applications. Built on Bun's streaming API and native YAML support, it provides memory-efficient, generator-based iteration over YAML documents with support for multiple formats, item filtering, and conversion to JSON and CSV.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![Deno](https://img.shields.io/badge/Deno-Compatible-blue?style=flat-square&logo=deno)
![Node.js](https://img.shields.io/badge/Node.js-Compatible-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Streaming Parser** - Memory-efficient processing of large YAML files using async generators

✅ **Multi-Format Support** - Handles both array format (`- item`) and multi-document format (`---` separated)

✅ **Auto-Detection** - Automatically detects YAML format (array vs document) from file content

✅ **Item Filtering** - Regex-based ignore patterns to filter out unwanted items

✅ **JSON Export** - Convert YAML data to JSON array files

✅ **CSV Export** - Convert YAML data to CSV with configurable separators and RFC 4180 quoting

✅ **Type-Safe** - Full TypeScript generics support with proper type definitions

## Installation

```bash
bun add @talosjs/yml
```

## Usage

### Basic Usage

```typescript
import { Yaml } from '@talosjs/yml';

type Color = { id: string; name: string; hex: string };

const yaml = new Yaml<Color>('colors.yml');

for await (const item of yaml.load()) {
  console.log(item);
  // { id: "a1", name: "Blue", hex: "#3B82F6" }
}
```

### Array Format

The parser handles YAML array files where items are separated by blank lines:

```yaml
- id: a1
  name: Blue
  hex: "#3B82F6"

- id: a2
  name: Red
  hex: "#EF4444"
```

### Multi-Document Format

It also handles multi-document YAML files separated by `---`:

```yaml
id: a1
name: Blue
hex: "#3B82F6"
---
id: a2
name: Red
hex: "#EF4444"
```

### Filtering Items

```typescript
import { Yaml } from '@talosjs/yml';

const yaml = new Yaml<Color>('colors.yml');

// Skip items where name starts with "B"
for await (const item of yaml.load({ ignore: { name: /^B/ } })) {
  console.log(item);
}

// Multiple ignore patterns (items matching ANY pattern are skipped)
for await (const item of yaml.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
  console.log(item);
}
```

### Export to JSON

```typescript
import { Yaml } from '@talosjs/yml';

const yaml = new Yaml<Color>('colors.yml');

// Convert entire YAML to JSON array
await yaml.toJson({ path: 'output.json' });

// With filtering
await yaml.toJson({
  path: 'filtered.json',
  ignore: { name: /^Test/ },
});
```

### Export to CSV

```typescript
import { Yaml } from '@talosjs/yml';

const yaml = new Yaml<Color>('colors.yml');

// Convert YAML to CSV with specific headers and separator
await yaml.toCsv({
  path: 'output.csv',
  headers: ['id', 'name', 'hex'],
  separator: ',',
});

// With tab separator and filtering
await yaml.toCsv({
  path: 'filtered.tsv',
  headers: ['name', 'hex'],
  separator: '\t',
  ignore: { name: /^Test/ },
});
```

### Error Handling

```typescript
import { Yaml, YamlException } from '@talosjs/yml';

try {
  const yaml = new Yaml<Color>('missing.yml');
  for await (const item of yaml.load()) {
    console.log(item);
  }
} catch (error) {
  if (error instanceof YamlException) {
    console.error(error.key);     // "FILE_NOT_FOUND", "PARSE_FAILED", or "READ_FAILED"
    console.error(error.message);
    console.error(error.data);    // { path: "missing.yml" }
  }
}
```

## API Reference

### Classes

#### `Yaml<T>`

Main class for loading, parsing, and converting YAML files.

**Constructor:**
```typescript
new Yaml<T>(path: string)
```

**Parameters:**
- `path` - Path to the YAML file

**Methods:**

##### `getPath(): string`

Returns the file path provided in the constructor.

##### `load(options?: YamlLoadOptionsType<T>): AsyncGenerator<T>`

Streams the YAML file and yields each item as a typed object. Automatically detects whether the file uses array format (`- `) or multi-document format (`---`) and parses accordingly.

**Parameters:**
- `options.ignore` - Optional regex patterns to filter items

**Returns:** An async generator yielding objects of type `T`

##### `toJson(options: YamlToJsonOptionsType<T>): Promise<void>`

Converts the YAML file to a JSON array and writes it to the specified path.

**Parameters:**
- `options.path` - Output file path
- `options.ignore` - Optional regex patterns to filter items

##### `toCsv(options: YamlToCsvOptionsType<T>): Promise<void>`

Converts the YAML file to CSV format and writes it to the specified path. Values containing separators, quotes, or newlines are automatically quoted per RFC 4180.

**Parameters:**
- `options.path` - Output file path
- `options.headers` - Column headers to include in the CSV
- `options.separator` - Field delimiter character
- `options.ignore` - Optional regex patterns to filter items

---

#### `YamlException`

Custom exception class for YAML-related errors. Extends `Exception` from `@talosjs/exception`.

**Constructor:**
```typescript
new YamlException(message: string, key: string, data?: Record<string, unknown>)
```

**Error Codes:**
- `FILE_NOT_FOUND` - YAML file does not exist
- `PARSE_FAILED` - YAML content is malformed
- `READ_FAILED` - Stream reading failed

**Properties:**
- `message` - Error description
- `key` - Error code
- `status` - HTTP status code (always `500`)
- `data` - Frozen metadata object
- `date` - Creation timestamp
- `stackToJson()` - Convert stack trace to JSON array

### Types

#### `YamlCsvSeparatorType`

```typescript
type YamlCsvSeparatorType = "," | ";" | ":" | "|" | "\t";
```

#### `YamlIgnoreType<T>`

```typescript
type YamlIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };
```

Maps field names to regex patterns. Items matching any pattern are filtered out.

#### `YamlLoadOptionsType<T>`

```typescript
type YamlLoadOptionsType<T = unknown> = {
  ignore?: YamlIgnoreType<T>;
};
```

#### `YamlToJsonOptionsType<T>`

```typescript
type YamlToJsonOptionsType<T = unknown> = {
  path: string;
  ignore?: YamlIgnoreType<T>;
};
```

#### `YamlToCsvOptionsType<T>`

```typescript
type YamlToCsvOptionsType<T = unknown> = {
  path: string;
  headers: Array<keyof T & string>;
  separator: YamlCsvSeparatorType;
  ignore?: YamlIgnoreType<T>;
};
```

### Interfaces

#### `IYaml<T>`

```typescript
interface IYaml<T = unknown> {
  getPath: () => string;
  load: (options?: YamlLoadOptionsType<T>) => AsyncGenerator<T>;
  toJson: (options: YamlToJsonOptionsType<T>) => Promise<void>;
  toCsv: (options: YamlToCsvOptionsType<T>) => Promise<void>;
}
```

## Advanced Usage

### Processing Large Files

The streaming architecture means you can process files of any size without loading everything into memory:

```typescript
import { Yaml } from '@talosjs/yml';

type LogEntry = { timestamp: string; level: string; message: string };

const yaml = new Yaml<LogEntry>('large-log.yml');

let errorCount = 0;
for await (const entry of yaml.load()) {
  if (entry.level === 'ERROR') {
    errorCount++;
  }
}
console.log(`Found ${errorCount} errors`);
```

### Selective CSV Export

```typescript
import { Yaml } from '@talosjs/yml';

type User = { id: string; name: string; email: string; role: string };

const yaml = new Yaml<User>('users.yml');

// Export only name and email columns, excluding admins
await yaml.toCsv({
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

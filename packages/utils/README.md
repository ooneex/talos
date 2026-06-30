# @talosjs/utils

General-purpose utility functions including unique ID generation with nanoid, type guards, and common helper methods.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **ID Generation** - Generate unique IDs using nanoid with configurable length

✅ **String Case Conversion** - Convert between camelCase, kebab-case, snake_case, and PascalCase

✅ **String Utilities** - `trim`, `splitToWords`, `capitalizeWord` for common string operations

✅ **Value Parsing** - `parseString` to convert string values to boolean, number, or string types

✅ **Time Formatting** - `secondsToHMS`, `secondsToMS`, and `millisecondsToHMS` for duration display

✅ **Number Formatting** - `formatRelativeNumber` for human-readable numbers with K, M, B suffixes

✅ **Data Conversion** - `dataURLtoFile` to convert data URLs to File objects

✅ **Environment Variables** - `parseEnvVars` to parse .env file content into key-value pairs

✅ **Async Utilities** - `sleep` function for async/await workflows

✅ **Zero Config** - Simple, pure functions with no configuration needed

## Installation

```bash
bun add @talosjs/utils
```

## Usage

### Unique ID Generation

```typescript
import { random } from '@talosjs/utils';

// Generate a unique ID (default length: 21)
const id = random();
console.log(id); // "V1StGXR8_Z5jdHi6B-myT"

// Generate with custom length
const shortId = random(10);
console.log(shortId); // "V1StGXR8_Z"
```

### String Case Conversion

```typescript
import {
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toPascalCase,
  capitalizeWord
} from '@talosjs/utils';

// Convert to camelCase
toCamelCase('hello world');        // "helloWorld"
toCamelCase('hello-world');        // "helloWorld"
toCamelCase('hello_world');        // "helloWorld"

// Convert to kebab-case
toKebabCase('helloWorld');         // "hello-world"
toKebabCase('HelloWorld');         // "hello-world"
toKebabCase('hello_world');        // "hello-world"

// Convert to snake_case
toSnakeCase('helloWorld');         // "hello_world"
toSnakeCase('HelloWorld');         // "hello_world"
toSnakeCase('hello-world');        // "hello_world"

// Convert to PascalCase
toPascalCase('hello world');       // "HelloWorld"
toPascalCase('hello-world');       // "HelloWorld"
toPascalCase('hello_world');       // "HelloWorld"

// Capitalize first letter
capitalizeWord('hello');           // "Hello"
capitalizeWord('hello world');     // "Hello world"
```

### Time Formatting

```typescript
import {
  secondsToHMS,
  secondsToMS,
  millisecondsToHMS
} from '@talosjs/utils';

// Seconds to Hours:Minutes:Seconds
secondsToHMS(3661);     // "1:01:01"
secondsToHMS(125);      // "0:02:05"

// Seconds to Minutes:Seconds
secondsToMS(125);       // "2:05"
secondsToMS(65);        // "1:05"

// Milliseconds to Hours:Minutes:Seconds
millisecondsToHMS(3661000);  // "1:01:01"
millisecondsToHMS(125000);   // "0:02:05"
```

### Number Formatting

```typescript
import { formatRelativeNumber } from '@talosjs/utils';

// Format large numbers with suffixes
formatRelativeNumber(1000);        // "1K"
formatRelativeNumber(1500);        // "1.5K"
formatRelativeNumber(1000000);     // "1M"
formatRelativeNumber(1500000);     // "1.5M"
formatRelativeNumber(1000000000);  // "1B"
formatRelativeNumber(999);         // "999"
```

### Async Sleep

```typescript
import { sleep } from '@talosjs/utils';

async function example() {
  console.log('Starting...');
  
  // Wait for 2 seconds
  await sleep(2000);
  
  console.log('2 seconds later...');
}
```

### String Utilities

```typescript
import { trim, splitToWords, parseString } from '@talosjs/utils';

// Trim whitespace and normalize
trim('  hello   world  ');  // "hello world"

// Split string into words
splitToWords('helloWorld');    // ["hello", "World"]
splitToWords('hello-world');   // ["hello", "world"]
splitToWords('hello_world');   // ["hello", "world"]

// Parse string values
parseString('true');    // true (boolean)
parseString('false');   // false (boolean)
parseString('123');     // 123 (number)
parseString('hello');   // "hello" (string)
```

### Data URL Conversion

```typescript
import { dataURLtoFile } from '@talosjs/utils';

// Convert a data URL to a File object
const dataUrl = 'data:image/png;base64,iVBORw0KGgo...';
const file = dataURLtoFile(dataUrl, 'image.png');

console.log(file.name); // "image.png"
console.log(file.type); // "image/png"
```

### Environment Variable Parsing

```typescript
import { parseEnvVars } from '@talosjs/utils';

// Parse environment variable content
const envContent = `
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=secret-key-123
DEBUG=true
PORT=3000
`;

const vars = parseEnvVars(envContent);
// {
//   DATABASE_URL: 'postgresql://localhost:5432/mydb',
//   API_KEY: 'secret-key-123',
//   DEBUG: 'true',
//   PORT: '3000'
// }
```

## API Reference

### Functions

#### `random(size?: number): string`

Generates a unique ID using nanoid.

**Parameters:**
- `size` - Optional length of the ID (default: 21)

**Returns:** A unique string ID

**Example:**
```typescript
const id = random();      // "V1StGXR8_Z5jdHi6B-myT"
const short = random(8);  // "V1StGXR8"
```

---

#### `toCamelCase(str: string): string`

Converts a string to camelCase.

**Parameters:**
- `str` - The input string

**Returns:** camelCase formatted string

---

#### `toKebabCase(str: string): string`

Converts a string to kebab-case.

**Parameters:**
- `str` - The input string

**Returns:** kebab-case formatted string

---

#### `toSnakeCase(str: string): string`

Converts a string to snake_case.

**Parameters:**
- `str` - The input string

**Returns:** snake_case formatted string

---

#### `toPascalCase(str: string): string`

Converts a string to PascalCase.

**Parameters:**
- `str` - The input string

**Returns:** PascalCase formatted string

---

#### `capitalizeWord(str: string): string`

Capitalizes the first letter of a string.

**Parameters:**
- `str` - The input string

**Returns:** String with first letter capitalized

---

#### `splitToWords(str: string): string[]`

Splits a string into an array of words.

**Parameters:**
- `str` - The input string (camelCase, kebab-case, snake_case, or space-separated)

**Returns:** Array of words

---

#### `trim(str: string): string`

Trims whitespace and normalizes internal spacing.

**Parameters:**
- `str` - The input string

**Returns:** Trimmed and normalized string

---

#### `secondsToHMS(seconds: number): string`

Converts seconds to H:MM:SS format.

**Parameters:**
- `seconds` - Number of seconds

**Returns:** Formatted time string

---

#### `secondsToMS(seconds: number): string`

Converts seconds to M:SS format.

**Parameters:**
- `seconds` - Number of seconds

**Returns:** Formatted time string

---

#### `millisecondsToHMS(milliseconds: number): string`

Converts milliseconds to H:MM:SS format.

**Parameters:**
- `milliseconds` - Number of milliseconds

**Returns:** Formatted time string

---

#### `formatRelativeNumber(num: number): string`

Formats a number with K, M, or B suffix.

**Parameters:**
- `num` - The number to format

**Returns:** Formatted number string with suffix

---

#### `sleep(ms: number): Promise<void>`

Pauses execution for the specified duration.

**Parameters:**
- `ms` - Duration in milliseconds

**Returns:** Promise that resolves after the duration

---

#### `dataURLtoFile(dataUrl: string, filename: string): File`

Converts a data URL to a File object.

**Parameters:**
- `dataUrl` - The data URL string
- `filename` - Name for the resulting file

**Returns:** File object

---

#### `parseString(value: string): string | number | boolean`

Parses a string value to its appropriate type.

**Parameters:**
- `value` - The string to parse

**Returns:** Parsed value (boolean, number, or string)

---

#### `parseEnvVars(content: string): Record<string, string>`

Parses environment variable content.

**Parameters:**
- `content` - Raw environment variable content

**Returns:** Object with key-value pairs

## Advanced Usage

### Building File Names

```typescript
import { toKebabCase, random } from '@talosjs/utils';

function generateFileName(title: string, extension: string): string {
  const slug = toKebabCase(title);
  const uniqueId = random(8);
  return `${slug}-${uniqueId}.${extension}`;
}

const fileName = generateFileName('My Awesome Photo', 'jpg');
// "my-awesome-photo-V1StGXR8.jpg"
```

### Formatting Display Values

```typescript
import { formatRelativeNumber, capitalizeWord } from '@talosjs/utils';

interface SocialStats {
  followers: number;
  likes: number;
  views: number;
}

function formatStats(stats: SocialStats): Record<string, string> {
  return {
    followers: formatRelativeNumber(stats.followers),
    likes: formatRelativeNumber(stats.likes),
    views: formatRelativeNumber(stats.views)
  };
}

const stats = formatStats({
  followers: 15600,
  likes: 1200000,
  views: 45000
});
// { followers: "15.6K", likes: "1.2M", views: "45K" }
```

### Video Duration Display

```typescript
import { secondsToHMS, secondsToMS } from '@talosjs/utils';

function formatDuration(seconds: number): string {
  // Use H:MM:SS for videos over an hour, otherwise M:SS
  return seconds >= 3600 
    ? secondsToHMS(seconds)
    : secondsToMS(seconds);
}

console.log(formatDuration(90));    // "1:30"
console.log(formatDuration(3700));  // "1:01:40"
```

### Retry with Delay

```typescript
import { sleep } from '@talosjs/utils';

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}
```

### API Route Slug Generation

```typescript
import { toKebabCase } from '@talosjs/utils';

function generateApiSlug(resourceName: string, action: string): string {
  const resource = toKebabCase(resourceName);
  const actionSlug = toKebabCase(action);
  return `/api/${resource}/${actionSlug}`;
}

generateApiSlug('UserProfile', 'getById');  // "/api/user-profile/get-by-id"
generateApiSlug('BlogPost', 'create');       // "/api/blog-post/create"
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

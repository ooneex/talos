# @talosjs/types

Shared TypeScript type definitions, interfaces, and utility types used as foundational building blocks across the Talos ecosystem.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **HTTP Method Types** - `HttpMethodType` union and `HTTP_METHODS` constant array (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)

✅ **Base Entity Interface** - `IBase` interface with id, timestamps, locking, blocking, and locale fields

✅ **Scalar Types** - `ScalarType` union for primitive values (boolean, number, bigint, string)

✅ **Filter Result Type** - `FilterResultType<T>` generic for paginated results with total, page, and limit

✅ **Encoding Types** - `EncodingType` and `CharsetType` for HTTP content encoding and character set definitions

✅ **Zero Runtime** - Pure type definitions with no runtime overhead

## Installation

```bash
bun add @talosjs/types
```

## Usage

### HTTP Method Types

```typescript
import { HTTP_METHODS, type HttpMethodType } from '@talosjs/types';

// Type-safe HTTP method
const method: HttpMethodType = 'GET';

// Use the constant array
HTTP_METHODS.forEach(m => console.log(m));
// GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD

// Function with HTTP method parameter
function makeRequest(url: string, method: HttpMethodType): void {
  fetch(url, { method });
}

makeRequest('/api/users', 'POST'); // ✓ Valid
makeRequest('/api/users', 'INVALID'); // ✗ Type error
```

### Base Entity Interface

```typescript
import type { IBase } from '@talosjs/types';

interface User extends IBase {
  email: string;
  name: string;
}

const user: User = {
  id: 'user-123',
  email: 'john@example.com',
  name: 'John Doe',
  createdAt: new Date(),
  updatedAt: new Date(),
  isPublic: true
};
```

### Stat Interface for Social Features

```typescript
import type { IStat } from '@talosjs/types';

interface Post extends IStat {
  title: string;
  content: string;
}

const post: Post = {
  id: 'post-456',
  title: 'Hello World',
  content: 'My first post',
  commentsCount: 42,
  likesCount: 156,
  viewsCount: 1200,
  sharesCount: 23,
  // ... other IStat fields
};
```

### Scalar Types

```typescript
import type { ScalarType } from '@talosjs/types';

// ScalarType accepts boolean, number, bigint, or string
const values: ScalarType[] = [
  true,
  42,
  BigInt(9007199254740991),
  'hello'
];

// Useful for generic key-value data
function logData(data: Record<string, ScalarType>): void {
  for (const [key, value] of Object.entries(data)) {
    console.log(`${key}: ${value}`);
  }
}

logData({
  name: 'John',
  age: 30,
  active: true
});
```

### Filter Result Type

```typescript
import type { FilterResultType } from '@talosjs/types';

interface Product {
  id: string;
  name: string;
  price: number;
}

// Paginated response type
type ProductListResponse = FilterResultType<Product>;

const response: ProductListResponse = {
  resources: [
    { id: '1', name: 'Widget', price: 9.99 },
    { id: '2', name: 'Gadget', price: 19.99 }
  ],
  total: 50,
  totalPages: 5,
  page: 1,
  limit: 10
};
```

## API Reference

### Constants

#### `HTTP_METHODS`

Array of valid HTTP method strings.

```typescript
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] as const;
```

### Types

#### `HttpMethodType`

Union type of valid HTTP methods.

```typescript
type HttpMethodType = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
```

#### `ScalarType`

Union type for primitive scalar values.

```typescript
type ScalarType = boolean | number | bigint | string;
```

#### `EncodingType`

Valid HTTP content encoding types.

```typescript
type EncodingType = "deflate" | "gzip" | "compress" | "br" | "identity" | "*";
```

#### `CharsetType`

Common character set encodings.

```typescript
type CharsetType = "ISO-8859-1" | "7-BIT" | "UTF-8" | "UTF-16" | "US-ASCII";
```

#### `FilterResultType<T>`

Generic type for paginated results.

```typescript
type FilterResultType<T> = {
  resources: T[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
};
```

### Interfaces

#### `IBase`

Base interface for all entities with common fields.

```typescript
interface IBase {
  id: string;
  isLocked?: boolean;
  lockedAt?: Date;
  isBlocked?: boolean;
  blockedAt?: Date;
  blockReason?: string;
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  language?: LocaleType;
}
```

#### `IStat`

Extended interface for entities with social/engagement statistics.

```typescript
interface IStat extends IBase {
  commentsCount: number;
  likesCount: number;
  dislikesCount: number;
  sharesCount: number;
  viewsCount: number;
  downloadsCount: number;
  savesCount: number;
  bookmarksCount: number;
  repostsCount: number;
  impressionsCount: number;
  clicksCount: number;
  engagementRate: number;
  reach: number;
  followersCount: number;
  followingCount: number;
  blockedCount: number;
  reportsCount: number;
}
```

## Advanced Usage

### Building Custom Entity Types

```typescript
import type { IBase, ScalarType } from '@talosjs/types';

// Extend IBase for your domain entities
interface Article extends IBase {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  publishedAt?: Date;
  tags: string[];
}

// Use ScalarType for metadata
interface ArticleMeta {
  [key: string]: ScalarType;
}
```

### Type-Safe API Responses

```typescript
import type { FilterResultType, HttpMethodType } from '@talosjs/types';

interface ApiResponse<T> {
  data: T;
  success: boolean;
}

interface PaginatedApiResponse<T> extends ApiResponse<FilterResultType<T>> {}

// Type-safe API client
async function fetchPaginated<T>(
  endpoint: string,
  method: HttpMethodType = 'GET'
): Promise<PaginatedApiResponse<T>> {
  const response = await fetch(endpoint, { method });
  return response.json();
}
```

### Generic Repository Interface

```typescript
import type { IBase, FilterResultType } from '@talosjs/types';

interface IRepository<T extends IBase> {
  findById(id: string): Promise<T | null>;
  findAll(page: number, limit: number): Promise<FilterResultType<T>>;
  create(data: Omit<T, keyof IBase>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team

# @talosjs/url

URL parsing and manipulation library with query string handling, path normalization, and route parameter extraction for web applications.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Complete URL Parsing** - Parse and extract all URL components (protocol, hostname, port, path, queries, fragment)

✅ **Immutable & Mutable** - Choose between `ReadonlyUrl` for parsing or `Url` for manipulation with chaining

✅ **Smart Query Parsing** - Automatically converts query parameters to appropriate types (string, number, boolean)

✅ **Subdomain Detection** - Intelligently separates subdomains from domains, handles IP addresses and localhost

✅ **Pagination Helpers** - Built-in `getLang`, `getPage`, `getLimit`, `getOrder`, and `getOrderBy` query extractors

✅ **Path Normalization** - Clean path handling with proper trailing slash management

✅ **Type-Safe** - Full TypeScript support with `IReadonlyUrl` and `IUrl` interfaces

✅ **Cross-Platform** - Works in Browser, Node.js, Bun, and Deno

## Installation

```bash
bun add @talosjs/url
```

## Usage

### Basic URL Parsing

```typescript
import { ReadonlyUrl } from '@talosjs/url';

const url = new ReadonlyUrl('https://blog.example.com:3000/posts/123?page=2&sort=desc#comments');

// Get URL components
console.log(url.getProtocol()); // "https"
console.log(url.getHostname()); // "blog.example.com"
console.log(url.getSubdomain()); // "blog"
console.log(url.getDomain()); // "example.com"
console.log(url.getPort()); // 3000
console.log(url.getPath()); // "/posts/123"
console.log(url.getQueries()); // { page: 2, sort: "desc" }
console.log(url.getFragment()); // "comments"
console.log(url.getOrigin()); // "https://blog.example.com:3000"
```

### URL Manipulation

```typescript
import { Url } from '@talosjs/url';

const url = new Url('https://example.com');

// Chain modifications
url.setProtocol('http')
   .setHostname('api.example.com')
   .setPort(8080)
   .setPath('/v1/users')
   .addQuery('limit', 10)
   .addQuery('offset', 0)
   .setFragment('results');

console.log(url.toString()); // "http://api.example.com:8080/v1/users?limit=10&offset=0#results"
```

### Advanced Usage

```typescript
import { Url, ReadonlyUrl } from '@talosjs/url';

// Parse complex URLs with multiple subdomains
const complexUrl = new ReadonlyUrl('https://dev.api.example.com/v2/users?active=true&count=100');
console.log(complexUrl.getSubdomain()); // "dev.api"
console.log(complexUrl.getDomain()); // "example.com"
console.log(complexUrl.getQueries()); // { active: true, count: 100 }

// Build URLs programmatically
const apiUrl = new Url('https://api.example.com')
  .setPath('/users')
  .setQueries({
    page: 1,
    limit: 20,
    active: true,
    search: 'john'
  });

console.log(apiUrl.toString()); // "https://api.example.com/users?page=1&limit=20&active=true&search=john"

// Handle localhost and IP addresses
const localUrl = new ReadonlyUrl('http://localhost:3000/dashboard');
console.log(localUrl.getSubdomain()); // null
console.log(localUrl.getDomain()); // "localhost"

const ipUrl = new ReadonlyUrl('http://192.168.1.1:8080/status');
console.log(ipUrl.getSubdomain()); // null
console.log(ipUrl.getDomain()); // "192.168.1.1"
```

## API Reference

### `ReadonlyUrl` Class

Immutable URL parsing class that provides read-only access to URL components.

#### Constructor

##### `new ReadonlyUrl(url: string | URL)`
Creates a new ReadonlyUrl instance from a URL string or URL object.

**Parameters:**
- `url` - The URL string or URL object to parse

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com/path?query=value#fragment');
const urlFromObject = new ReadonlyUrl(new URL('https://example.com'));
```

#### Methods

##### `getNative(): URL`
Returns the native JavaScript URL object.

**Returns:** Native URL object

**Example:**
```typescript
const nativeUrl = url.getNative();
console.log(nativeUrl instanceof URL); // true
```

##### `getProtocol(): string`
Gets the protocol (without the colon).

**Returns:** Protocol string (e.g., "https", "http")

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com');
console.log(url.getProtocol()); // "https"
```

##### `getSubdomain(): string | null`
Gets the subdomain portion of the hostname.

**Returns:** Subdomain string or null if no subdomain

**Example:**
```typescript
const url = new ReadonlyUrl('https://blog.example.com');
console.log(url.getSubdomain()); // "blog"

const url2 = new ReadonlyUrl('https://example.com');
console.log(url2.getSubdomain()); // null
```

##### `getDomain(): string`
Gets the domain portion of the hostname.

**Returns:** Domain string

**Example:**
```typescript
const url = new ReadonlyUrl('https://blog.example.com');
console.log(url.getDomain()); // "example.com"
```

##### `getHostname(): string`
Gets the full hostname.

**Returns:** Hostname string

**Example:**
```typescript
const url = new ReadonlyUrl('https://blog.example.com:3000');
console.log(url.getHostname()); // "blog.example.com"
```

##### `getPort(): number`
Gets the port number.

**Returns:** Port number (defaults to 80 if not specified)

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com:3000');
console.log(url.getPort()); // 3000

const url2 = new ReadonlyUrl('https://example.com');
console.log(url2.getPort()); // 80
```

##### `getPath(): string`
Gets the URL path.

**Returns:** Path string (always starts with "/")

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com/users/123');
console.log(url.getPath()); // "/users/123"
```

##### `getQueries(): Record<string, ScalarType>`
Gets all query parameters as an object with automatically parsed types.

**Returns:** Object with query parameters (values can be string, number, or boolean)

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com?page=1&active=true&name=john');
console.log(url.getQueries()); // { page: 1, active: true, name: "john" }
```

##### `getFragment(): string`
Gets the URL fragment (without the hash).

**Returns:** Fragment string

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com#section');
console.log(url.getFragment()); // "section"
```

##### `getBase(): string`
Gets the base URL (protocol + hostname + port).

**Returns:** Base URL string

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com:3000/path?query=value');
console.log(url.getBase()); // "https://example.com:3000"
```

##### `getOrigin(): string`
Gets the origin (protocol + hostname + port).

**Returns:** Origin string

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com:3000/path');
console.log(url.getOrigin()); // "https://example.com:3000"
```

##### `toString(): string`
Converts the URL to its string representation.

**Returns:** Full URL string

**Example:**
```typescript
const url = new ReadonlyUrl('https://example.com/path?query=value#fragment');
console.log(url.toString()); // "https://example.com/path?query=value#fragment"
```

### `Url` Class

Mutable URL class that extends ReadonlyUrl with modification capabilities.

#### Constructor

##### `new Url(url: string | URL)`
Creates a new Url instance from a URL string or URL object.

**Parameters:**
- `url` - The URL string or URL object to parse

**Example:**
```typescript
const url = new Url('https://example.com');
```

#### Modification Methods

##### `setProtocol(protocol: string): Url`
Sets the protocol.

**Parameters:**
- `protocol` - Protocol string (with or without colon)

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.setProtocol('http');
console.log(url.getProtocol()); // "http"
```

##### `setHostname(hostname: string): Url`
Sets the hostname and automatically parses subdomain/domain.

**Parameters:**
- `hostname` - Hostname string

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.setHostname('api.example.com');
console.log(url.getSubdomain()); // "api"
console.log(url.getDomain()); // "example.com"
```

##### `setPort(port: number): Url`
Sets the port number.

**Parameters:**
- `port` - Port number

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.setPort(8080);
console.log(url.getPort()); // 8080
```

##### `setPath(path: string): Url`
Sets the URL path.

**Parameters:**
- `path` - Path string (leading/trailing slashes are normalized)

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.setPath('/api/users');
console.log(url.getPath()); // "/api/users"
```

##### `addQuery(key: string, value: ScalarType): Url`
Adds or updates a query parameter.

**Parameters:**
- `key` - Query parameter name
- `value` - Query parameter value (string, number, or boolean)

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.addQuery('page', 1)
   .addQuery('active', true)
   .addQuery('search', 'john');
console.log(url.getQueries()); // { page: 1, active: true, search: "john" }
```

##### `setQueries(queries: Record<string, ScalarType>): Url`
Sets all query parameters, replacing existing ones.

**Parameters:**
- `queries` - Object with query parameters

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com?old=value');
url.setQueries({ page: 1, limit: 10 });
console.log(url.getQueries()); // { page: 1, limit: 10 }
```

##### `removeQuery(key: string): Url`
Removes a specific query parameter.

**Parameters:**
- `key` - Query parameter name to remove

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com?page=1&limit=10');
url.removeQuery('page');
console.log(url.getQueries()); // { limit: 10 }
```

##### `clearQueries(): Url`
Removes all query parameters.

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com?page=1&limit=10');
url.clearQueries();
console.log(url.getQueries()); // {}
```

##### `setFragment(fragment: string): Url`
Sets the URL fragment.

**Parameters:**
- `fragment` - Fragment string (with or without hash)

**Returns:** Self for chaining

**Example:**
```typescript
const url = new Url('https://example.com');
url.setFragment('section');
console.log(url.getFragment()); // "section"
console.log(url.toString()); // "https://example.com#section"
```

### Types

#### `IReadonlyUrl`
Interface defining all available read-only URL methods.

#### `IUrl`
Interface defining all available URL manipulation methods (extends IReadonlyUrl).

#### `ScalarType`
Type representing valid query parameter values (string, number, or boolean).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

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

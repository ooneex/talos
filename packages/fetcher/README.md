# @talosjs/fetcher

Lightweight HTTP client with typed headers, response parsing, and configurable request/response handling for external API integration. This package provides a fluent API for HTTP operations with built-in support for authentication tokens, content types, request cancellation, and file uploads.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Simple API** - Intuitive methods for GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS

✅ **Typed Responses** - Generic response types with `ResponseDataType<T>` for full TypeScript support

✅ **Authentication** - Built-in support for Bearer and Basic authentication tokens

✅ **File Uploads** - Easy file upload with automatic FormData handling

✅ **Request Cancellation** - Abort in-flight requests with AbortController integration

✅ **Header Management** - Typed header manipulation via `@talosjs/http-header`

✅ **Base URL Support** - Configure base URL for cleaner API calls

✅ **Cloneable** - Create independent copies of configured fetcher instances

## Installation

```bash
bun add @talosjs/fetcher
```

## Usage

### Basic GET Request

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

const response = await fetcher.get<{ users: User[] }>('/users');

if (response.success) {
  console.log(response.data.users);
} else {
  console.error(response.message);
}
```

### POST Request with Data

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

const response = await fetcher.post<{ user: User }>('/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

if (response.success) {
  console.log('Created user:', response.data.user);
}
```

### With Authentication

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

// Set Bearer token
fetcher.setBearerToken('your-jwt-token');

const response = await fetcher.get<{ profile: Profile }>('/me');

// Clear token when done
fetcher.clearBearerToken();
```

### File Upload

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

const file = document.querySelector('input[type="file"]').files[0];

const response = await fetcher.upload<{ url: string }>(
  '/upload',
  file,
  'avatar' // form field name
);

if (response.success) {
  console.log('Uploaded to:', response.data.url);
}
```

### Request Cancellation

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

// Start a request
const promise = fetcher.get('/slow-endpoint');

// Cancel it
fetcher.abort();

// Handle the cancellation
try {
  await promise;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

## API Reference

### Classes

#### `Fetcher`

HTTP client class for making fetch requests.

**Constructor:**
```typescript
new Fetcher(baseURL?: string)
```

**Parameters:**
- `baseURL` - Optional base URL to prepend to all request paths

**Properties:**

##### `header: Header`

Access to the underlying Header instance for advanced header manipulation.

**Methods:**

##### `get<T>(path: string): Promise<ResponseDataType<T>>`

Performs a GET request.

**Parameters:**
- `path` - Request path (appended to base URL if set)

**Returns:** Promise resolving to typed response data

**Example:**
```typescript
const response = await fetcher.get<{ items: Item[] }>('/items');
```

##### `post<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>`

Performs a POST request with optional body data.

**Parameters:**
- `path` - Request path
- `data` - Optional request body (automatically JSON-stringified for objects)

**Returns:** Promise resolving to typed response data

**Example:**
```typescript
const response = await fetcher.post<{ id: string }>('/items', { name: 'New Item' });
```

##### `put<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>`

Performs a PUT request with optional body data.

##### `patch<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>`

Performs a PATCH request with optional body data.

##### `delete<T>(path: string): Promise<ResponseDataType<T>>`

Performs a DELETE request.

##### `head<T>(path: string): Promise<ResponseDataType<T>>`

Performs a HEAD request.

##### `options<T>(path: string): Promise<ResponseDataType<T>>`

Performs an OPTIONS request.

##### `request<T>(method: HttpMethodType, path: string, data?: unknown): Promise<ResponseDataType<T>>`

Performs a custom HTTP request.

**Parameters:**
- `method` - HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- `path` - Request path
- `data` - Optional request body

**Example:**
```typescript
const response = await fetcher.request<{ result: string }>('POST', '/custom', { foo: 'bar' });
```

##### `upload<T>(path: string, file: File | Blob, name?: string): Promise<ResponseDataType<T>>`

Uploads a file using multipart/form-data.

**Parameters:**
- `path` - Upload endpoint path
- `file` - File or Blob to upload
- `name` - Form field name (default: 'file')

**Returns:** Promise resolving to typed response data

**Example:**
```typescript
const response = await fetcher.upload<{ url: string }>('/upload', file, 'document');
```

##### `setBearerToken(token: string): this`

Sets the Authorization header with a Bearer token.

**Parameters:**
- `token` - JWT or other bearer token

**Returns:** The fetcher instance for chaining

##### `setBasicToken(token: string): this`

Sets the Authorization header with Basic authentication.

**Parameters:**
- `token` - Base64-encoded credentials

**Returns:** The fetcher instance for chaining

##### `clearBearerToken(): this`

Removes the Authorization header.

**Returns:** The fetcher instance for chaining

##### `clearBasicToken(): this`

Removes the Authorization header.

**Returns:** The fetcher instance for chaining

##### `setContentType(contentType: MimeType): this`

Sets the Content-Type header.

**Parameters:**
- `contentType` - MIME type string

**Returns:** The fetcher instance for chaining

##### `setLang(lang: string): this`

Sets the Accept-Language or custom language header.

**Parameters:**
- `lang` - Language code (e.g., 'en', 'fr')

**Returns:** The fetcher instance for chaining

##### `abort(): this`

Cancels any in-flight requests and resets the AbortController.

**Returns:** The fetcher instance for chaining

##### `clone(): Fetcher`

Creates a new Fetcher instance with the same base URL.

**Returns:** New Fetcher instance

### Interfaces

#### `IFetcher`

```typescript
interface IFetcher {
  readonly header: Header;
  
  setBearerToken(token: string): IFetcher;
  setBasicToken(token: string): IFetcher;
  clearBearerToken(): IFetcher;
  clearBasicToken(): IFetcher;
  setContentType(contentType: MimeType): IFetcher;
  setLang(lang: string): IFetcher;
  abort(): IFetcher;
  clone(): IFetcher;
  
  get<T>(path: string): Promise<ResponseDataType<T>>;
  post<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>;
  put<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>;
  patch<T>(path: string, data?: unknown): Promise<ResponseDataType<T>>;
  delete<T>(path: string): Promise<ResponseDataType<T>>;
  head<T>(path: string): Promise<ResponseDataType<T>>;
  options<T>(path: string): Promise<ResponseDataType<T>>;
  request<T>(method: HttpMethodType, path: string, data?: unknown): Promise<ResponseDataType<T>>;
  upload<T>(path: string, file: File | Blob, name?: string): Promise<ResponseDataType<T>>;
}
```

## Advanced Usage

### Creating API Client Classes

```typescript
import { Fetcher } from '@talosjs/fetcher';

class UserApi {
  private fetcher: Fetcher;

  constructor(baseUrl: string, token?: string) {
    this.fetcher = new Fetcher(baseUrl);
    if (token) {
      this.fetcher.setBearerToken(token);
    }
  }

  public async getUsers() {
    return this.fetcher.get<{ users: User[] }>('/users');
  }

  public async createUser(data: CreateUserDto) {
    return this.fetcher.post<{ user: User }>('/users', data);
  }

  public async updateUser(id: string, data: UpdateUserDto) {
    return this.fetcher.patch<{ user: User }>(`/users/${id}`, data);
  }

  public async deleteUser(id: string) {
    return this.fetcher.delete<{ success: boolean }>(`/users/${id}`);
  }
}
```

### Request Interceptors with Header Manipulation

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

// Add custom headers
fetcher.header.set('X-Request-ID', generateRequestId());
fetcher.header.set('X-Client-Version', '1.0.0');

const response = await fetcher.get('/endpoint');
```

### Error Handling

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

const response = await fetcher.get<{ data: string }>('/resource');

if (response.success) {
  // Handle successful response
  console.log(response.data);
} else if (response.isClientError) {
  // Handle 4xx errors
  console.error('Client error:', response.message);
} else if (response.isServerError) {
  // Handle 5xx errors
  console.error('Server error:', response.message);
} else if (response.isNotFound) {
  // Handle 404
  console.error('Resource not found');
} else if (response.isUnauthorized) {
  // Handle 401
  console.error('Unauthorized - please login');
}
```

### Chaining Configuration

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com')
  .setBearerToken('your-token')
  .setLang('en')
  .setContentType('application/json');

const response = await fetcher.post('/data', { key: 'value' });
```

### Cloning for Different Contexts

```typescript
import { Fetcher } from '@talosjs/fetcher';

const baseFetcher = new Fetcher('https://api.example.com');

// Create authenticated clone
const authFetcher = baseFetcher.clone();
authFetcher.setBearerToken('user-token');

// Create admin clone
const adminFetcher = baseFetcher.clone();
adminFetcher.setBearerToken('admin-token');

// Use independently
await authFetcher.get('/user/profile');
await adminFetcher.get('/admin/dashboard');
```

### Uploading Multiple Files

```typescript
import { Fetcher } from '@talosjs/fetcher';

const fetcher = new Fetcher('https://api.example.com');

async function uploadFiles(files: File[]) {
  const results = [];
  
  for (const file of files) {
    const response = await fetcher.upload<{ url: string }>(
      '/upload',
      file,
      'file'
    );
    results.push(response);
  }
  
  return results;
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

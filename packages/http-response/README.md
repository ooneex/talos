# @talosjs/http-response

HTTP response builder with fluent API for setting status codes, headers, cookies, and streaming or buffered content delivery.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Fluent API** - Chain methods like json(), exception(), notFound(), and redirect() for easy response building

✅ **Type-Safe** - Full TypeScript support with generic data types

✅ **JSON Responses** - Create structured JSON responses with success/error flags, status, and metadata

✅ **Exception Handling** - Built-in error response formatting with configurable status codes and data

✅ **Not Found Responses** - Dedicated notFound() method for 404 responses

✅ **HTTP Redirects** - Support for all redirect status codes with Location header management

✅ **Header Management** - Integrated HTTP header handling via @talosjs/http-header

✅ **Web Standards** - Returns native Web API Response objects

✅ **Environment-Aware** - Includes application environment info in response data

✅ **Socket Support** - Built-in done flag for WebSocket response completion tracking

## Installation

```bash
bun add @talosjs/http-response
```

## Usage

### Basic JSON Responses

```typescript
import { HttpResponse } from '@talosjs/http-response';
import { HttpStatus } from '@talosjs/http-status';

const response = new HttpResponse();

// Simple JSON response
const webResponse = response
  .json({ message: 'Hello, World!' })
  .get();

console.log(webResponse.status); // 200
console.log(await webResponse.json()); // { message: 'Hello, World!' }

// JSON response with custom status
response
  .json({ user: { id: 1, name: 'John' } }, Status.Code.Created)
  .get();
```

### Exception Handling

```typescript
import { HttpResponse } from '@talosjs/http-response';
import { HttpStatus } from '@talosjs/http-status';

const response = new HttpResponse();

// Basic exception
const errorResponse = response
  .exception('Something went wrong')
  .get();

console.log(errorResponse.status); // 500
console.log(await errorResponse.json());
// {
//   error: true,
//   message: 'Something went wrong',
//   status: 500,
//   data: null
// }

// Exception with custom status and data
response
  .exception('Validation failed', {
    status: Status.Code.BadRequest,
    data: { field: 'email', reason: 'invalid format' }
  })
  .get();
```

### Not Found Responses

```typescript
import { HttpResponse } from '@talosjs/http-response';

const response = new HttpResponse();

// Basic not found
response
  .notFound('User not found')
  .get();

// Not found with custom data
response
  .notFound('Resource not found', {
    data: { resourceId: 123, type: 'user' }
  })
  .get();
```

### HTTP Redirects

```typescript
import { HttpResponse } from '@talosjs/http-response';
import { HttpStatus } from '@talosjs/http-status';

const response = new HttpResponse();

// Basic redirect (302 Found)
response
  .redirect('https://example.com')
  .get();

// Permanent redirect
response
  .redirect('https://example.com/new-path', Status.Code.MovedPermanently)
  .get();

// Redirect with URL object
const url = new URL('https://api.example.com/v2/users');
response
  .redirect(url, Status.Code.SeeOther)
  .get();
```

### Working with Headers

```typescript
import { HttpResponse } from '@talosjs/http-response';
import { Header } from '@talosjs/http-header';

// With custom headers
const customHeader = new Header();
customHeader.set('X-API-Version', '2.0');
customHeader.set('X-Request-ID', '12345');

const response = new HttpResponse(customHeader);

response
  .json({ data: 'response with custom headers' })
  .get();

// Headers are preserved across response types
response.header.set('X-Custom', 'value');
response.json({ message: 'test' });
// X-Custom header is still present
```

### TypeScript Generics

```typescript
import { HttpResponse } from '@talosjs/http-response';

// Define your data type
interface User extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
}

interface ApiError extends Record<string, unknown> {
  code: string;
  field?: string;
}

// Type-safe responses
const userResponse = new HttpResponse<User>();
const userData: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com'
};

userResponse.json(userData); // Type-safe!

// Type-safe error responses
const errorResponse = new HttpResponse<ApiError>();
errorResponse.exception('Validation error', {
  data: { code: 'INVALID_EMAIL', field: 'email' }
});
```

### Advanced Usage

```typescript
import { HttpResponse } from '@talosjs/http-response';
import { HttpStatus } from '@talosjs/http-status';

const response = new HttpResponse();

// Complex API response
const apiResponse = {
  data: {
    users: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ]
  },
  meta: {
    page: 1,
    limit: 10,
    total: 25
  }
};

response
  .json(apiResponse, Status.Code.OK)
  .get();

// Error handling with detailed information
response
  .exception('Database connection failed', {
    status: Status.Code.ServiceUnavailable,
    data: {
      service: 'database',
      retryAfter: 30,
      errorCode: 'DB_CONN_TIMEOUT'
    }
  })
  .get();

// State transitions
response.json({ initial: 'data' });
// Later change to redirect
response.redirect('/login');
// Headers and state are properly managed
```

## API Reference

### `HttpResponse<DataType>` Class

The main class for building HTTP responses with optional generic type parameter.

#### Constructor

##### `new HttpResponse<DataType>(header?: IHeader)`

Creates a new HTTP response instance.

**Parameters:**
- `header` (optional) - Custom header instance. If not provided, creates a default header.

**Example:**
```typescript
// With default header
const response = new HttpResponse();

// With custom header
const customHeader = new Header();
const response = new HttpResponse(customHeader);
```

#### Properties

##### `readonly header: IHeader`

Access to the HTTP header instance for setting custom headers.

**Example:**
```typescript
response.header.set('X-Custom-Header', 'value');
response.header.setCache('public', 3600);
```

#### Methods

##### `json(data: DataType, status?: StatusCodeType): IResponse<DataType>`

Creates a JSON response with the provided data.

**Parameters:**
- `data` - The data to serialize as JSON
- `status` (optional) - HTTP status code (
defaults to 200)

**Returns:** The response instance for method chaining

**Example:**
```typescript
response.json({ message: 'Success' });
response.json({ user: userData }, Status.Code.Created);
```

##### `exception(message: string, config?: object): IResponse<DataType>`

Creates an error response with structured error information.

**Parameters:**
- `message` - Error message
- `config` (optional) - Configuration object
  - `data` - Additional error data
  - `status` - HTTP status code (defaults to 500)

**Returns:** The response instance for method chaining

**Example:**
```typescript
response.exception('Internal server error');
response.exception('Validation failed', {
  status: Status.Code.BadRequest,
  data: { field: 'email' }
});
```

##### `notFound(message: string, config?: object): IResponse<DataType>`

Creates a not found error response.

**Parameters:**
- `message` - Not found message
- `config` (optional) - Configuration object
  - `data` - Additional error data
  - `status` - HTTP status code (defaults to 404)

**Returns:** The response instance for method chaining

**Example:**
```typescript
response.notFound('User not found');
response.notFound('Resource not found', {
  data: { resourceId: 123 }
});
```

##### `redirect(url: string | URL, status?: StatusCodeType): IResponse<DataType>`

Creates a redirect response.

**Parameters:**
- `url` - Destination URL (string or URL object)
- `status` (optional) - HTTP redirect status code (defaults to 302)

**Returns:** The response instance for method chaining

**Example:**
```typescript
response.redirect('https://example.com');
response.redirect('/dashboard', Status.Code.MovedPermanently);
response.redirect(new URL('https://api.example.com/v2'));
```

##### `get(): Response`

Builds and returns the final Web API Response object.

**Returns:** Standard Web API Response object

**Example:**
```typescript
const webResponse = response.json({ data: 'test' }).get();
// webResponse is a standard Response object
const data = await webResponse.json();
const status = webResponse.status;
const headers = webResponse.headers;
```

### Interfaces

#### `IResponse<DataType>`

Interface defining the response builder contract.

**Methods:**
- `json(data: DataType, status?: StatusCodeType): IResponse<DataType>`
- `exception(message: string, config?: object): IResponse<DataType>`
- `notFound(message: string, config?: object): IResponse<DataType>`
- `redirect(url: string | URL, status?: StatusCodeType): IResponse<DataType>`
- `get(): Response`

**Properties:**
- `readonly header: IHeader`

### Response Structure

#### JSON Response
```typescript
// Standard JSON response body is your provided data
{ message: 'Hello, World!' }
```

#### Exception Response
```typescript
{
  error: true,
  message: 'Error message',
  status: 500,
  data: null | YourDataType
}
```

#### Not Found Response
```typescript
{
  error: true,
  message: 'Resource not found',
  status: 404,
  data: null | YourDataType
}
```

#### Redirect Response
```typescript
// Empty body with Location header set
// Status: 302, 301, 303, etc.
// Headers: { Location: 'redirect-url' }
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { HttpResponse } from '@talosjs/http-response';
import { HttpStatus } from '@talosjs/http-status';

const app = express();

app.get('/api/users/:id', async (req, res) => {
  const response = new HttpResponse();

  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      const webResponse = response
        .notFound('User not found')
        .get();

      return res.status(webResponse.status).json(await webResponse.json());
    }

    const webResponse = response
      .json({ user })
      .get();

    res.status(webResponse.status).json(await webResponse.json());
  } catch (error) {
    const webResponse = response
      .exception('Failed to fetch user')
      .get();

    res.status(webResponse.status).json(await webResponse.json());
  }
});
```

### Hono Framework Integration

```typescript
import { Hono } from 'hono';
import { HttpResponse } from '@talosjs/http-response';

const app = new Hono();

app.get('/api/users', async (c) => {
  const response = new HttpResponse();

  try {
    const users = await getUsers();
    return response.json({ users }).get();
  } catch (error) {
    return response.exception('Failed to fetch users').get();
  }
});

app.post('/api/users', async (c) => {
  const response = new HttpResponse();

  try {
    const userData = await c.req.json();
    const user = await createUser(userData);
    return response.json({ user }, Status.Code.Created).get();
  } catch (error) {
    return response.exception('Failed to create user').get();
  }
});
```

### Bun Server Integration

```typescript
import { HttpResponse } from '@talosjs/http-response';

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const response = new HttpResponse();
    const url = new URL(req.url);

    if (url.pathname === '/redirect') {
      return response.redirect('https://example.com').get();
    }

    return response.notFound('Endpoint not found').get();
  }
});
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

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

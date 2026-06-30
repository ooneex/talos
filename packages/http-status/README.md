# @talosjs/http-status

Complete HTTP status code library with TypeScript enums covering 1xx-5xx ranges and helper utilities for status classification and messaging.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Complete Status Codes** - All standard HTTP status codes from 1xx to 5xx

✅ **Status Text** - Human-readable status text for all codes

✅ **Classification Methods** - Easily check if a status is informational, success, redirect, or error

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Zero Dependencies** - Lightweight with no external dependencies

✅ **Static Access** - Access codes and text via static properties

## Installation

```bash
bun add @talosjs/http-status
```

## Usage

### Accessing Status Codes

```typescript
import { HttpStatus } from '@talosjs/http-status';

// Access status codes
console.log(HttpStatus.Code.OK);                  // 200
console.log(HttpStatus.Code.Created);             // 201
console.log(HttpStatus.Code.BadRequest);          // 400
console.log(HttpStatus.Code.NotFound);            // 404
console.log(HttpStatus.Code.InternalServerError); // 500
```

### Accessing Status Text

```typescript
import { HttpStatus } from '@talosjs/http-status';

// Access status text by code
console.log(HttpStatus.Text[200]); // "OK"
console.log(HttpStatus.Text[201]); // "Created"
console.log(HttpStatus.Text[404]); // "Not Found"
console.log(HttpStatus.Text[500]); // "Internal Server Error"
```

### Checking Status Categories

```typescript
import { HttpStatus } from '@talosjs/http-status';

const status = new HttpStatus();

// Check if status is informational (1xx)
console.log(status.isInformational(100)); // true
console.log(status.isInformational(200)); // false

// Check if status is successful (2xx)
console.log(status.isSuccessful(200)); // true
console.log(status.isSuccessful(201)); // true
console.log(status.isSuccessful(404)); // false

// Check if status is redirect (3xx)
console.log(status.isRedirect(301)); // true
console.log(status.isRedirect(302)); // true
console.log(status.isRedirect(200)); // false

// Check if status is client error (4xx)
console.log(status.isClientError(400)); // true
console.log(status.isClientError(404)); // true
console.log(status.isClientError(500)); // false

// Check if status is server error (5xx)
console.log(status.isServerError(500)); // true
console.log(status.isServerError(503)); // true
console.log(status.isServerError(404)); // false

// Check if status is any error (4xx or 5xx)
console.log(status.isError(400)); // true
console.log(status.isError(500)); // true
console.log(status.isError(200)); // false
```

### Using in Response Handlers

```typescript
import { HttpStatus, type StatusCodeType } from '@talosjs/http-status';

function handleResponse(statusCode: StatusCodeType): string {
  const status = new HttpStatus();
  
  if (status.isSuccessful(statusCode)) {
    return 'Request completed successfully';
  }
  
  if (status.isClientError(statusCode)) {
    return `Client error: ${HttpStatus.Text[statusCode]}`;
  }
  
  if (status.isServerError(statusCode)) {
    return `Server error: ${HttpStatus.Text[statusCode]}`;
  }
  
  return 'Unknown status';
}

console.log(handleResponse(HttpStatus.Code.OK));        // "Request completed successfully"
console.log(handleResponse(HttpStatus.Code.NotFound)); // "Client error: Not Found"
```

## API Reference

### Classes

#### `HttpStatus`

Main class providing HTTP status code utilities.

**Static Properties:**

##### `HttpStatus.Code`

Object containing all HTTP status codes as named constants.

| Property | Value | Description |
|----------|-------|-------------|
| `Continue` | 100 | Continue |
| `SwitchingProtocols` | 101 | Switching Protocols |
| `Processing` | 102 | Processing |
| `EarlyHints` | 103 | Early Hints |
| `OK` | 200 | OK |
| `Created` | 201 | Created |
| `Accepted` | 202 | Accepted |
| `NonAuthoritativeInfo` | 203 | Non-Authoritative Information |
| `NoContent` | 204 | No Content |
| `ResetContent` | 205 | Reset Content |
| `PartialContent` | 206 | Partial Content |
| `MultiStatus` | 207 | Multi-Status |
| `AlreadyReported` | 208 | Already Reported |
| `IMUsed` | 226 | IM Used |
| `MultipleChoices` | 300 | Multiple Choices |
| `MovedPermanently` | 301 | Moved Permanently |
| `Found` | 302 | Found |
| `SeeOther` | 303 | See Other |
| `NotModified` | 304 | Not Modified |
| `UseProxy` | 305 | Use Proxy |
| `TemporaryRedirect` | 307 | Temporary Redirect |
| `PermanentRedirect` | 308 | Permanent Redirect |
| `BadRequest` | 400 | Bad Request |
| `Unauthorized` | 401 | Unauthorized |
| `PaymentRequired` | 402 | Payment Required |
| `Forbidden` | 403 | Forbidden |
| `NotFound` | 404 | Not Found |
| `MethodNotAllowed` | 405 | Method Not Allowed |
| `NotAcceptable` | 406 | Not Acceptable |
| `ProxyAuthRequired` | 407 | Proxy Authentication Required |
| `RequestTimeout` | 408 | Request Timeout |
| `Conflict` | 409 | Conflict |
| `Gone` | 410 | Gone |
| `LengthRequired` | 411 | Length Required |
| `PreconditionFailed` | 412 | Precondition Failed |
| `ContentTooLarge` | 413 | Content Too Large |
| `URITooLong` | 414 | URI Too Long |
| `UnsupportedMediaType` | 415 | Unsupported Media Type |
| `RangeNotSatisfiable` | 416 | Range Not Satisfiable |
| `ExpectationFailed` | 417 | Expectation Failed |
| `Teapot` | 418 | I'm a teapot |
| `MisdirectedRequest` | 421 | Misdirected Request |
| `UnprocessableEntity` | 422 | Unprocessable Entity |
| `Locked` | 423 | Locked |
| `FailedDependency` | 424 | Failed Dependency |
| `TooEarly` | 425 | Too Early |
| `UpgradeRequired` | 426 | Upgrade Required |
| `PreconditionRequired` | 428 | Precondition Required |
| `TooManyRequests` | 429 | Too Many Requests |
| `RequestHeaderFieldsTooLarge` | 431 | Request Header Fields Too Large |
| `UnavailableForLegalReasons` | 451 | Unavailable For Legal Reasons |
| `InternalServerError` | 500 | Internal Server Error |
| `NotImplemented` | 501 | Not Implemented |
| `BadGateway` | 502 | Bad Gateway |
| `ServiceUnavailable` | 503 | Service Unavailable |
| `GatewayTimeout` | 504 | Gateway Timeout |
| `HTTPVersionNotSupported` | 505 | HTTP Version Not Supported |
| `VariantAlsoNegotiates` | 506 | Variant Also Negotiates |
| `InsufficientStorage` | 507 | Insufficient Storage |
| `LoopDetected` | 508 | Loop Detected |
| `NotExtended` | 510 | Not Extended |
| `NetworkAuthenticationRequired` | 511 | Network Authentication Required |

##### `HttpStatus.Text`

Object mapping status codes to their human-readable text descriptions.

**Instance Methods:**

##### `isInformational(code: StatusCodeType): boolean`

Checks if the status code is informational (100-199).

##### `isSuccessful(code: StatusCodeType): boolean`

Checks if the status code is successful (200-299).

##### `isRedirect(code: StatusCodeType): boolean`

Checks if the status code is a redirect (300-399).

##### `isClientError(code: StatusCodeType): boolean`

Checks if the status code is a client error (400-499).

##### `isServerError(code: StatusCodeType): boolean`

Checks if the status code is a server error (500-599).

##### `isError(code: StatusCodeType): boolean`

Checks if the status code is any error (400-599).

### Types

#### `StatusCodeType`

Union type of all valid HTTP status code numbers.

```typescript
type StatusCodeType = 100 | 101 | 102 | 103 | 200 | 201 | ... | 511;
```

#### `StatusTextType`

Union type of all valid HTTP status text strings.

```typescript
type StatusTextType = "OK" | "Created" | "Not Found" | "Internal Server Error" | ...;
```

### Interfaces

#### `IHttpStatus`

```typescript
interface IHttpStatus {
  isInformational: (code: StatusCodeType) => boolean;
  isSuccessful: (code: StatusCodeType) => boolean;
  isRedirect: (code: StatusCodeType) => boolean;
  isClientError: (code: StatusCodeType) => boolean;
  isServerError: (code: StatusCodeType) => boolean;
  isError: (code: StatusCodeType) => boolean;
}
```

## Advanced Usage

### Building API Responses

```typescript
import { HttpStatus, type StatusCodeType } from '@talosjs/http-status';

interface ApiResponse<T> {
  success: boolean;
  status: StatusCodeType;
  statusText: string;
  data?: T;
  error?: string;
}

function createResponse<T>(
  code: StatusCodeType,
  data?: T,
  error?: string
): ApiResponse<T> {
  const status = new HttpStatus();
  
  return {
    success: status.isSuccessful(code),
    status: code,
    statusText: HttpStatus.Text[code],
    ...(data && { data }),
    ...(error && { error })
  };
}

// Success response
const successResponse = createResponse(HttpStatus.Code.OK, { user: { id: 1 } });
// { success: true, status: 200, statusText: "OK", data: { user: { id: 1 } } }

// Error response
const errorResponse = createResponse(HttpStatus.Code.NotFound, undefined, 'User not found');
// { success: false, status: 404, statusText: "Not Found", error: "User not found" }
```

### Integration with Talos Framework

```typescript
import { HttpStatus } from '@talosjs/http-status';
import { HttpResponse } from '@talosjs/http-response';
import type { IController, ContextType } from '@talosjs/controller';

class UserController implements IController {
  public async index(context: ContextType) {
    const user = await this.findUser(context.params.id);
    
    if (!user) {
      return context.response.json(
        { error: 'User not found' },
        HttpStatus.Code.NotFound
      );
    }
    
    return context.response.json(
      { user },
      HttpStatus.Code.OK
    );
  }
}
```

### Middleware Status Checking

```typescript
import { HttpStatus } from '@talosjs/http-status';

function logResponseStatus(statusCode: number): void {
  const status = new HttpStatus();
  const text = HttpStatus.Text[statusCode as keyof typeof HttpStatus.Text];
  
  if (status.isSuccessful(statusCode)) {
    console.log(`✅ Success: ${statusCode} ${text}`);
  } else if (status.isClientError(statusCode)) {
    console.warn(`⚠️ Client Error: ${statusCode} ${text}`);
  } else if (status.isServerError(statusCode)) {
    console.error(`❌ Server Error: ${statusCode} ${text}`);
  } else if (status.isRedirect(statusCode)) {
    console.info(`↪️ Redirect: ${statusCode} ${text}`);
  }
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

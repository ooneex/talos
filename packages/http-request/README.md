# @talosjs/http-request

HTTP request abstraction with URL parsing, query parameters, language detection, header management, and multipart file upload support.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **URL Parsing** - Automatic URL parsing with path, query parameters, and host extraction via @talosjs/url

✅ **HTTP Method Detection** - Reads and normalizes the HTTP method from the native Request object

✅ **Header Management** - Integrated HTTP header handling and user agent parsing via @talosjs/http-header

✅ **Query Parameters** - Automatic extraction of query string parameters into a typed record

✅ **Route Parameters** - Support for route parameters passed via configuration

✅ **Request Payload** - Access to parsed request body payload

✅ **File Uploads** - Multipart form data parsing with file extraction into IRequestFile instances

✅ **Language Detection** - Automatic locale detection from Accept-Language header, query params (lang/locale), or X-Custom-Lang header

✅ **Client IP** - Access to the client IP address

✅ **Type-Safe** - Full TypeScript support with generic config types for params, payload, and queries

## Installation

```bash
bun add @talosjs/http-request
```

## Usage

### Basic Request Handling

```typescript
import { HttpRequest } from '@talosjs/http-request';

const request = new HttpRequest(nativeRequest, {
  params: { id: '123' },
  payload: { name: 'John' },
  ip: '127.0.0.1',
});

console.log(request.path);       // "/users/123"
console.log(request.method);     // "GET"
console.log(request.host);       // "example.com"
console.log(request.ip);         // "127.0.0.1"
console.log(request.params);     // { id: "123" }
console.log(request.queries);    // Parsed query parameters
console.log(request.language);   // { code: "en", region: "US" }
```

### File Upload Handling

```typescript
import { HttpRequest } from '@talosjs/http-request';

const request = new HttpRequest(nativeRequest, {
  form: formData,
});

// Access uploaded files
for (const [key, file] of Object.entries(request.files)) {
  console.log(key, file);
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with love by the Talos team

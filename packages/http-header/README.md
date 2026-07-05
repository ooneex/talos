# @talosjs/http-header

HTTP header parser with user agent detection, browser fingerprinting, device identification, and content negotiation utilities.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Read/Write Header Management** - Full support via `Header` (read/write) and `ReadonlyHeader` (read-only) classes

✅ **User Agent Parsing** - Built-in user agent detection powered by ua-parser-js with browser, OS, device, and CPU info

✅ **Content Negotiation** - Easy MIME type, charset, language, and encoding management

✅ **Authentication Support** - Built-in methods for Basic Auth, Bearer tokens, and custom authorization

✅ **Cookie Management** - Comprehensive cookie parsing and setting with all options

✅ **CORS Support** - Easy Cross-Origin Resource Sharing header management

✅ **Security Headers** - Built-in support for common security headers (CSP, HSTS, XSS)

✅ **Caching Headers** - Cache control, ETags, and conditional request management

✅ **Client IP Detection** - Multiple methods to detect client IP addresses (X-Forwarded-For, X-Real-IP)

✅ **Request Type Detection** - Detect HTTPS, AJAX, and CORS requests

✅ **Method Chaining** - Fluent API for easy header manipulation

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Cross-Platform** - Works in Browser, Node.js, Bun, and Deno

## Installation

```bash
bun add @talosjs/http-header
```

## Usage

### Basic Header Operations

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Adding headers
header.add('Content-Type', 'application/json')
      .add('Accept', 'application/json')
      .set('Authorization', 'Bearer token123');

// Reading headers
const contentType = header.get('Content-Type'); // "application/json"
const hasAuth = header.has('Authorization'); // true

// Converting to JSON
const headerObj = header.toJson();
console.log(headerObj); // { "Content-Type": "application/json", ... }
```

### Content Type Management

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Setting content types with optional charset
header.contentType('application/json', 'UTF-8');

// Convenience methods
header.setJson('UTF-8')        // application/json; charset=UTF-8
      .setHtml('UTF-8')        // text/html; charset=UTF-8
      .setText('UTF-8')        // text/plain; charset=UTF-8
      .setForm('UTF-8')        // application/x-www-form-urlencoded; charset=UTF-8
      .setFormData()           // multipart/form-data
      .setBlobType();          // application/octet-stream

// Content negotiation
header.setAccept('application/json')
      .setLang('en-US')
      .setAcceptEncoding(['gzip', 'br', 'deflate']);
```

### Authentication Headers

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Basic authentication
header.setBasicAuth('dXNlcjpwYXNz'); // Sets "Authorization: Basic dXNlcjpwYXNz"

// Bearer token
header.setBearerToken('your-jwt-token'); // Sets "Authorization: Bearer your-jwt-token"

// Custom authorization
header.setAuthorization('Custom token123');

// Reading authentication (using ReadonlyHeader)
console.log(header.getBasicAuth()); // Returns token or null
console.log(header.getBearerToken()); // Returns token or null
console.log(header.getAuthorization()); // Returns full header or null
```

### Cookie Management

```typescript
import { Header, ReadonlyHeader } from '@talosjs/http-header';

const header = new Header();

// Setting cookies with options
header.setCookie('sessionId', 'abc123', {
  httpOnly: true,
  secure: true,
  maxAge: 3600,
  path: '/',
  domain: '.example.com',
  sameSite: 'Strict'
});

// Setting multiple cookies
header.setCookies([
  { name: 'user', value: 'john', options: { maxAge: 86400 } },
  { name: 'theme', value: 'dark', options: { path: '/app' } }
]);

// Reading cookies (from request headers)
const readonlyHeader = new ReadonlyHeader(requestHeaders);
const cookies = readonlyHeader.getCookies(); // { sessionId: 'abc123', user: 'john' }
const userCookie = readonlyHeader.getCookie('user'); // 'john'

// Removing cookies
header.removeCookie('sessionId', { path: '/', domain: '.example.com' });
```

### CORS Headers

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// CORS configuration
header.setAccessControlAllowOrigin('*')
      .setAccessControlAllowMethods(['GET', 'POST', 'PUT', 'DELETE'])
      .setAccessControlAllowHeaders(['Content-Type', 'Authorization'])
      .setAccessControlAllowCredentials(true);

// Reading CORS settings
console.log(header.getAccessControlAllowOrigin()); // '*'
console.log(header.getAccessControlAllowMethods()); // ['GET', 'POST', 'PUT', 'DELETE']
```

### Security Headers

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Security headers setup
header.setContentSecurityPolicy("default-src 'self'; script-src 'unsafe-inline'")
      .setStrictTransportSecurity(31536000, true, true) // 1 year, includeSubDomains, preload
      .setXContentTypeOptions('nosniff')
      .setXFrameOptions('DENY')
      .setXXSSProtection(true, 'block');

// Reading security headers
console.log(header.getContentSecurityPolicy());
console.log(header.getStrictTransportSecurity());
```

### Caching Headers

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Cache control
header.setCacheControl('public, max-age=3600')
      .setEtag('"abc123"')
      .setLastModified(new Date())
      .setIfModifiedSince(new Date(Date.now() - 86400000));

// Reading cache headers
console.log(header.getCacheControl()); // 'public, max-age=3600'
console.log(header.getEtag()); // '"abc123"'
console.log(header.getLastModified()); // Date object
```

### Request Information

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Request headers
header.setHost('api.example.com')
      .setUserAgent('MyApp/1.0')
      .setReferer('https://example.com/page')
      .setOrigin('https://example.com');

// Reading request info
console.log(header.getHost()); // 'api.example.com'
console.log(header.getUserAgent()); // Parsed user agent object
console.log(header.getReferer()); // 'https://example.com/page'
```

### Client IP Detection

```typescript
import { ReadonlyHeader } from '@talosjs/http-header';

const requestHeader = new ReadonlyHeader(incomingHeaders);

// Get client IP (tries X-Forwarded-For, then X-Real-IP)
const clientIp = requestHeader.getIp();

// Get all possible IPs
const allIps = requestHeader.getClientIps();

// Specific headers
const forwardedFor = requestHeader.getXForwardedFor();
const realIp = requestHeader.getXRealIP();
```

### User Agent Parsing

```typescript
import { ReadonlyHeader } from '@talosjs/http-header';

const header = new ReadonlyHeader(requestHeaders);

const userAgent = header.getUserAgent();
if (userAgent) {
  console.log(userAgent.browser.name);    // 'Chrome'
  console.log(userAgent.browser.version); // '91.0.4472.124'
  console.log(userAgent.os.name);         // 'Windows'
  console.log(userAgent.device.type);     // 'mobile'
}
```

### Method Chaining

```typescript
import { Header } from '@talosjs/http-header';

const header = new Header();

// Fluent API
header.setJson()
      .setBearerToken('token')
      .setCookie('session', 'abc123', { httpOnly: true })
      .setAccessControlAllowOrigin('*')
      .setCacheControl('no-cache');
```

### Working with Native Headers

```typescript
import { Header, ReadonlyHeader } from '@talosjs/http-header';

// From native Headers object
const nativeHeaders = new Headers();
nativeHeaders.set('Content-Type', 'application/json');

const header = new Header(nativeHeaders);

// Access native Headers instance
const native = header.native;

// Convert to plain object
const headerObject = header.toJson();

// Create readonly instance
const readonlyHeader = new ReadonlyHeader(nativeHeaders);
```

### Request Type Detection

```typescript
import { ReadonlyHeader } from '@talosjs/http-header';

const requestHeader = new ReadonlyHeader(incomingHeaders);

// Check request characteristics
const isSecure = requestHeader.isSecure();        // HTTPS check via X-Forwarded-Proto
const isAjax = requestHeader.isAjax();           // XMLHttpRequest check
const isCors = requestHeader.isCorsRequest();    // Has Origin header
```

## API Reference

### `Header` Class

The main class for creating and manipulating HTTP headers with full read/write capabilities.

#### Constructor

**`new Header(headers?: Headers)`**

Creates a new Header instance, optionally from existing Headers object.

**Parameters:**
- `headers` - Optional existing Headers object

**Example:**
```typescript
const header = new Header();
const headerFromExisting = new Header(existingHeaders);
```

#### Core Methods

**`add(name: HeaderFieldType, value: string): Header`**

Append header value (multiple values allowed).

**Example:**
```typescript
header.add('Accept', 'application/json')
      .add('Accept', 'text/html'); // Results in: "application/json, text/html"
```

**`set(name: HeaderFieldType, value: string): Header`**

Set header value (overwrites existing).

**Example:**
```typescript
header.set('Content-Type', 'application/json');
```

**`remove(name: HeaderFieldType): Header`**

Remove header completely.

**Example:**
```typescript
header.remove('Authorization');
```

**`get(name: HeaderFieldType): string | null`**

Get header value.

**Example:**
```typescript
const contentType = header.get('Content-Type'); // 'application/json' or null
```

**`has(name: HeaderFieldType): boolean`**

Check if header exists.

**Example:**
```typescript
const hasAuth = header.has('Authorization'); // true or false
```

#### Content Type Methods

**`contentType(type: MimeType, charset?: CharsetType): Header`**

Set content type with optional charset.

**Example:**
```typescript
header.contentType('application/json', 'UTF-8');
```

**`contentLength(length: number): Header`**

Set content length.

**Example:**
```typescript
header.contentLength(1024);
```

**`contentDisposition(value: string): Header`**

Set content disposition.

**Example:**
```typescript
header.contentDisposition('attachment; filename="file.pdf"');
```

#### Content Type Convenience Methods

**`setJson(charset?: CharsetType): Header`**

Set JSON content type.

**Example:**
```typescript
header.setJson('UTF-8'); // Sets "application/json; charset=UTF-8"
```

**`setHtml(charset?: CharsetType): Header`**

Set HTML content type.

**Example:**
```typescript
header.setHtml('UTF-8'); // Sets "text/html; charset=UTF-8"
```

**`setText(charset?: CharsetType): Header`**

Set plain text content type.

**Example:**
```typescript
header.setText('UTF-8'); // Sets "text/plain; charset=UTF-8"
```

**`setForm(charset?: CharsetType): Header`**

Set form URL encoded content type.

**Example:**
```typescript
header.setForm(); // Sets "application/x-www-form-urlencoded"
```

**`setFormData(charset?: CharsetType): Header`**

Set multipart form data content type.

**Example:**
```typescript
header.setFormData(); // Sets "multipart/form-data"
```

**`setBlobType(charset?: CharsetType): Header`**

Set binary content type.

**Example:**
```typescript
header.setBlobType(); // Sets "application/octet-stream"
```

#### Authentication Methods

**`setAuthorization(value: string): Header`**

Set authorization header.

**Example:**
```typescript
header.setAuthorization('Bearer token123');
```

**`setBasicAuth(token: string): Header`**

Set basic authentication.

**Example:**
```typescript
header.setBasicAuth('dXNlcjpwYXNzd29yZA==');
```

**`setBearerToken(token: string): Header`**

Set bearer token authentication.

**Example:**
```typescript
header.setBearerToken('your-jwt-token');
```

#### Cookie Methods

**`setCookie(name: string, value: string, options?: CookieOptions): Header`**

Set single cookie with options.

**Example:**
```typescript
header.setCookie('session', 'abc123', {
  httpOnly: true,
  secure: true,
  maxAge: 3600
});
```

**`setCookies(cookies: Array<{name: string, value: string, options?: CookieOptions}>): Header`**

Set multiple cookies.

**Example:**
```typescript
header.setCookies([
  { name: 'user', value: 'john', options: { maxAge: 86400 } },
  { name: 'theme', value: 'dark' }
]);
```

**`removeCookie(name: string, options?: {domain?: string, path?: string}): Header`**

Remove cookie by setting expiry in the past.

**Example:**
```typescript
header.removeCookie('session', { path: '/', domain: '.example.com' });
```

#### CORS Methods

**`setAccessControlAllowOrigin(origin: string): Header`**

Set allowed origins for CORS.

**Example:**
```typescript
header.setAccessControlAllowOrigin('*');
header.setAccessControlAllowOrigin('https://example.com');
```

**`setAccessControlAllowMethods(methods: MethodType[]): Header`**

Set allowed HTTP methods for CORS.

**Example:**
```typescript
header.setAccessControlAllowMethods(['GET', 'POST', 'PUT', 'DELETE']);
```

**`setAccessControlAllowHeaders(headers: string[]): Header`**

Set allowed headers for CORS.

**Example:**
```typescript
header.setAccessControlAllowHeaders(['Content-Type', 'Authorization']);
```

**`setAccessControlAllowCredentials(allow: boolean): Header`**

Set credentials policy for CORS.

**Example:**
```typescript
header.setAccessControlAllowCredentials(true);
```

#### Security Methods

**`setContentSecurityPolicy(policy: string): Header`**

Set Content Security Policy.

**Example:**
```typescript
header.setContentSecurityPolicy("default-src 'self'; script-src 'unsafe-inline'");
```

**`setStrictTransportSecurity(maxAge: number, includeSubDomains?: boolean, preload?: boolean): Header`**

Set HTTP Strict Transport Security.

**Example:**
```typescript
header.setStrictTransportSecurity(31536000, true, true); // 1 year, include subdomains, preload
```

**`setXContentTypeOptions(value?: string): Header`**

Set X-Content-Type-Options header.

**Example:**
```typescript
header.setXContentTypeOptions('nosniff');
```

**`setXFrameOptions(value: "DENY" | "SAMEORIGIN" | string): Header`**

Set X-Frame-Options header.

**Example:**
```typescript
header.setXFrameOptions('DENY');
```

**`setXXSSProtection(enabled?: boolean, mode?: string): Header`**

Set XSS protection header.

**Example:**
```typescript
header.setXXSSProtection(true, 'block');
```

#### Caching Methods

**`setCacheControl(value: string): Header`**

Set cache control header.

**Example:**
```typescript
header.setCacheControl('public, max-age=3600');
```

**`setEtag(value: string): Header`**

Set entity tag for caching.

**Example:**
```typescript
header.setEtag('"abc123"');
```

**`setLastModified(date: Date): Header`**

Set last modified date.

**Example:**
```typescript
header.setLastModified(new Date());
```

**`setIfModifiedSince(date: Date): Header`**

Set conditional request date.

**Example:**
```typescript
header.setIfModifiedSince(new Date(Date.now() - 86400000));
```

#### Request Methods

**`setHost(host: string): Header`**

Set host header.

**Example:**
```typescript
header.setHost('api.example.com');
```

**`setUserAgent(userAgent: string): Header`**

Set user agent string.

**Example:**
```typescript
header.setUserAgent('MyApp/1.0 (Windows NT 10.0)');
```

**`setReferer(referer: string): Header`**

Set referer header.

**Example:**
```typescript
header.setReferer('https://example.com/page');
```

**`setOrigin(origin: string): Header`**

Set origin header.

**Example:**
```typescript
header.setOrigin('https://example.com');
```

#### Utility Methods

**`setLocation(location: string): Header`**

Set location header for redirects.

**Example:**
```typescript
header.setLocation('https://example.com/new-page');
```

**`setCustom(value: string): Header`**

Set custom X-Custom header.

**Example:**
```typescript
header.setCustom('MyApp Response');
```

**`toJson(): Record<string, string>`**

Convert headers to plain object.

**Example:**
```typescript
const headerObj = header.toJson();
console.log(headerObj); // { "Content-Type": "application/json", ... }
```

### `ReadonlyHeader` Class

Read-only interface for safely accessing header information without modification capabilities.

#### Getter Methods

**`get(name: HeaderFieldType): string | null`**

Get header value.

**Example:**
```typescript
const contentType = readonlyHeader.get('Content-Type');
```

**`has(name: HeaderFieldType): boolean`**

Check header existence.

**Example:**
```typescript
const hasAuth = readonlyHeader.has('Authorization');
```

**`toJson(): Record<string, string>`**

Convert to object.

**Example:**
```typescript
const headers = readonlyHeader.toJson();
```

#### Content Methods

**`getContentType(): MimeType | "*/*" | null`**

Get content type.

**Example:**
```typescript
const contentType = readonlyHeader.getContentType(); // 'application/json'
```

**`getContentLength(): number`**

Get content length (0 if not set).

**Example:**
```typescript
const length = readonlyHeader.getContentLength(); // 1024
```

**`getCharset(): CharsetType | null`**

Extract charset from content type.

**Example:**
```typescript
const charset = readonlyHeader.getCharset(); // 'UTF-8'
```

**`getContentDisposition(): string | null`**

Get content disposition.

**Example:**
```typescript
const disposition = readonlyHeader.getContentDisposition();
```

**`getAccept(): MimeType | "*/*" | null`**

Get accept header.

**Example:**
```typescript
const accept = readonlyHeader.getAccept(); // 'application/json'
```

**`getLang(): {code: string, region?: string} | null`**

Parse accept-language header.

**Example:**
```typescript
const lang = readonlyHeader.getLang(); // { code: 'en', region: 'US' }
```

**`getAcceptEncoding(): EncodingType[] | null`**

Get accepted encodings.

**Example:**
```typescript
const encodings = readonlyHeader.getAcceptEncoding(); // ['gzip', 'br']
```

#### Authentication Methods

**`getAuthorization(): string | null`**

Get authorization header.

**Example:**
```typescript
const auth = readonlyHeader.getAuthorization(); // 'Bearer token123'
```

**`getBasicAuth(): string | null`**

Extract basic auth token.

**Example:**
```typescript
const token = readonlyHeader.getBasicAuth(); // 'dXNlcjpwYXNz'
```

**`getBearerToken(): string | null`**

Extract bearer token.

**Example:**
```typescript
const token = readonlyHeader.getBearerToken(); // 'your-jwt-token'
```

#### Cookie Methods

**`getCookies(): Record<string, string> | null`**

Parse all cookies.

**Example:**
```typescript
const cookies = readonlyHeader.getCookies(); // { session: 'abc123', user: 'john' }
```

**`getCookie(name: string): string | null`**

Get specific cookie value.

**Example:**
```typescript
const sessionId = readonlyHeader.getCookie('session'); // 'abc123'
```

#### Request Info Methods

**`getHost(): string | null`**

Get host header.

**Example:**
```typescript
const host = readonlyHeader.getHost(); // 'api.example.com'
```

**`getUserAgent(): IUserAgent | null`**

Parse user agent string.

**Example:**
```typescript
const ua = readonlyHeader.getUserAgent();
console.log(ua?.browser.name); // 'Chrome'
```

**`getReferer(): string | null`**

Get referer header.

**Example:**
```typescript
const referer = readonlyHeader.getReferer(); // 'https://example.com'
```

**`getOrigin(): string | null`**

Get origin header.

**Example:**
```typescript
const origin = readonlyHeader.getOrigin(); // 'https://example.com'
```

#### IP Detection Methods

**`getIp(): string | null`**

Get client IP using smart detection.

**Example:**
```typescript
const ip = readonlyHeader.getIp(); // '192.168.1.100'
```

**`getXForwardedFor(): string | null`**

Get X-Forwarded-For header.

**Example:**
```typescript
const forwarded = readonlyHeader.getXForwardedFor(); // '192.168.1.100, 10.0.0.1'
```

**`getXRealIP(): string | null`**

Get X-Real-IP header.

**Example:**
```typescript
const realIp = readonlyHeader.getXRealIP(); // '192.168.1.100'
```

**`getClientIps(): string[]`**

Get all possible client IPs.

**Example:**
```typescript
const ips = readonlyHeader.getClientIps(); // ['192.168.1.100', '10.0.0.1']
```

#### CORS Methods

**`getAccessControlAllowOrigin(): string | null`**

Get allowed origins.

**Example:**
```typescript
const origin = readonlyHeader.getAccessControlAllowOrigin(); // '*'
```

**`getAccessControlAllowMethods(): MethodType[] | null`**

Get allowed methods.

**Example:**
```typescript
const methods = readonlyHeader.getAccessControlAllowMethods(); // ['GET', 'POST']
```

**`getAccessControlAllowHeaders(): string[] | null`**

Get allowed headers.

**Example:**
```typescript
const headers = readonlyHeader.getAccessControlAllowHeaders(); // ['Content-Type']
```

**`getAccessControlAllowCredentials(): boolean | null`**

Get credentials policy.

**Example:**
```typescript
const credentials = readonlyHeader.getAccessControlAllowCredentials(); // true
```

#### Security Methods

**`getContentSecurityPolicy(): string | null`**

Get CSP policy.

**Example:**
```typescript
const csp = readonlyHeader.getContentSecurityPolicy();
```

**`getStrictTransportSecurity(): string | null`**

Get HSTS header.

**Example:**
```typescript
const hsts = readonlyHeader.getStrictTransportSecurity();
```

**`getXContentTypeOptions(): string | null`**

Get X-Content-Type-Options.

**Example:**
```typescript
const options = readonlyHeader.getXContentTypeOptions(); // 'nosniff'
```

**`getXFrameOptions(): string | null`**

Get X-Frame-Options.

**Example:**
```typescript
const frameOptions = readonlyHeader.getXFrameOptions(); // 'DENY'
```

**`getXXSSProtection(): string | null`**

Get XSS protection header.

**Example:**
```typescript
const xssProtection = readonlyHeader.getXXSSProtection(); // '1; mode=block'
```

#### Caching Methods

**`getCacheControl(): string | null`**

Get cache control.

**Example:**
```typescript
const cacheControl = readonlyHeader.getCacheControl(); // 'public, max-age=3600'
```

**`getEtag(): string | null`**

Get entity tag.

**Example:**
```typescript
const etag = readonlyHeader.getEtag(); // '"abc123"'
```

**`getLastModified(): Date | null`**

Get last modified date.

**Example:**
```typescript
const lastModified = readonlyHeader.getLastModified(); // Date object
```

**`getIfModifiedSince(): Date | null`**

Get conditional date.

**Example:**
```typescript
const ifModifiedSince = readonlyHeader.getIfModifiedSince(); // Date object
```

**`getIfNoneMatch(): string | null`**

Get if-none-match header.

**Example:**
```typescript
const ifNoneMatch = readonlyHeader.getIfNoneMatch(); // '"abc123"'
```

#### Detection Methods

**`isSecure(): boolean`**

Check if HTTPS (via X-Forwarded-Proto).

**Example:**
```typescript
const isHttps = readonlyHeader.isSecure(); // true
```

**`isAjax(): boolean`**

Check if XMLHttpRequest.

**Example:**
```typescript
const isAjax = readonlyHeader.isAjax(); // true
```

**`isCorsRequest(): boolean`**

Check if CORS request (has Origin).

**Example:**
```typescript
const isCors = readonlyHeader.isCorsRequest(); // true
```

### Type Definitions

#### `CookieOptions`

Interface for cookie configuration options.

```typescript
interface CookieOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
```

**Example:**
```typescript
const options: CookieOptions = {
  httpOnly: true,
  secure: true,
  maxAge: 3600,
  sameSite: 'Strict'
};
```

#### `IUserAgent`

Interface representing parsed user agent information.

```typescript
interface IUserAgent {
  readonly browser: {
    name?: string;
    version?: string;
    major?: string;
  };
  readonly engine: {
    name?: string;
    version?: string;
  };
  readonly os: {
    name?: string;
    version?: string;
  };
  readonly device: {
    vendor?: string;
    model?: string;
    type?: string;
  };
  readonly cpu: {
    architecture?: string;
  };
}
```

**Example:**
```typescript
const userAgent: IUserAgent = {
  browser: { name: 'Chrome', version: '91.0.4472.124' },
  os: { name: 'Windows', version: '10' },
  device: { type: 'desktop' },
  // ... other properties
};
```

#### Other Types

**`HeaderFieldType`**

Union type of standard header names plus custom headers.

**Example:**
```typescript
const headerName: HeaderFieldType = 'Content-Type';
const customHeader: HeaderFieldType = 'X-Custom-Header';
```

**`MethodType`**

HTTP methods type.

**Example:**
```typescript
const method: MethodType = 'GET'; // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'
```

**`EncodingType`**

Content encoding types.

**Example:**
```typescript
const encoding: EncodingType = 'gzip'; // 'deflate' | 'gzip' | 'compress' | 'br' | 'identity' | '*'
```

**`CharsetType`**

Character set types.

**Example:**
```typescript
const charset: CharsetType = 'UTF-8'; // 'ISO-8859-1' | '7-BIT' | 'UTF-8' | 'UTF-16' | 'US-ASCII'
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { Header, ReadonlyHeader } from '@talosjs/http-header';

const app = express();

app.use((req, res, next) => {
  // Parse incoming headers
  const incomingHeader = new ReadonlyHeader(new Headers(req.headers as any));

  // Create response headers
  const responseHeader = new Header()
    .setJson()
    .setCacheControl('no-cache')
    .setAccessControlAllowOrigin('*');

  // Apply headers to response
  responseHeader.native.forEach((value, key) => {
    res.setHeader(key, value);
  });

  next();
});

app.listen(3000);
```

### Fetch API Integration

```typescript
import { Header, ReadonlyHeader } from '@talosjs/http-header';

// Create request headers
const requestHeader = new Header()
  .setJson()
  .setBearerToken('your-token')
  .setUserAgent('MyApp/1.0');

const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: requestHeader.native,
  body: JSON.stringify({ data: 'example' })
});

// Parse response headers
const responseHeader = new ReadonlyHeader(response.headers);
const contentType = responseHeader.getContentType();
```

### Bun Server Integration

```typescript
import { Header, ReadonlyHeader } from '@talosjs/http-header';

Bun.serve({
  port: 3000,
  fetch(request) {
    // Parse request headers
    const requestHeader = new ReadonlyHeader(request.headers);

    // Create response headers
    const responseHeader = new Header()
      .setJson()
      .setCookie('session', 'abc123', { httpOnly: true })
      .setAccessControlAllowOrigin('*');

    return new Response(
      JSON.stringify({ message: 'Hello World' }),
      {
        headers: responseHeader.native
      }
    );
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
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team

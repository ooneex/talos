# @talosjs/jwt

JWT authentication toolkit using the JOSE library -- generate, sign, verify, and decode JSON Web Tokens with support for multiple algorithms.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **JOSE Powered** - Built on the robust JOSE library for secure JWT operations with HS256 signing

✅ **Token Generation** - Create signed JWT tokens with custom payloads and protected headers

✅ **Token Validation** - Verify token signatures and expiration via jwtVerify

✅ **Payload Extraction** - Decode and retrieve payload and header data from tokens without verification

✅ **Flexible Expiration** - Support for various expiration formats (seconds, minutes, hours, days, weeks, years)

✅ **Type-Safe** - Full TypeScript support with generic payload types

✅ **Standard Claims** - Built-in support for iss, sub, aud, exp, iat, nbf, and jti claims

✅ **Dependency Injection** - Injectable via @talosjs/container for seamless DI integration

✅ **Environment Config** - Automatic secret loading from JWT_SECRET environment variable

## Installation

```bash
bun add @talosjs/jwt
```

## Usage

### Basic Token Generation

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt('your-secret-key');

// Create a simple token
const token = await jwt.create({
  payload: {
    sub: 'user-123',
    exp: '1h' // Expires in 1 hour
  }
});

console.log(token);
```

### Token with Custom Payload

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

interface UserPayload {
  userId: string;
  role: string;
  permissions: string[];
}

const token = await jwt.create<UserPayload>({
  payload: {
    sub: 'user-123',
    iss: 'my-app',
    aud: 'my-api',
    exp: '24h',
    iat: new Date(),
    userId: 'usr_abc123',
    role: 'admin',
    permissions: ['read', 'write', 'delete']
  }
});
```

### Token Validation

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Check if token is valid
const isValid = await jwt.isValid(token);

if (isValid) {
  console.log('Token is valid');
} else {
  console.log('Token is invalid or expired');
}
```

### Extracting Payload

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

interface UserPayload {
  userId: string;
  role: string;
}

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Get payload without verification (decodes only)
const payload = jwt.getPayload<UserPayload>(token);

console.log(payload.userId); // "usr_abc123"
console.log(payload.role);   // "admin"
console.log(payload.exp);    // Expiration timestamp
```

### Extracting Header

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const header = jwt.getHeader(token);

console.log(header.alg); // "HS256"
console.log(header.typ); // "JWT"
```

### Using Environment Variables

```typescript
import { Jwt } from '@talosjs/jwt';

// Automatically uses JWT_SECRET environment variable
const jwt = new Jwt();

const token = await jwt.create({
  payload: {
    sub: 'user-123',
    exp: '1h'
  }
});
```

**Environment Variables:**
- `JWT_SECRET` - The secret key used for signing and verifying tokens

## API Reference

### Classes

#### `Jwt`

Main class for JWT operations.

**Constructor:**
```typescript
new Jwt(secret?: string)
```

**Parameters:**
- `secret` - Optional secret key. If not provided, uses `JWT_SECRET` environment variable

**Throws:** `JwtException` if no secret is provided or found in environment

**Methods:**

##### `create<T>(config?: CreateConfig): Promise<string>`

Creates a new signed JWT token.

**Parameters:**
- `config.payload` - The JWT payload including standard and custom claims
- `config.header` - Optional custom header parameters

**Returns:** Promise resolving to the signed token string

**Example:**
```typescript
const token = await jwt.create({
  payload: {
    sub: 'user-123',
    iss: 'my-app',
    exp: '2h',
    customClaim: 'value'
  },
  header: {
    kid: 'key-id-123'
  }
});
```

##### `isValid(token: string): Promise<boolean>`

Verifies if a token is valid (signature and expiration).

**Parameters:**
- `token` - The JWT token to verify

**Returns:** Promise resolving to `true` if valid, `false` otherwise

**Example:**
```typescript
const isValid = await jwt.isValid(token);
```

##### `getPayload<T>(token: string): JwtPayloadType<T>`

Decodes and returns the token payload (without verification).

**Parameters:**
- `token` - The JWT token to decode

**Returns:** The decoded payload

**Example:**
```typescript
interface MyPayload {
  userId: string;
}

const payload = jwt.getPayload<MyPayload>(token);
console.log(payload.userId);
```

##### `getHeader(token: string): JWTHeaderParameters`

Decodes and returns the token header.

**Parameters:**
- `token` - The JWT token to decode

**Returns:** The decoded header

##### `getSecret(): Uint8Array<ArrayBuffer>`

Returns the encoded secret used for signing.

**Returns:** The secret as a Uint8Array

### Types

#### `JwtExpiresInType`

Expiration time format strings.

```typescript
type JwtExpiresInType = 
  | `${number}s`  // seconds
  | `${number}m`  // minutes
  | `${number}h`  // hours
  | `${number}d`  // days
  | `${number}w`  // weeks
  | `${number}y`; // years
```

**Examples:**
- `'30s'` - 30 seconds
- `'15m'` - 15 minutes
- `'2h'` - 2 hours
- `'7d'` - 7 days
- `'1w'` - 1 week
- `'1y'` - 1 year

#### `JwtDefaultPayloadType`

Standard JWT claims.

```typescript
type JwtDefaultPayloadType = {
  iss?: string;                    // Issuer
  sub?: string;                    // Subject
  aud?: string | string[];         // Audience
  jti?: string;                    // JWT ID
  nbf?: number | string | Date;    // Not Before
  exp?: number | JwtExpiresInType | Date;  // Expiration
  iat?: number | string | Date;    // Issued At
};
```

#### `JwtPayloadType<T>`

Combined payload type with custom claims.

```typescript
type JwtPayloadType<T> = JwtDefaultPayloadType & T;
```

#### `IJwt`

Interface for JWT implementations.

```typescript
interface IJwt {
  create: <T extends Record<string, unknown>>(config?: {
    payload?: JwtDefaultPayloadType & JwtPayloadType<T>;
    header?: JWTHeaderParameters;
  }) => Promise<string>;
  getPayload: <T extends Record<string, unknown>>(token: string) => JwtPayloadType<T>;
  getHeader: (token: string) => JWTHeaderParameters;
  isValid: (token: string) => Promise<boolean> | boolean;
  getSecret: () => Uint8Array<ArrayBuffer>;
}
```

## Advanced Usage

### Authentication Flow

```typescript
import { Jwt, JwtException } from '@talosjs/jwt';

const jwt = new Jwt();

// Login - Generate tokens
async function login(userId: string, role: string) {
  const accessToken = await jwt.create({
    payload: {
      sub: userId,
      role,
      exp: '15m' // Short-lived access token
    }
  });

  const refreshToken = await jwt.create({
    payload: {
      sub: userId,
      type: 'refresh',
      exp: '7d' // Long-lived refresh token
    }
  });

  return { accessToken, refreshToken };
}

// Verify and extract user from token
async function authenticateRequest(token: string) {
  const isValid = await jwt.isValid(token);
  
  if (!isValid) {
    throw new Error('Invalid or expired token');
  }
  
  const payload = jwt.getPayload<{ role: string }>(token);
  
  return {
    userId: payload.sub,
    role: payload.role
  };
}
```

### Refresh Token Implementation

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

async function refreshAccessToken(refreshToken: string) {
  const isValid = await jwt.isValid(refreshToken);
  
  if (!isValid) {
    throw new Error('Invalid refresh token');
  }
  
  const payload = jwt.getPayload<{ type: string }>(refreshToken);
  
  if (payload.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  
  // Generate new access token
  const newAccessToken = await jwt.create({
    payload: {
      sub: payload.sub,
      exp: '15m'
    }
  });
  
  return newAccessToken;
}
```

### Error Handling

```typescript
import { Jwt, JwtException } from '@talosjs/jwt';

try {
  const jwt = new Jwt(); // Will throw if JWT_SECRET is not set
  
  const token = await jwt.create({
    payload: { sub: 'user-123' }
  });
} catch (error) {
  if (error instanceof JwtException) {
    console.error('JWT Error:', error.message);
    console.error('Status:', error.status);
  }
}
```

### Middleware Integration

```typescript
import { Jwt } from '@talosjs/jwt';
import type { IMiddleware, ContextType } from '@talosjs/middleware';

class AuthMiddleware implements IMiddleware {
  private readonly jwt = new Jwt();

  public async handle(context: ContextType): Promise<ContextType> {
    const authHeader = context.header.get('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return context.response.exception('Missing authorization header', {
        status: 401
      });
    }
    
    const token = authHeader.substring(7);
    const isValid = await this.jwt.isValid(token);
    
    if (!isValid) {
      return context.response.exception('Invalid or expired token', {
        status: 401
      });
    }
    
    const payload = this.jwt.getPayload<{ role: string }>(token);
    context.user = { id: payload.sub, role: payload.role };
    
    return context;
  }
}
```

### Custom Header Parameters

```typescript
import { Jwt } from '@talosjs/jwt';

const jwt = new Jwt();

const token = await jwt.create({
  payload: {
    sub: 'user-123',
    exp: '1h'
  },
  header: {
    kid: 'my-key-id',       // Key ID
    typ: 'JWT',             // Type
    cty: 'application/json' // Content Type
  }
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

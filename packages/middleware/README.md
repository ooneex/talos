# @talosjs/middleware

Middleware pipeline framework with decorator-based registration for processing HTTP requests, responses, and WebSocket events in sequence.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **HTTP Middleware** - Intercept and process HTTP requests and responses in a pipeline

✅ **WebSocket Middleware** - Handle WebSocket connection events with dedicated interface

✅ **Built-in CORS** - Ready-to-use CorsMiddleware with environment variable configuration

✅ **Decorator Registration** - Register middleware with `@decorator.middleware()` for clean code

✅ **Context Access** - Full access to request, response, headers, and application context

✅ **Container Integration** - Works seamlessly with the Talos dependency injection container

## Installation

```bash
bun add @talosjs/middleware
```

## Usage

### Basic HTTP Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';

@decorator.middleware()
class LoggingMiddleware implements IMiddleware {
  public async handle(context: ContextType): Promise<ContextType> {
    console.log(`${context.method} ${context.request.path}`);
    
    // Continue to next middleware/controller
    return context;
  }
}
```

### Authentication Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';
import { Jwt } from '@talosjs/jwt';

@decorator.middleware()
class AuthMiddleware implements IMiddleware {
  private readonly jwt = new Jwt();

  public async handle(context: ContextType): Promise<ContextType> {
    const authHeader = context.header.get('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      context.response.exception('Missing authorization header', {
        status: 401
      });
      return context;
    }
    
    const token = authHeader.substring(7);
    const isValid = await this.jwt.isValid(token);
    
    if (!isValid) {
      context.response.exception('Invalid or expired token', {
        status: 401
      });
      return context;
    }
    
    // Set user in context
    const payload = this.jwt.getPayload<{ userId: string; role: string }>(token);
    context.user = { id: payload.userId, role: payload.role };
    
    return context;
  }
}
```

### WebSocket Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { ISocketMiddleware, ContextType as SocketContextType } from '@talosjs/middleware';

@decorator.middleware()
class SocketAuthMiddleware implements ISocketMiddleware {
  public async handle(context: SocketContextType): Promise<SocketContextType> {
    const token = context.queries.token;
    
    if (!token) {
      context.response.exception('Missing authentication token', {
        status: 401
      });
      return context;
    }
    
    // Validate token and set user
    context.user = await this.validateToken(token);
    
    return context;
  }
}
```

### Request Validation Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';

@decorator.middleware()
class ValidationMiddleware implements IMiddleware {
  public async handle(context: ContextType): Promise<ContextType> {
    // Validate content type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(context.method)) {
      const contentType = context.header.get('Content-Type');
      
      if (!contentType?.includes('application/json')) {
        context.response.exception('Content-Type must be application/json', {
          status: 415
        });
        return context;
      }
    }
    
    return context;
  }
}
```

### Registering Middleware with App

```typescript
import { App } from '@talosjs/app';
import { AuthMiddleware, LoggingMiddleware } from './middleware';

const app = new App({
  middlewares: [LoggingMiddleware, AuthMiddleware],
  // ... other config
});

await app.run();
```

## API Reference

### Interfaces

#### `IMiddleware`

Interface for HTTP middleware implementations.

```typescript
interface IMiddleware<T extends ContextConfigType = ContextConfigType> {
  handle: (context: ContextType<T>) => Promise<ContextType<T>> | ContextType<T>;
}
```

**Methods:**

##### `handle(context: ContextType): Promise<ContextType> | ContextType`

Processes the request context and returns the (potentially modified) context.

**Parameters:**
- `context` - The request context containing request, response, and app data

**Returns:** The context object (modified or unchanged)

**Example:**
```typescript
public async handle(context: ContextType): Promise<ContextType> {
  // Pre-processing
  console.log('Before controller');
  
  // Return context to continue processing
  return context;
}
```

---

#### `ISocketMiddleware`

Interface for WebSocket middleware implementations.

```typescript
interface ISocketMiddleware<T extends SocketContextConfigType = SocketContextConfigType> {
  handle: (context: SocketContextType<T>) => Promise<SocketContextType<T>> | SocketContextType<T>;
}
```

**Methods:**

##### `handle(context: SocketContextType): Promise<SocketContextType> | SocketContextType`

Processes the WebSocket context and returns the (potentially modified) context.

**Parameters:**
- `context` - The WebSocket context containing connection data and channel methods

**Returns:** The context object (modified or unchanged)

### Types

#### `MiddlewareClassType`

```typescript
type MiddlewareClassType = new (...args: any[]) => IMiddleware;
```

#### `SocketMiddlewareClassType`

```typescript
type SocketMiddlewareClassType = new (...args: any[]) => ISocketMiddleware;
```

### Decorators

#### `@decorator.middleware()`

Registers a class as middleware with the dependency injection container.

**Example:**
```typescript
@decorator.middleware()
class MyMiddleware implements IMiddleware {
  // Implementation
}
```

## Advanced Usage

### CORS Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';

@decorator.middleware()
class CorsMiddleware implements IMiddleware {
  private readonly allowedOrigins = ['https://example.com', 'https://app.example.com'];

  public async handle(context: ContextType): Promise<ContextType> {
    const origin = context.header.get('Origin');
    
    if (origin && this.allowedOrigins.includes(origin)) {
      context.response.header.set('Access-Control-Allow-Origin', origin);
      context.response.header.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      context.response.header.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    // Handle preflight requests
    if (context.method === 'OPTIONS') {
      context.response.json({}, 204);
      return context;
    }
    
    return context;
  }
}
```

### Rate Limiting Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';
import { container } from '@talosjs/container';
import type { IRateLimiter } from '@talosjs/rate-limit';

@decorator.middleware()
class RateLimitMiddleware implements IMiddleware {
  public async handle(context: ContextType): Promise<ContextType> {
    const rateLimiter = container.get<IRateLimiter>('rateLimiter');
    const clientIp = context.ip || 'unknown';
    
    const result = await rateLimiter.check(clientIp, 100, 60); // 100 requests per minute
    
    context.response.header.set('X-RateLimit-Limit', result.total.toString());
    context.response.header.set('X-RateLimit-Remaining', result.remaining.toString());
    context.response.header.set('X-RateLimit-Reset', result.resetAt.toISOString());
    
    if (result.limited) {
      context.response.exception('Too many requests', {
        status: 429,
        data: { retryAfter: result.resetAt }
      });
    }
    
    return context;
  }
}
```

### Middleware with Dependencies

```typescript
import { decorator } from '@talosjs/middleware';
import { injectable, inject } from '@talosjs/container';
import type { IMiddleware, ContextType } from '@talosjs/middleware';
import type { ILogger } from '@talosjs/logger';

@decorator.middleware()
@injectable()
class LoggingMiddleware implements IMiddleware {
  constructor(
    @inject('logger') private readonly logger: ILogger
  ) {}

  public async handle(context: ContextType): Promise<ContextType> {
    const start = Date.now();
    
    this.logger.info('Request started', {
      method: context.method,
      path: context.request.path,
      ip: context.ip
    });
    
    // Store start time for response logging
    context.request.startTime = start;
    
    return context;
  }
}
```

### Error Handling Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';
import { Exception } from '@talosjs/exception';

@decorator.middleware()
class ErrorMiddleware implements IMiddleware {
  public async handle(context: ContextType): Promise<ContextType> {
    try {
      return context;
    } catch (error) {
      if (error instanceof Exception) {
        context.logger.error(error);
        context.response.exception(error.message, {
          status: error.status,
          data: error.data
        });
      } else {
        context.logger.error('Unexpected error', {
          error: error instanceof Error ? error.message : String(error)
        });
        context.response.exception('Internal server error', {
          status: 500
        });
      }
      
      return context;
    }
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
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team

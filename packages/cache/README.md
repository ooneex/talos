# @talosjs/cache

High-performance caching layer with filesystem and Redis backends -- features TTL expiration, auto-serialization, configurable size limits, and dependency injection integration.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multiple Backends** - Support for filesystem and Redis caching via AbstractCache base class

✅ **TTL Support** - Automatic expiration with configurable time-to-live for both backends

✅ **Type-Safe** - Full TypeScript support with generic cache values through the ICache interface

✅ **Auto Serialization** - Automatic JSON serialization and deserialization for complex objects

✅ **Container Integration** - Cache decorator for registering implementations with the DI container

✅ **File Size Limits** - Configurable maximum file size for filesystem cache entries

✅ **Auto Reconnection** - Redis client with configurable reconnection, retries, and offline queue

✅ **Expired Entry Cleanup** - Automatic deletion of expired filesystem cache entries on read

## Installation

```bash
bun add @talosjs/cache
```

## Usage

### Filesystem Cache

```typescript
import { FilesystemCache } from '@talosjs/cache';

const cache = new FilesystemCache({
  cacheDir: './.cache',
  maxFileSize: 10 * 1024 * 1024 // 10MB
});

// Set a value
await cache.set('user:123', { name: 'John', age: 30 });

// Get a value
const user = await cache.get<{ name: string; age: number }>('user:123');
console.log(user); // { name: 'John', age: 30 }

// Check if key exists
const exists = await cache.has('user:123');
console.log(exists); // true

// Delete a value
await cache.delete('user:123');
```

### Redis Cache

```typescript
import { RedisCache } from '@talosjs/cache';

const cache = new RedisCache({
  connectionString: 'redis://localhost:6379'
});

// Set with TTL (5 minutes)
await cache.set('session:abc', { token: 'xyz' }, 300);

// Get the value
const session = await cache.get<{ token: string }>('session:abc');

// Check existence
if (await cache.has('session:abc')) {
  console.log('Session is valid');
}
```

### With Environment Variables

```typescript
import { RedisCache } from '@talosjs/cache';

// Automatically uses CACHE_REDIS_URL environment variable
const cache = new RedisCache();

await cache.set('key', 'value');
```

**Environment Variables:**
- `CACHE_REDIS_URL` - Redis connection string for RedisCache

### With TTL (Time-To-Live)

```typescript
import { FilesystemCache } from '@talosjs/cache';

const cache = new FilesystemCache();

// Cache for 60 seconds
await cache.set('temporary', { data: 'expires soon' }, 60);

// Cache indefinitely (no TTL)
await cache.set('permanent', { data: 'stays forever' }, 0);
```

## API Reference

### Classes

#### `FilesystemCache`

File-based caching implementation that stores data as JSON files.

**Constructor:**
```typescript
new FilesystemCache(options?: FilesystemCacheOptionsType)
```

**Parameters:**
- `options.cacheDir` - Directory for cache files (default: `{cwd}/.cache`)
- `options.maxFileSize` - Maximum file size in bytes (default: 10MB)

**Methods:**

##### `get<T>(key: string): Promise<T | undefined>`

Retrieves a cached value by key.

**Parameters:**
- `key` - The cache key

**Returns:** The cached value or `undefined` if not found or expired

##### `set<T>(key: string, value: T, ttl?: number): Promise<void>`

Stores a value in the cache.

**Parameters:**
- `key` - The cache key
- `value` - The value to cache
- `ttl` - Time-to-live in seconds (optional, 0 for no expiration)

##### `delete(key: string): Promise<boolean>`

Removes a value from the cache.

**Parameters:**
- `key` - The cache key

**Returns:** `true` if the key was deleted, `false` if it didn't exist

##### `has(key: string): Promise<boolean>`

Checks if a key exists in the cache.

**Parameters:**
- `key` - The cache key

**Returns:** `true` if the key exists and hasn't expired

---

#### `RedisCache`

Redis-based caching implementation for distributed caching.

**Constructor:**
```typescript
new RedisCache(options?: RedisCacheOptionsType)
```

**Parameters:**
- `options.connectionString` - Redis URL (default: `CACHE_REDIS_URL` env var)
- `options.connectionTimeout` - Connection timeout in ms (default: 10000)
- `options.idleTimeout` - Idle timeout in ms (default: 30000)
- `options.autoReconnect` - Enable auto reconnection (default: true)
- `options.maxRetries` - Maximum retry attempts (default: 3)
- `options.enableOfflineQueue` - Queue commands when offline (default: true)
- `options.enableAutoPipelining` - Enable auto pipelining (default: true)
- `options.tls` - TLS configuration (optional)

**Methods:**

Same interface as `FilesystemCache` - implements `ICache` interface.

### Interfaces

#### `ICache`

```typescript
interface ICache {
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  set: <T = unknown>(key: string, value: T, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
  has: (key: string) => Promise<boolean>;
}
```

### Types

#### `FilesystemCacheOptionsType`

```typescript
type FilesystemCacheOptionsType = {
  cacheDir?: string;
  maxFileSize?: number;
  cleanupInterval?: number;
  enableCleanup?: boolean;
};
```

#### `RedisCacheOptionsType`

```typescript
type RedisCacheOptionsType = {
  connectionString?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?: boolean | object;
};
```

#### `CacheClassType`

```typescript
type CacheClassType = new (...args: any[]) => ICache;
```

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { RedisCache } from '@talosjs/cache';

const app = new App({
  cache: RedisCache,
  // ... other config
});

await app.run();
```

### Using in Controllers

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.users.show',
  path: '/api/users/:id',
  method: 'GET',
  description: 'Get user by ID'
})
class UserShowController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { id } = context.params;
    const { cache } = context;
    
    // Try to get from cache first
    const cacheKey = `user:${id}`;
    let user = await cache?.get<User>(cacheKey);
    
    if (!user) {
      // Fetch from database
      user = await this.userRepository.findById(id);
      
      // Cache for 5 minutes
      await cache?.set(cacheKey, user, 300);
    }
    
    return context.response.json({ user });
  }
}
```

### Cache Decorator Pattern

```typescript
import { container } from '@talosjs/container';
import { RedisCache, decorator } from '@talosjs/cache';

// Register with container using decorator
@decorator.cache()
class MyCacheService extends RedisCache {
  // Custom caching logic
}

// Resolve from container
const cache = container.get(MyCacheService);
```

### Error Handling

```typescript
import { RedisCache, CacheException } from '@talosjs/cache';

try {
  const cache = new RedisCache();
  await cache.set('key', 'value');
} catch (error) {
  if (error instanceof CacheException) {
    console.error('Cache Error:', error.message);
    // Handle cache-specific error
  }
}
```

### Caching Complex Objects

```typescript
import { FilesystemCache } from '@talosjs/cache';

interface Product {
  id: string;
  name: string;
  price: number;
  categories: string[];
}

const cache = new FilesystemCache();

const product: Product = {
  id: 'prod-123',
  name: 'Widget',
  price: 29.99,
  categories: ['electronics', 'gadgets']
};

// Objects are automatically serialized to JSON
await cache.set('product:prod-123', product);

// And deserialized when retrieved
const cached = await cache.get<Product>('product:prod-123');
console.log(cached?.name); // "Widget"
```

### Cache Key Patterns

```typescript
import { RedisCache } from '@talosjs/cache';

const cache = new RedisCache();

// Use namespaced keys for organization
await cache.set('users:123:profile', userData);
await cache.set('users:123:settings', settingsData);
await cache.set('products:456:details', productData);

// Session-based caching
await cache.set(`session:${sessionId}`, sessionData, 3600); // 1 hour TTL
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

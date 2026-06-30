# @talosjs/database

Database abstraction layer with TypeORM integration -- provides connection pooling, query building, and migration support for relational databases. This package provides unified interfaces for Redis, PostgreSQL, and SQLite databases with automatic connection handling, repository management, and seamless integration with the Talos framework.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multiple Databases** - Support for PostgreSQL, SQLite, and Redis

✅ **TypeORM Integration** - Full TypeORM support with connection pooling and query building

✅ **Repository Pattern** - Easy access to TypeORM repositories for entity management

✅ **Connection Management** - Automatic connection handling with open/close lifecycle

✅ **Container Integration** - Register database services with `@decorator.database()` for DI

✅ **Type-Safe** - Full TypeScript support with typed interfaces for each database type

✅ **Migration Support** - Schema synchronization and database management via TypeORM

## Installation

```bash
bun add @talosjs/database
```

## Usage

### PostgreSQL with TypeORM

```typescript
import { TypeormPgDatabase } from '@talosjs/database';
import { UserEntity } from './entities/UserEntity';

const database = new TypeormPgDatabase({
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'myapp'
});

// Get repository for an entity
const userRepository = await database.open(UserEntity);

// Use TypeORM repository methods
const users = await userRepository.find();
const user = await userRepository.findOneBy({ id: '123' });

// Close connection when done
await database.close();
```

### SQLite with TypeORM

```typescript
import { TypeormSqliteDatabase } from '@talosjs/database';
import { ProductEntity } from './entities/ProductEntity';

const database = new TypeormSqliteDatabase({
  database: './data/app.db'
});

// Get repository
const productRepository = await database.open(ProductEntity);

// Query products
const products = await productRepository.find({
  where: { category: 'electronics' },
  take: 10
});

await database.close();
```

### Redis Database

```typescript
import { RedisDatabase } from '@talosjs/database';

const redis = new RedisDatabase({
  url: 'redis://localhost:6379'
});

// Open connection and get client
const client = await redis.open();

// Use Redis commands
await client.set('key', 'value');
const value = await client.get('key');

// Close connection
await redis.close();
```

### Using Environment Variables

```typescript
import { TypeormPgDatabase } from '@talosjs/database';

// Automatically uses environment variables
const database = new TypeormPgDatabase();

// Environment variables:
// DATABASE_HOST
// DATABASE_PORT
// DATABASE_USERNAME
// DATABASE_PASSWORD
// DATABASE_NAME
```

## API Reference

### Classes

#### `TypeormPgDatabase`

PostgreSQL database adapter using TypeORM.

**Constructor:**
```typescript
new TypeormPgDatabase(options?: PostgresConnectionOptions)
```

**Parameters:**
- `options.host` - Database host (default: `DATABASE_HOST` env var)
- `options.port` - Database port (default: `DATABASE_PORT` env var)
- `options.username` - Database username (default: `DATABASE_USERNAME` env var)
- `options.password` - Database password (default: `DATABASE_PASSWORD` env var)
- `options.database` - Database name (default: `DATABASE_NAME` env var)
- `options.synchronize` - Auto-sync schema (default: false)
- `options.logging` - Enable query logging (default: false)

**Methods:**

##### `open<Entity>(entity: EntityTarget<Entity>, database?: string): Promise<Repository<Entity>>`

Opens connection and returns a TypeORM repository for the specified entity.

**Parameters:**
- `entity` - TypeORM entity class
- `database` - Optional database name override

**Returns:** TypeORM Repository instance

**Example:**
```typescript
const userRepo = await database.open(UserEntity);
const users = await userRepo.find();
```

##### `close(): Promise<void>`

Closes the database connection.

##### `drop(): Promise<void>`

Drops the database (use with caution!).

---

#### `TypeormSqliteDatabase`

SQLite database adapter using TypeORM.

**Constructor:**
```typescript
new TypeormSqliteDatabase(options?: SqliteConnectionOptions)
```

**Parameters:**
- `options.database` - Path to SQLite database file

**Methods:**

Same interface as `TypeormPgDatabase`.

---

#### `AbstractTypeormSqliteDatabase`

Abstract base class for creating custom SQLite database adapters.

**Example:**
```typescript
class MyDatabase extends AbstractTypeormSqliteDatabase {
  protected getEntities() {
    return [UserEntity, ProductEntity];
  }
}
```

---

#### `RedisDatabase`

Redis database adapter using Bun's built-in Redis client.

**Constructor:**
```typescript
new RedisDatabase(options?: RedisConnectionOptionsType)
```

**Parameters:**
- `options.url` - Redis connection URL (default: `REDIS_URL` env var)
- `options.connectionTimeout` - Connection timeout in ms (default: 10000)
- `options.idleTimeout` - Idle timeout in ms (default: 30000)
- `options.autoReconnect` - Enable auto reconnection (default: true)
- `options.maxRetries` - Maximum retry attempts (default: 3)
- `options.tls` - TLS configuration (optional)

**Methods:**

##### `open(): Promise<RedisClient>`

Opens connection and returns the Redis client.

**Returns:** Bun RedisClient instance

**Example:**
```typescript
const client = await redis.open();
await client.set('session:123', JSON.stringify(sessionData));
```

##### `close(): Promise<void>`

Closes the Redis connection.

##### `drop(): Promise<void>`

Flushes all data from Redis (use with caution!).

### Interfaces

#### `IDatabase`

```typescript
interface IDatabase {
  open: () => Promise<void>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}
```

#### `ITypeormDatabase`

```typescript
interface ITypeormDatabase {
  open: <Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    database?: string
  ) => Promise<Repository<Entity>>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}
```

#### `IRedisDatabase`

```typescript
interface IRedisDatabase {
  open: () => Promise<RedisClient>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}
```

### Types

#### `DatabaseClassType`

```typescript
type DatabaseClassType = new (...args: any[]) => IDatabase | IRedisDatabase | ITypeormDatabase;
```

#### `RedisConnectionOptionsType`

```typescript
type RedisConnectionOptionsType = {
  url?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
};
```

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { TypeormPgDatabase } from '@talosjs/database';

const database = new TypeormPgDatabase({
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'myapp'
});

const app = new App({
  database,
  // ... other config
});

await app.run();
```

### Using in Controllers

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';
import { UserEntity } from '../entities/UserEntity';

@Route.http({
  name: 'api.users.list',
  path: '/api/users',
  method: 'GET',
  description: 'List all users'
})
class UserListController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { database } = context;
    
    const userRepository = await database?.open(UserEntity);
    const users = await userRepository?.find({
      take: 100,
      order: { createdAt: 'DESC' }
    });
    
    return context.response.json({ users });
  }
}
```

### Container Integration with Decorators

```typescript
import { container, EContainerScope } from '@talosjs/container';
import { TypeormPgDatabase, decorator } from '@talosjs/database';

// Register with decorator
@decorator.database()
class SharedDatabase extends TypeormPgDatabase {
  constructor() {
    super({
      host: 'localhost',
      port: 5432,
      database: 'myapp'
    });
  }
}

// Resolve from container
const database = container.get(SharedDatabase);
```

### Error Handling

```typescript
import { TypeormPgDatabase, DatabaseException } from '@talosjs/database';

try {
  const database = new TypeormPgDatabase();
  const userRepo = await database.open(UserEntity);
  const users = await userRepo.find();
} catch (error) {
  if (error instanceof DatabaseException) {
    console.error('Database Error:', error.message);
    console.error('Status:', error.status);
  }
}
```

### Transaction Support

```typescript
import { TypeormPgDatabase } from '@talosjs/database';
import { UserEntity, OrderEntity } from './entities';

const database = new TypeormPgDatabase();
const userRepo = await database.open(UserEntity);

// Access the entity manager for transactions
const entityManager = userRepo.manager;

await entityManager.transaction(async (transactionalManager) => {
  const user = await transactionalManager.findOneBy(UserEntity, { id: '123' });
  
  const order = transactionalManager.create(OrderEntity, {
    userId: user.id,
    total: 99.99
  });
  
  await transactionalManager.save(order);
  
  user.ordersCount += 1;
  await transactionalManager.save(user);
});
```

### Multiple Database Connections

```typescript
import { TypeormPgDatabase, TypeormSqliteDatabase } from '@talosjs/database';

// Main PostgreSQL database
const mainDb = new TypeormPgDatabase({
  host: 'localhost',
  database: 'main_app'
});

// Analytics SQLite database
const analyticsDb = new TypeormSqliteDatabase({
  database: './analytics.db'
});

// Use both databases
const userRepo = await mainDb.open(UserEntity);
const analyticsRepo = await analyticsDb.open(AnalyticsEntity);
```

### Redis Caching Pattern

```typescript
import { RedisDatabase } from '@talosjs/database';

class CacheService {
  private readonly redis: RedisDatabase;
  private client: Bun.RedisClient | null = null;

  constructor() {
    this.redis = new RedisDatabase();
  }

  public async init(): Promise<void> {
    this.client = await this.redis.open();
  }

  public async get<T>(key: string): Promise<T | null> {
    const value = await this.client?.get(key);
    return value ? JSON.parse(value) : null;
  }

  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.client?.set(key, JSON.stringify(value));
    if (ttl) {
      await this.client?.expire(key, ttl);
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client?.del(key);
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

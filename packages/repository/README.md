# @talosjs/repository

Data access layer with decorator-based repository registration, query abstraction, and dependency injection for clean persistence patterns.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Repository Decorator** - Register repositories with the DI container using decorators

✅ **Interface Contract** - Standard interface for repository implementations

✅ **Paginated Results** - Built-in support for paginated query results

✅ **Scope Control** - Configure singleton, transient, or request-scoped repositories

✅ **Type-Safe** - Full TypeScript support with generic entity and criteria types

✅ **Container Integration** - Seamless integration with @talosjs/container

✅ **Search Support** - Built-in query string parameter for search functionality

## Installation

```bash
bun add @talosjs/repository
```

## Usage

### Basic Repository

```typescript
import { decorator, type IRepository } from '@talosjs/repository';
import type { FilterResultType } from '@talosjs/types';

interface User {
  id: string;
  email: string;
  name: string;
}

interface UserCriteria {
  email?: string;
  name?: string;
  isActive?: boolean;
}

@decorator.repository()
class UserRepository implements IRepository<User, UserCriteria> {
  private connection: unknown = null;

  public async open(): Promise<unknown> {
    // Open database connection
    this.connection = await this.createConnection();
    return this.connection;
  }

  public async close(): Promise<void> {
    // Close database connection
    this.connection = null;
  }

  public async find(
    criteria: UserCriteria & { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<User>> {
    const { page = 1, limit = 10, q, ...filters } = criteria;
    
    // Query implementation
    const users = await this.queryUsers(filters, q);
    const total = await this.countUsers(filters, q);
    
    return {
      resources: users,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit
    };
  }

  private async createConnection(): Promise<unknown> {
    // Connection logic
    return {};
  }

  private async queryUsers(filters: UserCriteria, q?: string): Promise<User[]> {
    // Query logic
    return [];
  }

  private async countUsers(filters: UserCriteria, q?: string): Promise<number> {
    // Count logic
    return 0;
  }
}
```

### Resolving Repositories

```typescript
import { container } from '@talosjs/container';
import { UserRepository } from './repositories/UserRepository';

// Repository is automatically registered by the decorator
const userRepo = container.get(UserRepository);

// Open connection
await userRepo.open();

// Find users with pagination
const result = await userRepo.find({
  isActive: true,
  page: 1,
  limit: 20,
  q: 'john'
});

console.log(result.resources);  // User[]
console.log(result.total);      // Total count
console.log(result.totalPages); // Number of pages

// Close connection
await userRepo.close();
```

### Repository with TypeORM

```typescript
import { decorator, type IRepository } from '@talosjs/repository';
import { container } from '@talosjs/container';
import type { FilterResultType } from '@talosjs/types';
import type { IDatabase } from '@talosjs/database';
import type { Repository } from 'typeorm';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface ProductCriteria {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

@decorator.repository()
class ProductRepository implements IRepository<Product, ProductCriteria> {
  private readonly database = container.get<IDatabase>('database');
  private repository: Repository<Product> | null = null;

  public async open(): Promise<Repository<Product>> {
    this.repository = await this.database.open(ProductEntity);
    return this.repository;
  }

  public async close(): Promise<void> {
    // TypeORM manages connection lifecycle
  }

  public async find(
    criteria: ProductCriteria & { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<Product>> {
    const { page = 1, limit = 10, q, category, minPrice, maxPrice } = criteria;
    
    const queryBuilder = this.repository!
      .createQueryBuilder('product');

    if (category) {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    if (minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    if (q) {
      queryBuilder.andWhere('product.name ILIKE :q', { q: `%${q}%` });
    }

    const [resources, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      resources,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit
    };
  }
}
```

### Transient Repositories

```typescript
import { decorator, type IRepository } from '@talosjs/repository';
import { EContainerScope } from '@talosjs/container';

@decorator.repository(EContainerScope.Transient)
class TransientRepository implements IRepository {
  private readonly instanceId = crypto.randomUUID();

  public async open(): Promise<unknown> {
    console.log(`Opening connection for instance: ${this.instanceId}`);
    return {};
  }

  public async close(): Promise<void> {
    console.log(`Closing connection for instance: ${this.instanceId}`);
  }

  public async find(criteria: { page?: number; limit?: number; q?: string }) {
    return {
      resources: [],
      total: 0,
      totalPages: 0,
      page: criteria.page ?? 1,
      limit: criteria.limit ?? 10
    };
  }
}

// Each resolution creates a new instance
const repo1 = container.get(TransientRepository);
const repo2 = container.get(TransientRepository);
// repo1 and repo2 have different instanceIds
```

## API Reference

### Decorators

#### `@decorator.repository(scope?)`

Decorator to register a repository class with the DI container.

**Parameters:**
- `scope` - Container scope (default: `EContainerScope.Singleton`)
  - `Singleton` - Single instance shared across all requests
  - `Transient` - New instance created on every resolution
  - `Request` - New instance per request context

**Example:**
```typescript
import { decorator } from '@talosjs/repository';
import { EContainerScope } from '@talosjs/container';

// Singleton (default)
@decorator.repository()
class MySingletonRepository {}

// Transient
@decorator.repository(EContainerScope.Transient)
class MyTransientRepository {}

// Request-scoped
@decorator.repository(EContainerScope.Request)
class MyRequestRepository {}
```

### Interfaces

#### `IRepository<T, TCriteria>`

Interface for repository implementations.

```typescript
interface IRepository<T = unknown, TCriteria = unknown> {
  open: () => Promise<unknown>;
  close: () => Promise<void>;
  find: (criteria: TCriteria & { page?: number; limit?: number; q?: string }) => Promise<FilterResultType<T>>;
}
```

**Type Parameters:**
- `T` - The entity type returned by the repository
- `TCriteria` - The criteria type for filtering results

**Methods:**

##### `open(): Promise<unknown>`

Open or initialize the data source connection.

**Returns:** Promise resolving to the connection or data source

##### `close(): Promise<void>`

Close the data source connection.

**Returns:** Promise that resolves when connection is closed

##### `find(criteria): Promise<FilterResultType<T>>`

Find entities matching the given criteria with pagination support.

**Parameters:**
- `criteria` - Filter criteria including:
  - Custom filter fields from `TCriteria`
  - `page` - Page number (default: 1)
  - `limit` - Items per page (default: 10)
  - `q` - Search query string

**Returns:** Promise resolving to paginated results

### Types

#### `RepositoryClassType`

Type for repository class constructors.

```typescript
type RepositoryClassType = new (...args: any[]) => IRepository;
```

#### `FilterResultType<T>`

Type for paginated query results (from @talosjs/types).

```typescript
type FilterResultType<T> = {
  resources: T[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
};
```

## Advanced Usage

### Repository with Caching

```typescript
import { decorator, type IRepository } from '@talosjs/repository';
import { container } from '@talosjs/container';
import type { ICache } from '@talosjs/cache';
import type { FilterResultType } from '@talosjs/types';

interface Article {
  id: string;
  title: string;
  content: string;
}

@decorator.repository()
class CachedArticleRepository implements IRepository<Article> {
  private readonly cache = container.get<ICache>('cache');

  public async open(): Promise<unknown> {
    return {};
  }

  public async close(): Promise<void> {}

  public async find(
    criteria: { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<Article>> {
    const cacheKey = `articles:${JSON.stringify(criteria)}`;
    
    // Check cache first
    const cached = await this.cache.get<FilterResultType<Article>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await this.queryDatabase(criteria);

    // Cache for 5 minutes
    await this.cache.set(cacheKey, result, 300);

    return result;
  }

  private async queryDatabase(
    criteria: { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<Article>> {
    // Database query logic
    return {
      resources: [],
      total: 0,
      totalPages: 0,
      page: criteria.page ?? 1,
      limit: criteria.limit ?? 10
    };
  }
}
```

### Repository with Logging

```typescript
import { decorator, type IRepository } from '@talosjs/repository';
import { container } from '@talosjs/container';
import type { ILogger } from '@talosjs/logger';
import type { FilterResultType } from '@talosjs/types';

@decorator.repository()
class LoggedRepository<T> implements IRepository<T> {
  private readonly logger = container.get<ILogger>('logger');

  public async open(): Promise<unknown> {
    this.logger.info('Opening repository connection');
    const connection = await this.createConnection();
    this.logger.success('Repository connection opened');
    return connection;
  }

  public async close(): Promise<void> {
    this.logger.info('Closing repository connection');
    await this.closeConnection();
    this.logger.success('Repository connection closed');
  }

  public async find(
    criteria: { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<T>> {
    this.logger.info('Finding resources', { criteria });
    
    const startTime = Date.now();
    const result = await this.queryResources(criteria);
    const duration = Date.now() - startTime;

    this.logger.info('Found resources', {
      total: result.total,
      page: result.page,
      duration: `${duration}ms`
    });

    return result;
  }

  private async createConnection(): Promise<unknown> {
    return {};
  }

  private async closeConnection(): Promise<void> {}

  private async queryResources(
    criteria: { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<T>> {
    return {
      resources: [],
      total: 0,
      totalPages: 0,
      page: criteria.page ?? 1,
      limit: criteria.limit ?? 10
    };
  }
}
```

### Abstract Base Repository

```typescript
import { type IRepository } from '@talosjs/repository';
import type { FilterResultType } from '@talosjs/types';

abstract class BaseRepository<T, TCriteria = Record<string, unknown>> 
  implements IRepository<T, TCriteria> {
  
  protected connection: unknown = null;

  public async open(): Promise<unknown> {
    this.connection = await this.createConnection();
    return this.connection;
  }

  public async close(): Promise<void> {
    await this.closeConnection();
    this.connection = null;
  }

  public abstract find(
    criteria: TCriteria & { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<T>>;

  protected abstract createConnection(): Promise<unknown>;
  protected abstract closeConnection(): Promise<void>;

  protected paginate<R>(
    resources: R[],
    total: number,
    page: number,
    limit: number
  ): FilterResultType<R> {
    return {
      resources,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit
    };
  }
}

// Usage
@decorator.repository()
class OrderRepository extends BaseRepository<Order, OrderCriteria> {
  protected async createConnection(): Promise<unknown> {
    // Implementation
    return {};
  }

  protected async closeConnection(): Promise<void> {
    // Implementation
  }

  public async find(
    criteria: OrderCriteria & { page?: number; limit?: number; q?: string }
  ): Promise<FilterResultType<Order>> {
    const { page = 1, limit = 10 } = criteria;
    
    const orders = await this.queryOrders(criteria);
    const total = await this.countOrders(criteria);

    return this.paginate(orders, total, page, limit);
  }
}
```

### Controller Integration

```typescript
import { Route } from '@talosjs/routing';
import { container } from '@talosjs/container';
import type { IController, ContextType } from '@talosjs/controller';
import { UserRepository } from './repositories/UserRepository';

@Route.http({
  name: 'api.users.list',
  path: '/api/users',
  method: 'GET',
  description: 'List users with pagination'
})
class UserListController implements IController {
  private readonly userRepository = container.get(UserRepository);

  public async index(context: ContextType): Promise<IResponse> {
    const { page, limit, q, ...filters } = context.queries;

    const result = await this.userRepository.find({
      ...filters,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      q: q as string
    });

    return context.response.json(result);
  }
}
```

### Testing Repositories

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { container } from '@talosjs/container';
import { UserRepository } from './UserRepository';

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(async () => {
    repository = container.get(UserRepository);
    await repository.open();
  });

  afterEach(async () => {
    await repository.close();
  });

  test('should return paginated results', async () => {
    const result = await repository.find({ page: 1, limit: 10 });

    expect(result).toHaveProperty('resources');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('limit', 10);
    expect(Array.isArray(result.resources)).toBe(true);
  });

  test('should filter by criteria', async () => {
    const result = await repository.find({
      isActive: true,
      page: 1,
      limit: 10
    });

    expect(result.resources.every(user => user.isActive)).toBe(true);
  });

  test('should search with query string', async () => {
    const result = await repository.find({
      q: 'john',
      page: 1,
      limit: 10
    });

    expect(result.resources.every(
      user => user.name.toLowerCase().includes('john')
    )).toBe(true);
  });
});
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

# @talosjs/routing

Decorator-driven HTTP routing with path parameters, validation constraints, permission guards, and named route generation.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Method-Specific Decorators** - Define routes using `Route.get`, `Route.post`, `Route.put`, `Route.delete`, `Route.patch`, `Route.options`, `Route.head`, and `Route.socket` decorators

✅ **Parameter Validation** - Built-in validation for route params, query strings, and payloads using ArkType schemas

✅ **Type-Safe Route Paths** - Compile-time validation of route paths with typed parameter extraction

✅ **WebSocket Support** - Define WebSocket routes alongside HTTP routes with `Route.socket`

✅ **Route Versioning** - Version routes with a numeric version field in route configuration

✅ **Role-Based Access Control** - Restrict routes by user roles and environment

✅ **IP/Host Restrictions** - Limit access by IP address or hostname

✅ **Route Generation** - Generate URLs for named routes with parameter interpolation

✅ **Route Documentation Utilities** - Convert route configurations to TypeScript type strings or JSON documentation

✅ **Container Integration** - Automatic controller registration with the DI container

## Installation

```bash
bun add @talosjs/routing
```

## Usage

### Basic HTTP Route

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';
import type { IResponse } from '@talosjs/http-response';

@Route.http({
  name: 'api.users.list',
  path: '/api/users',
  method: 'GET',
  description: 'List all users'
})
class UserListController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response.json({
      users: [{ id: 1, name: 'John' }]
    });
  }
}
```

### Route with Parameters

```typescript
import { Route } from '@talosjs/routing';
import { type } from 'arktype';

@Route.http({
  name: 'api.users.show',
  path: '/api/users/:id',
  method: 'GET',
  description: 'Get user by ID',
  params: {
    id: type('string.uuid')
  }
})
class UserShowController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { id } = context.params;
    const user = await this.userRepository.findById(id);
    
    return context.response.json({ user });
  }
}
```

### Route with Query Validation

```typescript
import { Route } from '@talosjs/routing';
import { type } from 'arktype';

@Route.http({
  name: 'api.products.search',
  path: '/api/products',
  method: 'GET',
  description: 'Search products',
  queries: type({
    q: 'string',
    page: 'number = 1',
    limit: 'number = 10',
    'category?': 'string'
  })
})
class ProductSearchController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { q, page, limit, category } = context.queries;
    
    const products = await this.search(q, { page, limit, category });
    
    return context.response.json({ products });
  }
}
```

### Route with Payload Validation

```typescript
import { Route } from '@talosjs/routing';
import { type } from 'arktype';

@Route.http({
  name: 'api.users.create',
  path: '/api/users',
  method: 'POST',
  description: 'Create a new user',
  payload: type({
    email: 'string.email',
    name: 'string >= 2',
    password: 'string >= 8'
  })
})
class UserCreateController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { email, name, password } = context.payload;
    
    const user = await this.userService.create({ email, name, password });
    
    return context.response.json({ user }, 201);
  }
}
```

### WebSocket Route

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.chat.connect',
  path: '/ws/chat/:roomId',
  description: 'Connect to chat room',
  params: {
    roomId: type('string')
  }
})
class ChatController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { roomId } = context.params;
    
    await context.channel.subscribe();
    
    return context.response.json({
      connected: true,
      room: roomId
    });
  }
}
```

### Route with Role-Based Access

```typescript
import { Route } from '@talosjs/routing';
import { ERole } from '@talosjs/role';

@Route.http({
  name: 'admin.users.delete',
  path: '/admin/users/:id',
  method: 'DELETE',
  description: 'Delete a user (admin only)',
  roles: ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN']
})
class UserDeleteController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    await this.userService.delete(context.params.id);
    
    return context.response.json({ deleted: true });
  }
}
```

### Generating URLs

```typescript
import { router } from '@talosjs/routing';

// Generate URL for a named route
const userUrl = router.generate('api.users.show', { id: '123' });
console.log(userUrl); // "/api/users/123"

// Generate URL with multiple parameters
const orderUrl = router.generate('api.users.orders.show', {
  userId: '123',
  orderId: '456'
});
console.log(orderUrl); // "/api/users/123/orders/456"
```

## API Reference

### Decorators

#### `@Route.http(config: RouteConfigType)`

Decorator for defining HTTP routes.

**Parameters:**
- `config.name` - Route name in `namespace.resource.action` format
- `config.path` - URL path with optional parameters (e.g., `/users/:id`)
- `config.method` - HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
- `config.description` - Human-readable description
- `config.params` - Parameter validation schema (optional)
- `config.queries` - Query string validation schema (optional)
- `config.payload` - Request body validation schema (optional)
- `config.response` - Response validation schema (optional)
- `config.roles` - Required roles for access (optional)
- `config.permission` - Custom permission class (optional)
- `config.env` - Allowed environments (optional)
- `config.ip` - Allowed IP addresses (optional)
- `config.host` - Allowed hostnames (optional)
- `config.cache` - Cache key prefix string to enable caching (optional)
- `config.generate` - Code generation options (optional)

**Example:**
```typescript
@Route.http({
  name: 'api.products.update',
  path: '/api/products/:id',
  method: 'PUT',
  description: 'Update a product',
  params: { id: type('string.uuid') },
  payload: type({ name: 'string', price: 'number' }),
  roles: ['ROLE_ADMIN']
})
```

#### `@Route.socket(config: RouteConfigType)`

Decorator for defining WebSocket routes.

**Parameters:**
Same as `@Route.http`, but `method` is ignored and `isSocket` is set to `true`.

---

### Classes

#### `Router`

Main router class for managing routes.

**Methods:**

##### `addRoute(route: RouteConfigType): this`

Manually add a route to the router.

**Parameters:**
- `route` - The route configuration

**Returns:** The router instance for chaining

**Throws:** `RouterException` if route name or path/method already exists

##### `findRouteByPath(path: string): RouteConfigType[] | null`

Find all routes registered for a specific path.

**Parameters:**
- `path` - The URL path

**Returns:** Array of route configurations or null

##### `findRouteByName(name: RouteNameType): RouteConfigType | null`

Find a route by its unique name.

**Parameters:**
- `name` - The route name

**Returns:** Route configuration or null

##### `getRoutes(): Map<string, RouteConfigType[]>`

Get all registered routes.

**Returns:** Map of path to route configurations

##### `getHttpRoutes(): Map<string, RouteConfigType[]>`

Get only HTTP routes (excludes WebSocket routes).

**Returns:** Map of path to HTTP route configurations

##### `getSocketRoutes(): Map<string, RouteConfigType>`

Get only WebSocket routes.

**Returns:** Map of path to WebSocket route configuration

##### `generate<P>(name: RouteNameType, params?: P): string`

Generate a URL for a named route.

**Parameters:**
- `name` - The route name
- `params` - Parameter values to interpolate

**Returns:** The generated URL path

**Throws:** `RouterException` if route not found or missing required parameters

**Example:**
```typescript
const url = router.generate('api.users.show', { id: '123' });
```

### Types

#### `RouteNameType`

Route name following the `namespace.resource.action` pattern.

```typescript
type RouteNameType = `${RouteNamespace}.${string}.${RouteAction}`;
// Example: "api.users.list", "admin.products.create"
```

**Valid Namespaces:**
- `api`, `client`, `admin`, `public`, `auth`, `webhook`, `internal`, `external`, `system`, `metrics`, `docs`

**Valid Actions:**
- `list`, `show`, `create`, `update`, `delete`, `search`, `export`, `import`, and 200+ more

#### `RouteConfigType`

```typescript
type RouteConfigType = {
  name: RouteNameType;
  path: `/${string}`;
  method: HttpMethodType;
  params?: Record<string, AssertType | IAssert>;
  queries?: AssertType | IAssert;
  payload?: AssertType | IAssert;
  response?: AssertType | IAssert;
  controller: ControllerClassType;
  description: string;
  env?: Environment[];
  ip?: string[];
  host?: string[];
  roles?: Uppercase<string>[];
  permission?: PermissionClassType;
  cache?: string;
  isSocket: boolean;
  generate?: {
    doc?: boolean;
    fetcher?: boolean;
    queryHook?: boolean;
  };
};
```

#### `ExtractParameters<T>`

Utility type to extract parameter names from a route path.

```typescript
type Params = ExtractParameters<'/users/:id/orders/:orderId'>;
// Result: "id" | "orderId"
```

#### `RouteParameters<T>`

Utility type to create a typed record from route parameters.

```typescript
type Params = RouteParameters<'/users/:id'>;
// Result: { id: string }
```

## Advanced Usage

### Environment-Specific Routes

```typescript
import { Route } from '@talosjs/routing';
import { Environment } from '@talosjs/app-env';

@Route.http({
  name: 'api.debug.info',
  path: '/api/debug',
  method: 'GET',
  description: 'Debug information (dev only)',
  env: [Environment.LOCAL, Environment.DEVELOPMENT]
})
class DebugController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response.json({
      environment: context.app.env.env,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Custom Permission Classes

```typescript
import { Route } from '@talosjs/routing';
import { Permission } from '@talosjs/permission';
import type { IUser } from '@talosjs/user';

class CanEditOwnProfile extends Permission {
  public can(user: IUser | null, context: ContextType): boolean {
    if (!user) return false;
    return user.id === context.params.id;
  }
}

@Route.http({
  name: 'api.users.update',
  path: '/api/users/:id',
  method: 'PUT',
  description: 'Update user profile',
  permission: CanEditOwnProfile
})
class UserUpdateController implements IController {
  // Only the user themselves can update their profile
}
```

### IP Address Restrictions

```typescript
@Route.http({
  name: 'internal.metrics.show',
  path: '/internal/metrics',
  method: 'GET',
  description: 'Internal metrics endpoint',
  ip: ['127.0.0.1', '10.0.0.0/8', '192.168.1.0/24']
})
class MetricsController implements IController {
  // Only accessible from specified IP ranges
}
```

### Code Generation Options

```typescript
@Route.http({
  name: 'api.users.list',
  path: '/api/users',
  method: 'GET',
  description: 'List all users',
  response: type({ users: 'User[]' }),
  generate: {
    doc: true,        // Generate API documentation
    fetcher: true,    // Generate fetch client function
    queryHook: true   // Generate React Query hook
  }
})
```

### Error Handling

```typescript
import { router, RouterException } from '@talosjs/routing';

try {
  const url = router.generate('api.nonexistent.route', { id: '123' });
} catch (error) {
  if (error instanceof RouterException) {
    console.error('Route error:', error.message);
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

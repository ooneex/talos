# @talosjs/controller

HTTP controller layer with decorator-based route binding, request/response handling, and seamless integration with the routing and middleware systems.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Controller Interface** - Standard IController interface for all HTTP controllers with typed index method

✅ **Rich Context** - Access to request, response, logger, cache, storage, mailer, analytics, rate limiter, and more

✅ **Type-Safe** - Full TypeScript support with generic ContextConfigType for typed params, payload, queries, and response

✅ **Route Information** - Context includes matched route metadata (name, path, method, version, description)

✅ **Service Access** - Built-in access to analytics, storage, mailer, rate limiter, and exception logger

✅ **Request Data** - Parsed params, payload, queries, headers, files, IP, host, and detected language

✅ **User Context** - Authenticated user (IUser) available on the context when using auth middleware

## Installation

```bash
bun add @talosjs/controller
```

## Usage

### Basic Controller

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
      users: [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ]
    });
  }
}
```

### Controller with Typed Configuration

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType, ContextConfigType } from '@talosjs/controller';
import type { IResponse } from '@talosjs/http-response';

interface UserShowConfig extends ContextConfigType {
  params: { id: string };
  queries: { include?: string };
  payload: Record<string, never>;
  response: { user: { id: string; name: string; email: string } };
}

@Route.http({
  name: 'api.users.show',
  path: '/api/users/:id',
  method: 'GET',
  description: 'Get user by ID'
})
class UserShowController implements IController<UserShowConfig> {
  public async index(context: ContextType<UserShowConfig>): Promise<IResponse<UserShowConfig['response']>> {
    const { id } = context.params;
    
    // TypeScript knows params.id is a string
    const user = await this.findUser(id);
    
    return context.response.json({ user });
  }
}
```

### Accessing Context Services

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.products.create',
  path: '/api/products',
  method: 'POST',
  description: 'Create a product'
})
class ProductCreateController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const {
      logger,       // Logging service
      analytics,    // PostHog analytics
      cache,        // Redis or filesystem cache
      storage,      // File storage (Cloudflare R2, Bunny, filesystem)
      database,     // TypeORM database connection
      mailer,       // Email service (Resend, Nodemailer)
      request,      // HTTP request with parsed data
      response,     // HTTP response builder
      params,       // URL parameters
      payload,      // Request body
      queries,      // Query string parameters
      method,       // HTTP method
      header,       // Request headers
      files,        // Uploaded files
      ip,           // Client IP address
      host,         // Request host
      lang,         // Detected language
      user,         // Authenticated user (if any)
      app           // Application environment
    } = context;
    
    // Log the action
    logger.info('Creating product', { userId: user?.id });
    
    // Track analytics
    analytics?.capture({
      id: user?.id || 'anonymous',
      event: 'product_created'
    });
    
    // Cache the result
    await cache?.set('latest_product', payload, 300);
    
    return response.json({ success: true });
  }
}
```

## API Reference

### Interfaces

#### `IController<T>`

The main interface that all HTTP controllers must implement.

```typescript
interface IController<T extends ContextConfigType = ContextConfigType> {
  index: (context: ContextType<T>) => Promise<IResponse<T['response']>> | IResponse<T['response']>;
}
```

**Methods:**

##### `index(context: ContextType<T>): Promise<IResponse> | IResponse`

The main handler method called when a route is matched.

**Parameters:**
- `context` - The request context containing all services and request data

**Returns:** HTTP response (sync or async)

### Types

#### `ContextConfigType`

Configuration type for defining controller context shape.

```typescript
type ContextConfigType = {
  response: Record<string, unknown>;
} & RequestConfigType;
```

**Properties:**
- `response` - Shape of the response data
- `params` - URL parameter types (from RequestConfigType)
- `payload` - Request body types (from RequestConfigType)
- `queries` - Query string types (from RequestConfigType)

#### `ContextType<T>`

The full context object passed to controller methods.

```typescript
type ContextType<T extends ContextConfigType = ContextConfigType> = {
  logger: ILogger<Record<string, ScalarType>> | ILogger<LogsEntity>;
  analytics?: IAnalytics;
  cache?: ICache;
  storage?: IStorage;
  database?: IDatabase;
  mailer?: IMailer;
  app: {
    env: IAppEnv;
  };
  response: IResponse<T['response']>;
  request: IRequest<{ params: T['params']; payload: T['payload']; queries: T['queries'] }>;
  params: T['params'];
  payload: T['payload'];
  queries: T['queries'];
  method: HttpMethodType;
  header: Header;
  files: Record<string, IRequestFile>;
  ip: string | null;
  host: string;
  lang: LocaleInfoType;
  user: IUser | null;
};
```

#### `ControllerClassType`

Type for controller class constructors (used internally by the framework).

```typescript
type ControllerClassType = new (...args: any[]) => IController<any>;
```

## Advanced Usage

### Error Handling in Controllers

```typescript
import { Route } from '@talosjs/routing';
import { NotFoundException, BadRequestException } from '@talosjs/exception';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.orders.show',
  path: '/api/orders/:id',
  method: 'GET',
  description: 'Get order by ID'
})
class OrderShowController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { id } = context.params;
    
    if (!id) {
      throw new BadRequestException('Order ID is required');
    }
    
    const order = await this.orderRepository.findById(id);
    
    if (!order) {
      throw new NotFoundException('Order not found', {
        data: { orderId: id }
      });
    }
    
    return context.response.json({ order });
  }
}
```

### File Upload Handling

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.files.upload',
  path: '/api/files',
  method: 'POST',
  description: 'Upload a file'
})
class FileUploadController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { files, storage, user } = context;
    
    const uploadedFile = files['document'];
    
    if (!uploadedFile) {
      return context.response.exception('No file uploaded', { status: 400 });
    }
    
    // Validate file type
    if (!uploadedFile.isImage() && !uploadedFile.isPdf()) {
      return context.response.exception('Invalid file type', { status: 400 });
    }
    
    // Store the file
    const key = `users/${user?.id}/${uploadedFile.name}`;
    await storage?.putFile(key, uploadedFile.path);
    
    return context.response.json({
      uploaded: true,
      key,
      size: uploadedFile.size,
      type: uploadedFile.type
    });
  }
}
```

### Language-Aware Responses

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.greetings.get',
  path: '/api/greetings',
  method: 'GET',
  description: 'Get greeting in user language'
})
class GreetingController implements IController {
  private greetings: Record<string, string> = {
    en: 'Hello!',
    fr: 'Bonjour!',
    es: '¡Hola!',
    de: 'Hallo!'
  };

  public async index(context: ContextType): Promise<IResponse> {
    const { lang } = context;
    
    const greeting = this.greetings[lang.code] || this.greetings.en;
    
    return context.response.json({
      greeting,
      language: lang.code,
      region: lang.region
    });
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

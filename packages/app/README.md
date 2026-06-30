# @talosjs/app

Full-featured application framework for Bun — orchestrates routing, middleware pipelines, dependency injection, caching, logging, and WebSocket support in a modular architecture.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **HTTP Routing** - Decorator-based route definitions with parameter validation

✅ **WebSocket Support** - Real-time bidirectional communication with pub/sub

✅ **Middleware Pipeline** - Request/response processing with custom middleware

✅ **Caching Integration** - Built-in cache support for Redis and filesystem

✅ **Database Support** - TypeORM integration for PostgreSQL and SQLite

✅ **File Storage** - Storage abstraction for local, Cloudflare R2, and Bunny CDN

✅ **Logging** - Structured logging with terminal and SQLite outputs

✅ **Cron Jobs** - Scheduled task execution with timezone support

✅ **Analytics** - PostHog integration for user behavior tracking

✅ **Email Services** - Nodemailer and Resend integration for transactional emails

✅ **Static Files** - Serve static assets

✅ **SPA Support** - Single-page application routing support

## Installation

```bash
bun add @talosjs/app
```

## Usage

### Basic Application Setup

```typescript
import { App } from '@talosjs/app';
import { AppEnv } from '@talosjs/app-env';
import { TerminalLogger } from '@talosjs/logger';
import { UserModule } from './modules/UserModule';

const app = new App({
  modules: [UserModule],
  loggers: [TerminalLogger],
  env: new AppEnv('development')
});

await app.run();
```

### With Full Configuration

```typescript
import { App } from '@talosjs/app';
import { AppEnv } from '@talosjs/app-env';
import { TerminalLogger, SqliteLogger } from '@talosjs/logger';
import { RedisCache } from '@talosjs/cache';
import { PostHogAnalytics } from '@talosjs/analytics';
import { CloudflareStorage } from '@talosjs/storage';
import { TypeormPgDatabase } from '@talosjs/database';
import { ResendMailerAdapter } from '@talosjs/mailer';
import { AuthMiddleware } from './middleware/AuthMiddleware';
import { CleanupCron } from './cron/CleanupCron';
import { UserModule, ProductModule } from './modules';

const app = new App({
  modules: [UserModule, ProductModule],
  loggers: [TerminalLogger, SqliteLogger],
  analytics: PostHogAnalytics,
  cache: RedisCache,
  storage: CloudflareStorage,
  database: new TypeormPgDatabase(),
  mailer: ResendMailerAdapter,
  cronJobs: [CleanupCron],
  middlewares: [AuthMiddleware],
  env: new AppEnv(process.env.APP_ENV as 'development')
});

await app.run();
```

### Environment Variables

```bash
# Required
APP_ENV=development
PORT=3000
HOST_NAME=0.0.0.0

# Optional (based on services used)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
CACHE_REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/db
ANALYTICS_POSTHOG_PROJECT_TOKEN=your_posthog_key
```

### Creating a Module

```typescript
import { Route } from '@talosjs/routing';
import { UserController } from './UserController';
import { UserEntity } from './UserEntity';
import type { ModuleType } from '@talosjs/module';

export const UserModule: ModuleType = {
  controllers: [UserController],
  entities: [UserEntity],
  middlewares: [],
  cronJobs: [],
  events: [],
};
```

### Creating a Controller

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
    const users = await context.database?.open(UserEntity);
    
    return context.response.json({
      users: users || []
    });
  }
}
```

### WebSocket Routes

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.chat.connect',
  path: '/ws/chat',
  description: 'Real-time chat connection'
})
class ChatController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    await context.channel.subscribe();
    
    return context.response.json({
      connected: true
    });
  }
}
```

## API Reference

### Classes

#### `App`

Main application class that bootstraps and runs your web application.

**Constructor:**
```typescript
new App(config: AppConfigType)
```

**Methods:**

##### `init(): Promise<App>`

Initializes the application, validates environment variables, and prepares services.

**Returns:** Promise resolving to the App instance

##### `run(): Promise<App>`

Starts the HTTP server and begins listening for requests.

**Returns:** Promise resolving to the App instance

**Example:**
```typescript
const app = new App(config);
await app.init();
await app.run();
```

### Types

#### `AppConfigType`

```typescript
type AppConfigType = {
  modules: ModuleType[];
  loggers: LoggerClassType[];
  analytics?: AnalyticsClassType;
  cache?: CacheClassType;
  storage?: StorageClassType;
  mailer?: MailerClassType;
  rateLimiter?: RateLimiterClassType;
  cronJobs?: CronClassType[];
  database?: IDatabase | ITypeormDatabase;
  env: IAppEnv;
  spa?: Bun.HTMLBundle;
  middlewares?: MiddlewareClassType[] | SocketMiddlewareClassType[];
};
```

## Advanced Usage

### Single Page Application (SPA) Mode

```typescript
import { App } from '@talosjs/app';

const app = new App({
  // ... other config
  spa: Bun.html('./dist/index.html')
});

await app.run();
```

### Custom Middleware

```typescript
import { decorator } from '@talosjs/middleware';
import type { IMiddleware, ContextType } from '@talosjs/middleware';

@decorator.middleware()
class AuthMiddleware implements IMiddleware {
  public async handle(context: ContextType): Promise<ContextType> {
    const token = context.header.get('Authorization');
    
    if (!token) {
      context.response.exception('Unauthorized', { status: 401 });
      return context;
    }
    
    // Validate token and set user
    context.user = await this.validateToken(token);
    
    return context;
  }
}
```

### Cron Jobs

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';
import type { TimeZoneType } from '@talosjs/country';

class CleanupCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 1 hours';
  }
  
  public getTimeZone(): TimeZoneType | null {
    return 'Europe/Paris';
  }
  
  public async job(): Promise<void> {
    // Cleanup logic here
    console.log('Running cleanup...');
  }
}
```

### Accessing Services in Controllers

```typescript
@Route.http({
  name: 'api.products.create',
  path: '/api/products',
  method: 'POST',
  description: 'Create a new product'
})
class ProductCreateController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { logger, cache, storage, database, mailer, analytics } = context;
    
    // Use logger
    logger.info('Creating product', { userId: context.user?.id });
    
    // Use cache
    await cache?.set('product:latest', context.payload);
    
    // Use storage
    const file = context.files['image'];
    if (file) {
      await storage?.putFile('products/image.jpg', file.path);
    }
    
    // Use analytics
    analytics?.capture({
      id: context.user?.id || 'anonymous',
      event: 'product_created'
    });
    
    return context.response.json({ success: true });
  }
}
```

### Error Handling

```typescript
import { Exception } from '@talosjs/exception';
import { HttpStatus } from '@talosjs/http-status';

@Route.http({
  name: 'api.users.show',
  path: '/api/users/:id',
  method: 'GET',
  description: 'Get user by ID'
})
class UserShowController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { id } = context.params;
    
    const user = await this.userRepository.findById(id);
    
    if (!user) {
      return context.response.notFound('User not found', {
        data: { id }
      });
    }
    
    return context.response.json({ user });
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

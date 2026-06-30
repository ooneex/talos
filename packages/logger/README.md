# @talosjs/logger

Structured logging service with multiple output targets, log level filtering, contextual metadata, and dependency injection integration.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multiple Output Targets** - Terminal, SQLite database, Logtail, and Sentry/Better Stack

✅ **Colorized Terminal Output** - Beautiful, color-coded terminal logs with ANSI colors

✅ **Log Levels** - Support for ERROR, WARN, INFO, DEBUG, LOG, and SUCCESS levels

✅ **Exception Logging** - Log full exception details including stack traces to Sentry

✅ **Contextual Metadata** - Attach structured data (user, request, IP, path) to log entries

✅ **Customizable Display** - Toggle timestamps, log levels, arrows, and symbols

✅ **Container Integration** - Decorator-based registration with dependency injection

✅ **Query Logs** - Search and filter logs from SQLite database with pagination

## Installation

```bash
bun add @talosjs/logger
```

## Usage

### Terminal Logger

```typescript
import { TerminalLogger } from '@talosjs/logger';

const logger = new TerminalLogger();
await logger.init();

// Basic logging
logger.info('Application started');
logger.success('User created successfully');
logger.warn('Cache is nearly full');
logger.error('Failed to connect to database');
logger.debug('Processing request', { requestId: '123' });
logger.log('General log message');
```

### Logging with Data

```typescript
import { TerminalLogger } from '@talosjs/logger';

const logger = new TerminalLogger();

logger.info('User logged in', {
  userId: 'user-123',
  email: 'user@example.com',
  ip: '192.168.1.1'
});

logger.warn('Rate limit approaching', {
  current: 95,
  limit: 100,
  resetIn: '5 minutes'
});
```

### Logging Exceptions

```typescript
import { TerminalLogger } from '@talosjs/logger';
import { Exception } from '@talosjs/exception';

const logger = new TerminalLogger();

try {
  throw new Exception('Database connection failed', {
    status: 500,
    data: { host: 'localhost', port: 5432 }
  });
} catch (error) {
  if (error instanceof Exception) {
    logger.error(error);
    // Logs: message, status, data, and formatted stack trace
  }
}
```

### SQLite Logger

```typescript
import { SqliteLogger } from '@talosjs/logger';

const logger = new SqliteLogger({
  filename: './logs.db'
});

await logger.init();

// Logs are persisted to SQLite database
logger.info('Application started', {
  version: '1.0.0',
  environment: 'production'
});

logger.error('Critical error occurred', {
  module: 'payment',
  errorCode: 'PAY_001'
});
```

### Customizing Output

```typescript
import { TerminalLogger } from '@talosjs/logger';

const logger = new TerminalLogger();

// Minimal output (no arrow, timestamp, or level)
logger.info('Clean message', {}, {
  showArrow: false,
  showTimestamp: false,
  showLevel: false
});

// Use symbols instead of text levels
logger.success('Task completed', {}, {
  useSymbol: true  // Shows ✔ instead of [SUCCESS]
});
```

## API Reference

### Classes

#### `TerminalLogger`

Console-based logger with colorized output.

**Constructor:**
```typescript
new TerminalLogger()
```

**Methods:**

##### `init(): Promise<void>`

Initializes the logger. Call before logging.

##### `error(message: string | IException, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs an error message or exception. Outputs to stderr.

**Parameters:**
- `message` - Error message string or Exception object
- `data` - Optional data to attach to the log
- `options` - Display options

##### `warn(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs a warning message.

##### `info(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs an informational message.

##### `debug(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs a debug message.

##### `log(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs a general message.

##### `success(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void`

Logs a success message.

---

#### `SqliteLogger`

SQLite-based logger for persistent log storage.

**Constructor:**
```typescript
new SqliteLogger(options?: Bun.SQL.SQLiteOptions)
```

**Methods:**

Same interface as `TerminalLogger`, plus database query capabilities through `LogsRepository`.

---

#### `LogsRepository`

Repository for querying stored logs.

**Methods:**

##### `findByCriteria(criteria: FindByCriteriaType): Promise<FindByResultType>`

Search logs with filters.

**Parameters:**
- `criteria.level` - Filter by log level
- `criteria.userId` - Filter by user ID
- `criteria.email` - Filter by email
- `criteria.status` - Filter by HTTP status
- `criteria.method` - Filter by HTTP method
- `criteria.path` - Filter by request path
- `criteria.page` - Pagination page number
- `criteria.limit` - Results per page

**Example:**
```typescript
const result = await logsRepository.findByCriteria({
  level: ELogLevel.ERROR,
  limit: 50,
  page: 1
});

console.log(result.logs);      // Array of log entries
console.log(result.total);     // Total matching logs
console.log(result.totalPages); // Total pages
```

### Interfaces

#### `ILogger`

```typescript
interface ILogger<Data = Record<string, ScalarType>> {
  init: () => Promise<void> | void;
  error: (message: string | IException, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  warn: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  info: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  debug: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  log: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  success: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
}
```

### Types

#### `LoggerOptionsType`

```typescript
type LoggerOptionsType = {
  showArrow?: boolean;      // Show -> prefix (default: true)
  showTimestamp?: boolean;  // Show timestamp (default: true)
  showLevel?: boolean;      // Show [LEVEL] tag (default: true)
  useSymbol?: boolean;      // Use symbols like ✔, ✖ instead of text (default: false)
};
```

#### `LoggerClassType`

```typescript
type LoggerClassType =
  | (new (...args: unknown[]) => ILogger)
  | (new (options?: Bun.SQL.SQLiteOptions) => ILogger<LogsEntity>);
```

### Enums

#### `ELogLevel`

| Value | Description |
|-------|-------------|
| `ERROR` | Error level logs |
| `WARN` | Warning level logs |
| `INFO` | Informational logs |
| `DEBUG` | Debug level logs |
| `LOG` | General logs |
| `SUCCESS` | Success level logs |

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { TerminalLogger, SqliteLogger } from '@talosjs/logger';

const app = new App({
  loggers: [TerminalLogger, SqliteLogger],
  // ... other config
});

await app.run();
```

### Using in Controllers

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.users.create',
  path: '/api/users',
  method: 'POST',
  description: 'Create user'
})
class UserCreateController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { logger } = context;
    
    logger.info('Creating user', { email: context.payload.email });
    
    try {
      const user = await this.createUser(context.payload);
      logger.success('User created', { userId: user.id });
      return context.response.json({ user });
    } catch (error) {
      logger.error(error as IException);
      throw error;
    }
  }
}
```

### Custom Logger Implementation

```typescript
import { type ILogger, type LoggerOptionsType } from '@talosjs/logger';
import type { ScalarType } from '@talosjs/types';
import type { IException } from '@talosjs/exception';

class CloudLogger implements ILogger {
  public async init(): Promise<void> {
    // Initialize cloud logging service
  }

  public async error(
    message: string | IException,
    data?: Record<string, ScalarType>,
    options?: LoggerOptionsType
  ): Promise<void> {
    await this.sendToCloud('ERROR', message, data);
  }

  // Implement other methods...
}
```

### Decorator Registration

```typescript
import { decorator } from '@talosjs/logger';
import { container } from '@talosjs/container';

@decorator.logger()
class CustomLogger implements ILogger {
  // Implementation
}

// Logger is automatically registered with container
const logger = container.get(CustomLogger);
```

## Log Output Format

### Terminal Output Example

```
-> 2024-01-15 10:30:45 [INFO] Application started
   version: 1.0.0
   environment: production

-> 2024-01-15 10:30:46 [SUCCESS] Database connected
   host: localhost
   database: myapp

-> 2024-01-15 10:31:00 [ERROR] Request failed
   status: 500
   path: /api/users
   Stack Trace:
     1. processRequest
        at /app/src/server.ts:42:15
     2. handleError
        at /app/src/middleware.ts:28:10
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

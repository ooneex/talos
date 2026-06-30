# @talosjs/container

Dependency injection container built on Inversify -- manages service lifecycle with singleton, transient, and request-scoped registrations and automatic dependency resolution.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Dependency Injection** - Full DI container with automatic dependency resolution

✅ **Multiple Scopes** - Support for Singleton, Transient, and Request scopes via EContainerScope

✅ **Service Aliases** - Register services with string aliases for flexible resolution

✅ **Constant Values** - Store and retrieve constant values with string or symbol identifiers

✅ **Type-Safe** - Full TypeScript support with generic type parameters on get and getConstant

✅ **Inversify Based** - Built on the Inversify library with a shared singleton DI instance

✅ **Shared Instance** - Pre-configured global container instance exported for convenience

✅ **Service Lifecycle** - Add, get, has, and remove services and constants programmatically

## Installation

```bash
bun add @talosjs/container
```

## Usage

### Basic Usage

```typescript
import { container, EContainerScope } from '@talosjs/container';

class UserService {
  public getUsers() {
    return [{ id: 1, name: 'John' }];
  }
}

// Register as singleton (default)
container.add(UserService);

// Resolve instance
const userService = container.get(UserService);
console.log(userService.getUsers());
```

### Different Scopes

```typescript
import { container, EContainerScope } from '@talosjs/container';

class DatabaseConnection {
  public readonly id = Math.random();
}

class RequestLogger {
  public readonly id = Math.random();
}

class TemporaryWorker {
  public readonly id = Math.random();
}

// Singleton - same instance throughout app lifetime
container.add(DatabaseConnection, EContainerScope.Singleton);

// Request - new instance per request context
container.add(RequestLogger, EContainerScope.Request);

// Transient - new instance every time
container.add(TemporaryWorker, EContainerScope.Transient);

const db1 = container.get(DatabaseConnection);
const db2 = container.get(DatabaseConnection);
console.log(db1.id === db2.id); // true (singleton)

const worker1 = container.get(TemporaryWorker);
const worker2 = container.get(TemporaryWorker);
console.log(worker1.id === worker2.id); // false (transient)
```

### Using Aliases

```typescript
import { container } from '@talosjs/container';

class EmailService {
  public send(to: string, message: string) {
    console.log(`Sending to ${to}: ${message}`);
  }
}

container.add(EmailService);
container.addConstant('mailer', container.get(EmailService));

// Resolve by constant
const mailer = container.getConstant<EmailService>('mailer');
mailer.send('user@example.com', 'Hello!');
```

### Constants

```typescript
import { container } from '@talosjs/container';

// Store configuration values
container.addConstant('app.name', 'My Application');
container.addConstant('app.version', '1.0.0');
container.addConstant('app.config', {
  debug: true,
  maxConnections: 100
});

// Retrieve constants
const appName = container.getConstant<string>('app.name');
const config = container.getConstant<{ debug: boolean }>('app.config');

console.log(appName); // "My Application"
console.log(config.debug); // true
```

### With Decorators

```typescript
import { injectable, inject, container } from '@talosjs/container';

@injectable()
class Logger {
  public log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

@injectable()
class UserRepository {
  constructor(@inject(Logger) private readonly logger: Logger) {}
  
  public findAll() {
    this.logger.log('Finding all users');
    return [];
  }
}

container.add(Logger);
container.add(UserRepository);

const repo = container.get(UserRepository);
repo.findAll();
```

## API Reference

### Classes

#### `Container`

Main dependency injection container class.

**Constructor:**
```typescript
new Container()
```

**Methods:**

##### `add(target: Constructor, scope?: EContainerScope): void`

Registers a class with the container.

**Parameters:**
- `target` - The class constructor to register
- `scope` - Optional scope (default: `EContainerScope.Singleton`)

**Example:**
```typescript
container.add(MyService);
container.add(MyService, EContainerScope.Transient);
```

##### `get<T>(target: Constructor | string): T`

Resolves an instance from the container.

**Parameters:**
- `target` - Class constructor or alias string

**Returns:** The resolved instance

**Throws:** `ContainerException` if resolution fails

**Example:**
```typescript
const service = container.get(MyService);
const aliased = container.get<MyService>('myService');
```

##### `has(target: Constructor | string): boolean`

Checks if a service is registered.

**Parameters:**
- `target` - Class constructor or alias string

**Returns:** `true` if registered, `false` otherwise

**Example:**
```typescript
if (container.has(MyService)) {
  const service = container.get(MyService);
}
```

##### `remove(target: Constructor | string): void`

Removes a registered service.

**Parameters:**
- `target` - Class constructor or alias string

**Example:**
```typescript
container.remove(MyService);
```

##### `addConstant<T>(identifier: string | symbol, value: T): void`

Registers a constant value.

**Parameters:**
- `identifier` - String or symbol identifier
- `value` - The constant value

**Example:**
```typescript
container.addConstant('api.url', 'https://api.example.com');
```

##### `getConstant<T>(identifier: string | symbol): T`

Retrieves a constant value.

**Parameters:**
- `identifier` - String or symbol identifier

**Returns:** The constant value

**Throws:** `ContainerException` if not found

**Example:**
```typescript
const apiUrl = container.getConstant<string>('api.url');
```

##### `hasConstant(identifier: string | symbol): boolean`

Checks if a constant is registered.

**Parameters:**
- `identifier` - String or symbol identifier

**Returns:** `true` if registered, `false` otherwise

##### `removeConstant(identifier: string | symbol): void`

Removes a registered constant.

**Parameters:**
- `identifier` - String or symbol identifier

### Enums

#### `EContainerScope`

| Value | Description |
|-------|-------------|
| `Singleton` | Single instance shared across all requests |
| `Transient` | New instance created on every resolution |
| `Request` | New instance per request context |

### Exported Functions

#### `injectable()`

Decorator to mark a class as injectable (re-exported from Inversify).

#### `inject()`

Decorator to inject dependencies (re-exported from Inversify).

### Global Instance

```typescript
import { container } from '@talosjs/container';
```

A pre-configured global container instance is exported for convenience.

## Advanced Usage

### Custom Container Instance

```typescript
import { Container } from '@talosjs/container';

const myContainer = new Container();
myContainer.add(MyService);
```

### Service Factory Pattern

```typescript
import { container, injectable } from '@talosjs/container';

@injectable()
class ConfigService {
  private readonly config: Record<string, unknown> = {};
  
  public set(key: string, value: unknown): void {
    this.config[key] = value;
  }
  
  public get<T>(key: string): T {
    return this.config[key] as T;
  }
}

container.add(ConfigService);

const config = container.get(ConfigService);
config.set('database.host', 'localhost');
```

### Error Handling

```typescript
import { container, ContainerException } from '@talosjs/container';

try {
  const service = container.get(UnregisteredService);
} catch (error) {
  if (error instanceof ContainerException) {
    console.error('Service not found:', error.message);
  }
}
```

### Integration with Talos Framework

```typescript
import { container } from '@talosjs/container';
import { decorator } from '@talosjs/service';

@decorator.service()
class PaymentService {
  public processPayment(amount: number) {
    // Payment logic
  }
}

// Service is automatically registered by the decorator
const paymentService = container.get(PaymentService);
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

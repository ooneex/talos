# @talosjs/service

Service layer foundation with decorator-based registration and dependency injection for encapsulating business logic and domain operations.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Service Decorator** - Register service classes with the DI container using `@decorator.service()`

✅ **IService Interface** - Standard generic interface with an `execute(data?)` method for service implementations

✅ **Scope Control** - Configure singleton, transient, or request-scoped services via `EContainerScope`

✅ **ServiceClassType** - Type definition for service class constructors

✅ **Container Integration** - Seamless integration with `@talosjs/container` for automatic dependency resolution

## Installation

```bash
bun add @talosjs/service
```

## Usage

### Basic Service

```typescript
import { decorator, type IService } from '@talosjs/service';

interface SendEmailData {
  to: string;
  subject: string;
  body: string;
}

@decorator.service()
class EmailService implements IService<SendEmailData> {
  public async execute(data?: SendEmailData): Promise<void> {
    if (!data) return;
    
    await this.sendEmail(data.to, data.subject, data.body);
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Email sending logic
    console.log(`Sending email to ${to}: ${subject}`);
  }
}
```

### Resolving Services

```typescript
import { container } from '@talosjs/container';
import { EmailService } from './services/EmailService';

// Service is automatically registered by the decorator
const emailService = container.get(EmailService);

await emailService.execute({
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thank you for signing up.'
});
```

### Service with Dependencies

```typescript
import { decorator, type IService } from '@talosjs/service';
import { container } from '@talosjs/container';
import type { ILogger } from '@talosjs/logger';
import type { ICache } from '@talosjs/cache';

interface ProcessOrderData {
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
}

@decorator.service()
class OrderProcessingService implements IService<ProcessOrderData> {
  private readonly logger = container.get<ILogger>('logger');
  private readonly cache = container.get<ICache>('cache');

  public async execute(data?: ProcessOrderData): Promise<void> {
    if (!data) return;

    this.logger.info('Processing order', { orderId: data.orderId });

    // Process order items
    for (const item of data.items) {
      await this.processItem(item);
    }

    // Cache the result
    await this.cache.set(`order:${data.orderId}:status`, 'processed', 3600);

    this.logger.success('Order processed', { orderId: data.orderId });
  }

  private async processItem(item: { productId: string; quantity: number }): Promise<void> {
    // Item processing logic
  }
}
```

### Transient Services

```typescript
import { decorator, type IService } from '@talosjs/service';
import { EContainerScope } from '@talosjs/container';

@decorator.service(EContainerScope.Transient)
class RequestContextService implements IService {
  private readonly requestId = crypto.randomUUID();

  public async execute(): Promise<void> {
    console.log(`Request ID: ${this.requestId}`);
  }

  public getRequestId(): string {
    return this.requestId;
  }
}

// Each resolution creates a new instance
const service1 = container.get(RequestContextService);
const service2 = container.get(RequestContextService);
console.log(service1.getRequestId() !== service2.getRequestId()); // true
```

### Request-Scoped Services

```typescript
import { decorator, type IService } from '@talosjs/service';
import { EContainerScope } from '@talosjs/container';

@decorator.service(EContainerScope.Request)
class UserSessionService implements IService {
  private userId: string | null = null;

  public async execute(): Promise<void> {
    // Initialize session
  }

  public setUserId(id: string): void {
    this.userId = id;
  }

  public getUserId(): string | null {
    return this.userId;
  }
}
```

## API Reference

### Decorators

#### `@decorator.service(scope?)`

Decorator to register a service class with the DI container.

**Parameters:**
- `scope` - Container scope (default: `EContainerScope.Singleton`)
  - `Singleton` - Single instance shared across all requests
  - `Transient` - New instance created on every resolution
  - `Request` - New instance per request context

**Example:**
```typescript
import { decorator } from '@talosjs/service';
import { EContainerScope } from '@talosjs/container';

// Singleton (default)
@decorator.service()
class MySingletonService {}

// Transient
@decorator.service(EContainerScope.Transient)
class MyTransientService {}

// Request-scoped
@decorator.service(EContainerScope.Request)
class MyRequestService {}
```

### Interfaces

#### `IService`

Interface for service implementations.

```typescript
interface IService<T = Record<string, unknown>> {
  execute: (data?: T) => Promise<void>;
}
```

**Type Parameter:**
- `T` - The type of data the service accepts (default: `Record<string, unknown>`)

**Methods:**

##### `execute(data?: T): Promise<void>`

Execute the service's main logic.

**Parameters:**
- `data` - Optional data to process

**Returns:** Promise that resolves when execution completes

### Types

#### `ServiceClassType`

Type for service class constructors.

```typescript
type ServiceClassType = new (...args: any[]) => IService;
```

## Advanced Usage

### Service Composition

```typescript
import { decorator, type IService } from '@talosjs/service';
import { container } from '@talosjs/container';

interface CreateUserData {
  email: string;
  name: string;
}

@decorator.service()
class ValidationService {
  public validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

@decorator.service()
class NotificationService implements IService<{ userId: string; message: string }> {
  public async execute(data?: { userId: string; message: string }): Promise<void> {
    if (!data) return;
    // Send notification
  }
}

@decorator.service()
class UserCreationService implements IService<CreateUserData> {
  private readonly validationService = container.get(ValidationService);
  private readonly notificationService = container.get(NotificationService);

  public async execute(data?: CreateUserData): Promise<void> {
    if (!data) return;

    // Validate
    if (!this.validationService.validateEmail(data.email)) {
      throw new Error('Invalid email');
    }

    // Create user
    const userId = await this.createUser(data);

    // Notify
    await this.notificationService.execute({
      userId,
      message: 'Welcome to our platform!'
    });
  }

  private async createUser(data: CreateUserData): Promise<string> {
    // User creation logic
    return crypto.randomUUID();
  }
}
```

### Service with Controller Integration

```typescript
import { Route } from '@talosjs/routing';
import { decorator, type IService } from '@talosjs/service';
import { container } from '@talosjs/container';
import type { IController, ContextType } from '@talosjs/controller';

interface SubscriptionData {
  userId: string;
  plan: 'basic' | 'premium' | 'enterprise';
}

@decorator.service()
class SubscriptionService implements IService<SubscriptionData> {
  public async execute(data?: SubscriptionData): Promise<void> {
    if (!data) return;
    await this.processSubscription(data.userId, data.plan);
  }

  private async processSubscription(userId: string, plan: string): Promise<void> {
    // Subscription logic
  }
}

@Route.http({
  name: 'api.subscriptions.create',
  path: '/api/subscriptions',
  method: 'POST',
  description: 'Create a subscription'
})
class SubscriptionController implements IController {
  private readonly subscriptionService = container.get(SubscriptionService);

  public async index(context: ContextType): Promise<IResponse> {
    const { plan } = context.payload;
    const userId = context.user?.id;

    if (!userId) {
      return context.response.exception('Unauthorized', { status: 401 });
    }

    await this.subscriptionService.execute({ userId, plan });

    return context.response.json({ success: true });
  }
}
```

### Error Handling in Services

```typescript
import { decorator, type IService } from '@talosjs/service';
import { Exception } from '@talosjs/exception';

interface PaymentData {
  amount: number;
  currency: string;
  cardToken: string;
}

class PaymentException extends Exception {
  constructor(message: string, public readonly code: string) {
    super(message, { status: 400, data: { code } });
    this.name = 'PaymentException';
  }
}

@decorator.service()
class PaymentService implements IService<PaymentData> {
  public async execute(data?: PaymentData): Promise<void> {
    if (!data) {
      throw new PaymentException('Payment data required', 'MISSING_DATA');
    }

    if (data.amount <= 0) {
      throw new PaymentException('Invalid amount', 'INVALID_AMOUNT');
    }

    try {
      await this.processPayment(data);
    } catch (error) {
      throw new PaymentException('Payment processing failed', 'PROCESSING_ERROR');
    }
  }

  private async processPayment(data: PaymentData): Promise<void> {
    // Payment processing logic
  }
}
```

### Generic Service Pattern

```typescript
import { decorator, type IService } from '@talosjs/service';

interface CrudData<T> {
  action: 'create' | 'read' | 'update' | 'delete';
  entity: T;
  id?: string;
}

@decorator.service()
class GenericCrudService<T extends { id?: string }> implements IService<CrudData<T>> {
  constructor(private readonly entityName: string) {}

  public async execute(data?: CrudData<T>): Promise<void> {
    if (!data) return;

    switch (data.action) {
      case 'create':
        await this.create(data.entity);
        break;
      case 'read':
        await this.read(data.id);
        break;
      case 'update':
        await this.update(data.id, data.entity);
        break;
      case 'delete':
        await this.delete(data.id);
        break;
    }
  }

  private async create(entity: T): Promise<void> {
    console.log(`Creating ${this.entityName}:`, entity);
  }

  private async read(id?: string): Promise<void> {
    console.log(`Reading ${this.entityName}:`, id);
  }

  private async update(id?: string, entity?: T): Promise<void> {
    console.log(`Updating ${this.entityName}:`, id, entity);
  }

  private async delete(id?: string): Promise<void> {
    console.log(`Deleting ${this.entityName}:`, id);
  }
}
```

### Testing Services

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { container } from '@talosjs/container';
import { EmailService } from './EmailService';

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = container.get(EmailService);
  });

  test('should execute without data', async () => {
    await expect(emailService.execute()).resolves.toBeUndefined();
  });

  test('should execute with valid data', async () => {
    await expect(
      emailService.execute({
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test body'
      })
    ).resolves.toBeUndefined();
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
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team

# @talosjs/module

Module system for organizing application features into cohesive units -- groups controllers, entities, services, and middleware by domain.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Domain Grouping** - Organize controllers, entities, middleware, and more by feature domain

✅ **Controller Registration** - Bundle related controllers into a single module

✅ **Entity Binding** - Associate database entities with their owning module

✅ **Middleware Scoping** - Attach middleware to specific modules

✅ **Cron Jobs** - Optional cron job classes scoped to a module

✅ **Event Handling** - Optional pub/sub event classes per module

## Installation

```bash
bun add @talosjs/module
```

## Usage

### Defining a Module

```typescript
import type { ModuleType } from '@talosjs/module';
import { UserCreateController, UserListController } from './controllers';
import { UserEntity } from './entities';
import { AuthMiddleware } from './middleware';

const UserModule: ModuleType = {
  controllers: [UserCreateController, UserListController],
  entities: [UserEntity],
  middlewares: [AuthMiddleware],
  cronJobs: [],
  events: [],
};

export { UserModule };
```

### Full Example

```typescript
import type { ModuleType } from '@talosjs/module';

const OrderModule: ModuleType = {
  controllers: [OrderCreateController, OrderListController],
  entities: [OrderEntity, OrderItemEntity],
  middlewares: [OrderValidationMiddleware],
  cronJobs: [OrderCleanupCron],
  events: [OrderCreatedEvent, OrderShippedEvent],
};
```

## API Reference

### Types

#### `ModuleType`

```typescript
type ModuleType = {
  controllers: ControllerClassType[];
  entities: EntityClassType[];
  middlewares: MiddlewareClassType[];
  cronJobs: CronClassType[];
  events: PubSubClassType[];
};
```

**Fields:**
- `controllers` - Array of controller classes belonging to this module
- `entities` - Array of entity classes belonging to this module
- `middlewares` - Middleware classes to apply to this module
- `cronJobs` - Cron job classes scoped to this module
- `events` - Pub/sub event classes for this module

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

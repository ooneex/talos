---
name: talos-module
description: Backend module layout and foundational patterns for this codebase — the module directory structure plus the dependency-injection, exception, and TypeScript conventions with code examples.
when_to_use: Use when creating or navigating a module, or when wiring DI or exceptions.
user-invocable: false
---

# Module Architecture

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

## Module Structure

All code lives under `modules/<name>/`. A module owns one business domain:
```
modules/<name>/
  <name>.yml      # Module manifest — declares type: "module" (or api | microservice | design | spa | sdk)
  package.json    # Module package + its dependencies
  src/
    ai/           # AI integration classes — chats/, middlewares/, tools/ subfolders
    analytics/    # Analytics handler classes
    cache/        # Cache handler classes
    commands/     # CLI command classes (ICommand)
    controllers/  # HTTP + WebSocket controllers
    crons/        # Cron job classes
    databases/    # Database adapter + vector-database classes
    entities/     # TypeORM entity classes
    events/       # Pub/sub event classes
    flags/        # Feature flag classes
    loggers/      # Logger classes
    mailers/      # Mailer classes + JSX email templates
    middlewares/  # Middleware classes
    migrations/   # Versioned SQL migration files
    permissions/  # Permission classes
    queues/       # Queue classes
    repositories/ # Repository classes
    seeds/        # YAML seed data files
    services/     # Service classes
    storage/      # File storage classes
    translations/ # Translation classes + translations.yml dictionary
    utils/        # Utility/helper functions shared across the module
    workflows/    # Workflow classes — transitions/ subfolder for each step
  tests/          # Tests mirroring src/ structure
```

A module only contains the folders for the artifacts it actually uses — each `talos <artifact>:create` generator creates its `src/` subfolder (and the matching `tests/` one) on demand.

For front-end modules, see `talos-design` (design system) and `talos-spa` (single-page app). For typed config access, see `talos-env`.

## Dependency Injection

Every DI class is registered with a decorator (InversifyJS via `@talosjs/container`):
```typescript
import { inject } from "@talosjs/container";
import { decorator, type IService } from "@talosjs/service";

@decorator.service()
export class UserService implements IService {
  constructor(
    @inject(UserRepository)
    private readonly repository: UserRepository,
  ) {}

  public async execute(data?: ServiceDataType): Promise<void> {
    // business logic
  }
}
```
Every artifact follows one rule — `@decorator.<kind>()` on a class whose name ends with the matching PascalCase suffix:
`service()`/`Service`, `repository()`/`Repository`, `middleware()`/`Middleware`, `cron()`/`Cron`, `queue()`/`Queue`, `event()`/`Event`, `cache()`/`Cache`, `analytics()`/`Analytics`, `logger()`/`Logger`, `mailer()`/`Mailer`, `permission()`/`Permission`, `storage()`/`Storage`, `database()`/`Database`, `vectorDatabase()`/`VectorDatabase`, `featureFlag()`/`FeatureFlag`, `translation()`/`Translation`, `command()`/`Command`, `workflow()`/`Workflow`, `transition()`/`Transition`, plus the AI `chat()`/`Chat` and `tool()`/`Tool`. Controllers use controller-specific (route) decorators; TypeORM entities use entity decorators. Breaking the decorator/suffix contract throws `ContainerException` at startup.

## TypeScript Configuration

Strict TS: decorators (`emitDecoratorMetadata`); strict mode with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; ESNext modules with bundler resolution; target ES2022.

## Exception Handling

Domain exceptions extend `Exception` from `@talosjs/exception` with HTTP status codes + structured data. Throw typed exceptions from services rather than returning `null` or error codes:
```typescript
throw new UserNotFoundException({ userId });
```

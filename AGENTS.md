# AGENTS.md

This file provides guidance to AI coding agents and LLMs when working with code in this repository.

## Project Overview

{{NAME}} is a modular, enterprise-grade backend application built with TypeScript and Bun, powered by the **@talosjs** ecosystem. Code is organized into independent modules under `modules/`, each owning its own controllers, services, repositories, entities, migrations, and seeds.

## @talosjs Packages

The application is built on the `@talosjs` ecosystem. Prefer these packages over third-party alternatives, and always inject their services through the DI container rather than instantiating them directly.

### Application & Architecture

| Package | Description |
|---|---|
| `@talosjs/app` | Full-featured application framework for Bun — orchestrates routing, middleware pipelines, dependency injection, caching, logging, and WebSocket support |
| `@talosjs/app-env` | Environment detection and typed configuration — supports development, staging, production, and testing environments |
| `@talosjs/container` | Dependency injection container built on Inversify — manages service lifecycle with singleton, transient, and request scopes |
| `@talosjs/module` | Module system for organizing application features into cohesive units by domain |
| `@talosjs/service` | Service layer foundation with decorator-based registration for encapsulating business logic |
| `@talosjs/repository` | Data access layer with decorator-based repository registration and query abstraction |
| `@talosjs/command` | Command framework for building CLI commands with DI, argument parsing, and execution logging |
| `@talosjs/exception` | Structured exception handling with HTTP status mapping, typed error data, and JSON stack traces |
| `@talosjs/types` | Shared TypeScript type definitions and utility types used across the ecosystem |
| `@talosjs/utils` | General-purpose utilities — unique ID generation (nanoid), type guards, and common helpers |
| `@talosjs/cli` | Interactive CLI toolkit for scaffolding Talos projects, modules, controllers, services, and repositories with customizable templates |

### HTTP & Routing

| Package | Description |
|---|---|
| `@talosjs/routing` | Decorator-driven HTTP routing with path parameters, validation, permission guards, and named routes |
| `@talosjs/controller` | HTTP controller layer with decorator-based route binding and request/response handling |
| `@talosjs/middleware` | Middleware pipeline framework with decorator-based registration for HTTP and WebSocket events |
| `@talosjs/http-request` | HTTP request abstraction — URL parsing, query params, language detection, headers, file uploads |
| `@talosjs/http-request-file` | Multipart file upload handler with MIME validation, size constraints, and temp file management |
| `@talosjs/http-response` | HTTP response builder with a fluent API for status, headers, cookies, and streamed content |
| `@talosjs/http-header` | HTTP header parser with user agent detection, device identification, and content negotiation |
| `@talosjs/http-mimes` | Complete MIME type registry with TypeScript constants and lookup utilities |
| `@talosjs/http-status` | HTTP status code library with TypeScript enums (1xx–5xx) and classification helpers |
| `@talosjs/fetcher` | Lightweight HTTP client with typed headers and response parsing for external APIs |
| `@talosjs/url` | URL parsing and manipulation — query strings, path normalization, route parameter extraction |
| `@talosjs/rate-limit` | API rate limiting middleware with throttling strategies and per-client request quotas |

### Real-time

| Package | Description |
|---|---|
| `@talosjs/socket` | WebSocket server with room management, event broadcasting, and middleware integration |
| `@talosjs/socket-client` | WebSocket client with automatic reconnection, event handling, and typed message serialization |
| `@talosjs/event` | Event messaging for decoupled, event-driven communication with typed channels |

### Data & Persistence

| Package | Description |
|---|---|
| `@talosjs/database` | Database abstraction layer with TypeORM integration, connection pooling, and migrations |
| `@talosjs/entity` | Base entity classes and decorators for type-safe column mappings, relationships, and hooks |
| `@talosjs/migrations` | Database migration runner with versioned schema changes, rollback, and execution logging |
| `@talosjs/seeds` | Database seeding framework for fixtures and test datasets with idempotent operations |
| `@talosjs/cache` | High-performance caching with filesystem and Redis backends, TTL expiration, and auto-serialization |
| `@talosjs/storage` | File storage abstraction over local filesystem and cloud providers with a unified bucket API |
| `@talosjs/rag` | Retrieval-Augmented Generation toolkit with vector DB integration, embeddings, and semantic search |

### Auth & Access Control

| Package | Description |
|---|---|
| `@talosjs/auth` | Authentication framework with pluggable token- and session-based strategies |
| `@talosjs/jwt` | JWT toolkit using JOSE — generate, sign, verify, and decode tokens across multiple algorithms |
| `@talosjs/permission` | Fine-grained access control using CASL — ability-based permissions with role/resource scoping |
| `@talosjs/role` | Role-based authorization types and utilities for roles, hierarchies, and access levels |
| `@talosjs/user` | User identity types — profiles, credentials, roles, and account metadata |

### AI & Integrations

| Package | Description |
|---|---|
| `@talosjs/ai` | AI toolkit integrating 300+ models via OpenRouter with a unified text-generation and streaming API |
| `@talosjs/analytics` | PostHog-powered analytics for tracking user behavior and product events |
| `@talosjs/linear` | Linear project management integration — create, update, and query issues, teams, and projects |
| `@talosjs/mailer` | Transactional email via Nodemailer SMTP and Resend — templated emails with attachments |
| `@talosjs/payment` | Payment and pricing type definitions with currency handling and billing metadata |
| `@talosjs/youtube` | YouTube video downloader and metadata extraction for video info, thumbnails, and streams |
| `@talosjs/youtube-utils` | YouTube URL utilities for extracting video IDs and generating embed/watch URLs |

### Cross-cutting Services

| Package | Description |
|---|---|
| `@talosjs/logger` | Structured logging with multiple output targets, level filtering, and contextual metadata |
| `@talosjs/cron` | Cron job scheduler with timezone-aware scheduling, lifecycle management, and structured logging |
| `@talosjs/validation` | Type-safe validation powered by ArkType — schemas, custom rules, and JSON Schema generation |
| `@talosjs/feature-flag` | Define and evaluate feature flags as injectable, named, dynamically enabled toggles |
| `@talosjs/translation` | Internationalization with locale management, key resolution, and pluralization |
| `@talosjs/queue` | Background job queue powered by BullMQ and Redis — decorator-registered workers with retries, progress tracking, and job lifecycle management |
| `@talosjs/workflow` | Transition-based workflow engine — compose business processes from small, conditional, reversible steps with automatic rollback on failure |

### File & Document Formats

| Package | Description |
|---|---|
| `@talosjs/fs` | Async file system utilities for reading, writing, copying, and watching files and directories |
| `@talosjs/csv` | CSV file loader and parser with streaming and generator-based iteration |
| `@talosjs/json` | JSON file loader and parser with streaming and generator-based iteration |
| `@talosjs/yml` | YAML file loader and parser using Bun's built-in YAML support with generator-based streaming |
| `@talosjs/html` | HTML parsing and DOM manipulation powered by Cheerio with a jQuery-like API |
| `@talosjs/pdf` | PDF toolkit for generating, editing, merging, splitting, and converting documents to images |

### Reference Data & Helpers

| Package | Description |
|---|---|
| `@talosjs/color` | Curated color palette with hex values, human-friendly names, and TypeScript types |
| `@talosjs/country` | Country metadata — timezones, ISO codes, and multi-language localization |
| `@talosjs/currencies` | Currency dataset with ISO 4217 codes, symbols, names, and TypeScript types |
| `@talosjs/hour-utils` | Time unit conversion utilities for hours, minutes, seconds, and milliseconds |

## Development Commands

### Application

```bash
oo app:start   # Start Docker services and launch the app with hot reload
oo app:stop    # Stop all Docker services
```

### Generators

```bash
oo module:create --name <name>                              # Scaffold a new module
oo module:remove --name <name>                              # Remove a module and all references
oo issue:create --id <id> --title <title>                   # Create a YAML skeleton (non-interactive)
oo issue:create --id <id> --title <title> --module <name>  # Create inside a module
oo issue:create --interactive                               # Prompt for ID, title, and description
oo issue:create --interactive --module <name>               # Prompt + save inside a module
oo issue:pull                                               # Pull a Linear issue and save as YAML
oo issue:pull --id <id>                                     # Pull a specific issue by ID
oo issue:pull --id <id> --module <name>                     # Save issue into a module's issues/ directory
oo ai:create --name <Name> --module <name>                    # AI integration class
oo analytics:create --name <Name> --module <name>             # Analytics handler class
oo cache:create --name <Name> --module <name>                 # Cache handler class
oo command:create --name <Name> --module <name>               # CLI command class
oo controller:create --name <Name> --module <name>            # HTTP or WebSocket controller
oo cron:create --name <Name> --module <name>                  # Cron job class
oo database:create --name <Name> --module <name>              # Database adapter class
oo docker:create --name <service>                             # Add a Docker service to docker-compose.yml
oo entity:create --name <Name> --module <name>                # TypeORM entity class
oo flag:create --name <Name> --module <name>                  # Feature flag class
oo logger:create --name <Name> --module <name>                # Structured logger class
oo mailer:create --name <Name> --module <name>                # Mailer class and JSX email template
oo middleware:create --name <Name> --module <name>            # HTTP or WebSocket middleware class
oo permission:create --name <Name> --module <name>            # Permission class
oo pubsub:create --name <Name> --module <name>                # Pub/sub event class
oo queue:create --name <Name> --module <name>                 # BullMQ background job queue worker
oo repository:create --name <Name> --module <name>            # Repository class
oo service:create --name <Name> --module <name>               # Service class
oo storage:create --name <Name> --module <name>               # File storage class
oo vector-database:create --name <Name> --module <name>       # Vector database class
oo workflow:create --name <Name> --module <name>              # Workflow orchestrator (ordered, reversible transitions)
oo workflow:transition:create --name <Name> --module <name>   # Single workflow transition step
```

### Database

```bash
oo migration:create --module <name>   # Generate a timestamped migration file
oo migration:up                       # Run all pending migrations
oo migration:up --drop                # Drop database then migrate
oo seed:create --module <name>        # Generate a seed YAML file
oo seed:run                           # Run all seeds
oo seed:run --drop                    # Drop data then seed
```

### Code Quality

```bash
bun run fmt    # Format all source files with Biome
bun run lint   # Lint all modules with Biome and TypeScript
bun run test   # Run tests across all modules
```

### Release

```bash
oo release:create   # Detect unreleased commits, bump versions, update changelogs, tag, and push
```

## Architecture

### Module Structure

All application code lives under `modules/<name>/`. A module owns everything related to a single business domain:

```
modules/<name>/
  src/
    ai/           # AI integration classes
    analytics/    # Analytics handler classes
    cache/        # Cache handler classes
    controllers/  # HTTP and WebSocket controllers
    crons/        # Cron job classes
    databases/    # Database adapter classes
    entities/     # TypeORM entity classes
    events/       # Pub/sub event classes
    loggers/      # Logger classes
    mailers/      # Mailer classes and JSX email templates
    middlewares/  # Middleware classes
    migrations/   # Versioned SQL migration files
    permissions/  # Permission classes
    queues/       # Background job queue workers
    repositories/ # Repository classes
    seeds/        # YAML seed data files
    services/     # Service classes
    storage/      # File storage classes
    workflows/    # Workflow orchestrators (transitions/ subfolder per step)
  tests/          # Test files mirroring src/ structure
```

### Dependency Injection

The framework uses InversifyJS via `@talosjs/container`. Every class that participates in DI is registered with a decorator:

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

- **Services** → `@decorator.service()`, must end with `Service`
- **Repositories** → `@decorator.repository()`, must end with `Repository`
- **Middlewares** → `@decorator.middleware()`, must end with `Middleware`
- **Controllers** → registered via controller-specific decorators
- **Crons** → `@decorator.cron()`, must end with `Cron`

Breaking these naming conventions throws a `ContainerException` at startup.

### TypeScript Configuration

The project uses strict TypeScript:
- Decorators enabled (`emitDecoratorMetadata`)
- Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- Module system: ESNext with bundler resolution
- Target: ES2022

### Exception Handling

Domain exceptions extend `Exception` from `@talosjs/exception` and include HTTP status codes and structured data. Use typed exceptions from service methods rather than returning `null` or error codes:

```typescript
throw new UserNotFoundException({ userId });
```

### Environment Variables

Never read `process.env` directly. Inject `AppEnv` from `@talosjs/app-env` and access environment variables as typed properties:

```typescript
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { decorator, type IService } from "@talosjs/service";

@decorator.service()
export class StripeService implements IService {
  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
  ) {
    const secretKey = this.env.STRIPE_SECRET_KEY;
  }
}
```

## Agent Skills

This project ships with agent skills that scaffold, implement, and test artefacts in one command. Always run skills from the project root.

### Usage

```
/service:create --name=UserCreate --module=user
/controller:create --name=UserCreate --module=user --route.path=/users --route.method=POST
/commit
```

### Available Skills

#### Code Quality

| Skill | Description |
|---|---|
| `/optimize` | Enforce naming conventions, remove duplication, improve performance, and restructure tests across a module |
| `/commit` | Analyze staged changes, group them by module, and create properly scoped conventional commits |

#### Generators

| Skill | Description |
|---|---|
| `/ai:create` | Generate an AI integration class with `run` and `runStream` methods |
| `/analytics:create` | Generate an analytics handler class for tracking domain events |
| `/cache:create` | Generate a cache handler class with key and TTL management |
| `/command:create` | Generate a CLI command class implementing `ICommand` |
| `/controller:create` | Generate an HTTP or WebSocket controller with route, validation, roles, service, and pub/sub event |
| `/cron:create` | Generate a cron job class registered in the module |
| `/database:create` | Generate a database adapter class for raw queries |
| `/entity:create` | Generate a TypeORM entity class registered in `SharedModule` |
| `/flag:create` | Generate a feature flag class implementing `IFeatureFlag` |
| `/logger:create` | Generate a structured logger class with domain context |
| `/mailer:create` | Generate a mailer class and its JSX email template |
| `/middleware:create` | Generate an HTTP or WebSocket middleware class |
| `/permission:create` | Generate a permission class centralising access rules for a domain |
| `/pubsub:create` | Generate a pub/sub event class registered in the module |
| `/queue:create` | Generate a BullMQ background job queue worker with a typed handler and tests |
| `/repository:create` | Generate a repository class for typed data access |
| `/service:create` | Generate a service class implementing `IService` with business logic and tests |
| `/storage:create` | Generate a file storage class for asset management |
| `/vector-database:create` | Generate a vector database class for semantic search and RAG |
| `/workflow:create` | Generate a workflow orchestrator that runs ordered, reversible transitions |
| `/workflow:transition:create` | Generate a single workflow transition step with execute/rollback logic |

#### Database

| Skill | Description |
|---|---|
| `/migration:create` | Generate a migration file with `up`/`down` methods and structural tests |
| `/seed:create` | Generate a seed class and its YAML data file with idempotent insertion logic |

### Coding Conventions Enforced by Skills

- **Visibility modifiers** — every class method and property has explicit `public`, `private`, or `protected`
- **Naming suffixes** — types end with `Type`, interfaces start with `I`
- **Arrow functions** — used everywhere except class methods
- **No non-null assertions** — use default values or optional types instead
- **Dependency injection** — constructor injection via `@inject()` from `@talosjs/container`
- **Code hygiene** — no unused imports, no dead code, no bare `TODO` comments

## Commit Conventions

All commits must follow conventional commits format:

```
type(scope): Subject line
```

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `docs`: Documentation changes
- `style`: Code style changes
- `perf`: Performance improvements
- `build`: Build system changes
- `ci`: CI configuration changes
- `revert`: Revert previous commit

### Scope Rules

- Files under `modules/<name>/` → use the module name as scope (e.g. `user`, `product`)
- All other files → use `common`
- Scope is **required** — never omit it
- Subject: sentence-case, no trailing period, max 100 characters total

### Examples

```bash
feat(user): Add UserCreateController with auth middleware
fix(product): Handle null price in ProductRepository
chore(common): Update bun.lock dependencies
```

Use the `/commit` skill to automate this workflow.

### Commit Trailers

Do not add any `Co-Authored-By` trailer to commits.

## Naming Conventions

**Strictly enforced** by DI decorators — violations throw at startup:

| Artefact | Must end/start with | Example |
|---|---|---|
| Service | `Service` | `UserService` |
| Repository | `Repository` | `UserRepository` |
| Middleware | `Middleware` | `AuthMiddleware` |
| Cron | `Cron` | `ExpiredTokenCleanupCron` |
| Type alias | `Type` | `ServiceDataType` |
| Interface | `I` (prefix) | `IService` |

## Testing

- Test files mirror `src/` under `tests/` with `.spec.ts` suffix
- Run tests: `bun run test` (all modules) or `bun test tests` (inside a module)
- Every public method with logic must have at least one happy-path and one edge-case test
- Avoid trivial existence checks — test actual behavior
- Make tests deterministic: no random values, no time-dependent data

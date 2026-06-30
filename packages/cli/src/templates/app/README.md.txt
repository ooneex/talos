# {{NAME}}

A modular, enterprise-grade backend framework built with TypeScript and Bun, powered by the **@talos** ecosystem.

> For more details about the Talos framework, check the documentation at [https://docs.talos.com](https://docs.talos.com).

## Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://www.docker.com/) & Docker Compose

## Getting Started

### Install Dependencies

```bash
bun install
```

### Environment Configuration

The environment file is created automatically at `modules/app/.env.yml`. Edit it to fill in the required values.

### Start the App

Starts Docker services (if a `docker-compose.yml` is present) and launches the application with hot reload:

```bash
oo app:start
```

### Stop the App

Stops all Docker services:

```bash
oo app:stop
```

### Build the App

Compiles the application for production. Output is written to the `dist` directory:

```bash
oo app:build
```

---

## Modules

Modules are the core organizational unit. Each module lives under `modules/<name>/` and contains its own controllers, services, repositories, entities, migrations, and seeds.

### Why Modules?

A flat codebase quickly becomes hard to navigate and reason about as an application grows. Modules address this by enforcing **vertical slicing**: all code related to a single business domain (e.g. `user`, `order`, `billing`) lives together rather than being scattered across generic `controllers/`, `services/`, and `repositories/` folders.

**Benefits:**

- **Domain isolation** — changes to one feature cannot accidentally break another; each module is a self-contained unit with explicit boundaries.
- **Parallel development** — teams can work on separate modules without stepping on each other's code or creating merge conflicts in shared directories.
- **Independent deployment** — a module can be extracted into a standalone service later with minimal refactoring because its code is already co-located.
- **Simpler onboarding** — a new developer understands the scope of a feature by exploring a single directory instead of tracing imports across the whole project.
- **Scoped migrations & seeds** — database changes stay close to the entities they affect, making rollbacks and reviews straightforward.

**Good practices:**

- Name modules after business domains (`user`, `product`, `payment`), not technical layers (`controllers`, `helpers`).
- Keep modules small and focused. If a module grows beyond ~10 controllers or services, consider splitting it by sub-domain.
- Never import from another module's internal files directly — expose only what is needed through the module's public index.
- Register all entities in `SharedModule` (done automatically by `oo entity:create`) so the ORM has a single source of truth.
- Prefix route names with the module name (e.g. `api.user.create`) to avoid collisions across modules.

### Create a Module

Scaffolds a new module with all required structure, registers it in `AppModule`, adds its entities to `SharedModule`, and updates `tsconfig.json` path aliases and commitlint config:

```bash
oo module:create
oo module:create --name user
```

### Delete a Module

Removes a module and cleans up all references from `AppModule`, `SharedModule`, `tsconfig.json`, and commitlint config. The `app` and `shared` core modules cannot be removed:

```bash
oo module:remove
oo module:remove --name user
oo module:remove --name user --silent    # skip confirmation prompt
```

---

## Microservices

A microservice is a module that can also run, build, and deploy as a standalone HTTP service. It shares the same structure and conventions as a regular module, but additionally ships its own entrypoint, start hook, and Dockerfile so it can be hosted independently from the main `app` while still being reachable from it.

### Why Microservices?

Not every domain belongs inside the monolithic `app` process. CPU-heavy workloads, independently scaled features, or components with their own release cadence are better isolated into a dedicated service. A microservice keeps the developer experience of a module — same generators, same `SharedModule` entity registration, same path aliases — while giving the domain its own deployable unit.

**Benefits:**

- **Independent deployment & scaling** — the service has its own `Dockerfile` and `docker-compose` entry, so it can be built, released, and scaled separately from the main app.
- **Shared schema, isolated runtime** — its entities are still registered in `SharedModule`, so the ORM keeps a single source of truth, but the service runs in its own process.
- **Reachable from the app** — it is declared in `modules/app/app.yml` under `microservices:` with a `MICROSERVICE_<NAME>_URL` env var, so the API can call it without hardcoded URLs.
- **Same conventions** — controllers, middlewares, cron jobs, and events are wired into `AppModule` exactly like a regular module, so no new patterns to learn.

**Good practices:**

- Reach for a microservice only when a domain genuinely needs independent scaling or deployment — a regular module is simpler and cheaper to operate.
- Keep cross-service calls explicit and resilient: always read the target URL from its `MICROSERVICE_<NAME>_URL` env var and handle timeouts and failures gracefully.
- Communicate between services through HTTP or pub/sub events, never by sharing process state.
- Give each service its own host port in `docker-compose.yml` (assigned automatically) to avoid local collisions.
- Set the `MICROSERVICE_<NAME>_URL` value per environment in `modules/shared/.env.yml`.

### Create a Microservice

Scaffolds a microservice module with all the standard structure plus a standalone entrypoint (`src/index.ts`), an `OnAppStart.ts` start hook, and a `Dockerfile`. It sets the module's `type` to `microservice`, registers it in `AppModule` and its entities in `SharedModule`, declares it in `modules/app/app.yml` and `modules/shared/.env.yml`, adds a service to `modules/app/docker-compose.yml` with a distinct host port, and updates `tsconfig.json` path aliases and commitlint config:

```bash
oo microservice:create
oo microservice:create --name payment
```

### Delete a Microservice

Removes a microservice and cleans up all references from `AppModule`, `SharedModule`, `tsconfig.json`, and commitlint config, as well as its declarations in `modules/app/app.yml`, `modules/shared/.env.yml`, and the service in `modules/app/docker-compose.yml`. The `app` and `shared` core modules cannot be removed:

```bash
oo microservice:remove
oo microservice:remove --name payment
oo microservice:remove --name payment --silent    # skip confirmation prompt
```

---

## SPA

A SPA is a module that hosts a standalone single-page front-end application.

### Why SPA?

Some front-ends are richer than a server-rendered page — dashboards, admin panels, or client apps that own their own routing and state. A SPA keeps the developer experience of a module — same generators, same path aliases, same project tooling — while running as an independent Vite application with its own dev server port.

**Benefits:**

- **Independent front-end runtime** — the SPA builds and serves through Vite with its own `dev`/`build`/`preview` scripts, decoupled from the backend `app` process.
- **No backend coupling** — it is **not** registered into `AppModule` or `SharedModule`, so it never pulls server-side wiring into the API runtime.
- **Conflict-free dev server** — each SPA is assigned a distinct host port automatically, so multiple SPAs can run side by side without collisions.
- **Same conventions** — it lives under `modules/<name>/` with the same path aliases and tooling, so there are no new project patterns to learn.

**Good practices:**

- Keep the SPA focused on presentation and client state; reach the backend through HTTP APIs rather than importing server modules.
- Reuse the design system from a `design` module instead of duplicating UI primitives inside the SPA.
- Let the generator pick the dev server port to avoid collisions with other SPAs and services.

### Create a SPA

Scaffolds a SPA module from the `@talosjs/spa` skeleton. It sets the module's `type` to `spa`, pulls the front-end source, adds `dev`, `build`, and `preview` scripts on a free host port, and installs the SPA's dependencies. A SPA is **not** registered into `AppModule`, `SharedModule`, or the root `tsconfig.json` path aliases:

```bash
oo spa:create
oo spa:create --name dashboard
oo spa:create --name dashboard --design ui    # link to (or create) a design module
```

Use `--design` to choose the design module the SPA builds on. If the named design module already exists it is reused; otherwise it is scaffolded via `oo design:create`. The choice is recorded in the SPA's `<name>.yml` as a `design` field. When the flag is omitted, the generator prompts you to pick an existing design module or create a new one.

### Delete a SPA

Removes a SPA and cleans up any leftover references from `AppModule`, `SharedModule`, `tsconfig.json`, and commitlint config. Only modules whose `type` is `spa` can be removed this way, and the `app` and `shared` core modules cannot be removed:

```bash
oo spa:remove
oo spa:remove --name dashboard
oo spa:remove --name dashboard --silent    # skip confirmation prompt
```

### Create a SPA Feature

Scaffolds a complete feature slice inside an existing SPA module — a route, a page layout with its pending (skeleton), error, and not-found boundaries, and a pair of TanStack Query hooks (one query, one mutation). Installs `@tanstack/react-query` if it is not already present:

```bash
oo spa:feature:create
oo spa:feature:create --name Profile --module dashboard
oo spa:feature:create --name Profile --module dashboard --override    # overwrite an existing feature
```

The route is written to `modules/<module>/src/routes/<feature>.tsx`, the layouts to `modules/<module>/src/features/<feature>/layouts/`, and the hooks to `modules/<module>/src/features/<feature>/hooks/`. If the feature already exists you are prompted to override it unless `--override` is passed.

---

## Design

A design module hosts a shared UI design system — components, tokens, and styles — that SPAs and other front-ends build on instead of duplicating UI primitives.

### Why Design?

When several SPAs each ship their own buttons, inputs, and theme, the product drifts visually and fixes have to be applied in many places. A design module centralises those primitives into a single, reusable package so every front-end consumes one source of truth for look and feel.

**Benefits:**

- **Single source of truth for UI** — components, tokens, and styles live in one module that SPAs depend on rather than copy.
- **Visual consistency** — every front-end renders the same primitives, so the product looks coherent across surfaces.
- **No backend coupling** — like a SPA, a design module is **not** registered into `AppModule` or `SharedModule`, so it never pulls server-side wiring into the API runtime.
- **Shared by SPAs** — `oo spa:create --design <name>` links a SPA to a design module (creating it if needed), recording the choice in the SPA's `<name>.yml`.

**Good practices:**

- Keep the design module presentation-only — no business logic, no API calls.
- Version and document components so SPA authors know what is available without reading the source.
- Reuse the design module across SPAs instead of duplicating primitives inside each one.

### Create a Design Module

Scaffolds a design module from the `@talosjs/skeleton-design` source. It sets the module's `type` to `design`, replaces the default module class with the design system's own `src`, installs the design dependencies at the project root, and — like a SPA — leaves the module out of `AppModule`, `SharedModule`, and the root `tsconfig.json` path aliases:

```bash
oo design:create
oo design:create --name ui
```

### Delete a Design Module

Removes a design module and cleans up any leftover references from `AppModule`, `SharedModule`, `tsconfig.json`, and commitlint config. Only modules whose `type` is `design` can be removed this way, and the `app` and `shared` core modules cannot be removed:

```bash
oo design:remove
oo design:remove --name ui
oo design:remove --name ui --silent    # skip confirmation prompt
```

---

## SDK

A SDK module is a generated, browser-ready TypeScript client built from your controllers. It exposes a typed `sdk` object whose methods mirror each route — params, payload, queries, and response types included — so front-ends and external consumers call your API without hand-writing fetch logic or duplicating types.

### Why SDK?

Hand-written API clients drift from the server the moment a route changes — a renamed field or a new required parameter is only caught at runtime. Generating the SDK directly from the controllers keeps the client and the API in lockstep: the types come straight from each controller's route definition.

**Benefits:**

- **Typed end to end** — each method's input and output types are copied from the controller's `RouteType`, so the compiler catches mismatches.
- **Generated, not hand-maintained** — re-running the command picks up new controllers automatically; existing entries (including any hand-written request bodies) are preserved on regeneration.
- **Auth-aware** — routes guarded by roles require a `bearerToken` in the method input, reflecting the controller's access rules.
- **Browser-targeted build** — ships with a `bunup` config that builds an ESM, browser-targeted bundle with type declarations.

**Good practices:**

- Regenerate the SDK whenever you add or change controllers so the client stays in sync.
- Publish the built SDK as a versioned package (`@<app>/<name>`) for front-ends and third parties to consume.
- Implement the generated `// TODO` request bodies once, then let regeneration preserve them.

### Create a SDK

Generates a SDK module from a target module's controllers. The target is an `app`/`api` module (the SDK aggregates controllers from every backend `module` and `api` module) or a `microservice` module (the SDK exposes only that microservice's controllers). It creates a module marked `type: sdk`, writes one file per source module plus an aggregating `index.ts`, sets the package name to `@<app>/<name>`, adds a `bunup.config.ts`, installs the client runtime dependencies, and — like a SPA — leaves the module out of `AppModule` and `SharedModule`:

```bash
oo sdk:create                              # name "sdk", from the app module
oo sdk:create --name client --module app
oo sdk:create --name payment-sdk --module payment    # from a microservice
```

---

## Migrations

Migrations are versioned, incremental SQL scripts that evolve your database schema over time. Each migration lives in `modules/<name>/src/migrations/` and is executed in order, making every schema change reproducible, reviewable, and reversible.

### Why Migrations?

Manually altering a database in production is error-prone and leaves no audit trail. Migrations solve this by treating schema changes as code: they are committed to git, reviewed in pull requests, and applied the same way in every environment — local, staging, and production.

**Benefits:**

- **Reproducibility** — any developer can recreate the exact database state by running `oo migration:up` from scratch.
- **History & auditability** — every schema change is tied to a commit, a date, and an author, making it easy to understand when and why a column or table was added.
- **Safe deployments** — CI runs migrations before the application boots, catching schema errors before they reach production.
- **Rollback capability** — because changes are incremental and versioned, you can reason about what to undo if a deployment goes wrong.
- **Team coordination** — concurrent feature branches each generate their own migration file; the timestamp ordering ensures they are applied in the correct sequence when merged.

**Good practices:**

- One migration per logical change (e.g. add a table, add a column, add an index). Avoid bundling unrelated schema changes in a single file.
- Never edit a migration that has already been applied in any shared environment — create a new migration to amend it instead.
- Always write both `up` and `down` logic so migrations can be rolled back cleanly.
- Keep migrations idempotent where possible (e.g. `CREATE TABLE IF NOT EXISTS`) to prevent failures on re-runs.
- Test migrations against a real database in CI — schema errors are invisible to TypeScript's type checker.
- Avoid putting business logic or data transformations in migrations; keep them strictly structural (DDL) or use a dedicated seed for data.

### Create a Migration

Generates a timestamped migration file in `modules/<name>/src/migrations/` along with a test file and a `bin/migration/up.ts` runner (if not already present):

```bash
oo migration:create --module user
```

### Run Migrations

Executes migrations across all modules sequentially:

```bash
oo migration:up
oo migration:up --drop   # drop database before migrating
```

---

## Seeds

Seeds populate your database with initial or reference data — default roles, configuration values, demo content, or test fixtures. Each seed lives in `modules/<name>/src/seeds/` as a YAML file and is executed in order via the seed runner.

### Why Seeds?

Hardcoding initial data in migration files mixes structural changes with data concerns, making both harder to maintain. Seeds keep data separate from schema, so they can be re-run independently, updated without touching migrations, and disabled in environments where they are not needed.

**Benefits:**

- **Consistent starting state** — every developer and every environment boots with the same baseline data, eliminating "works on my machine" data discrepancies.
- **Readable data definitions** — YAML files are easy to read, diff, and review in pull requests without understanding SQL or TypeScript.
- **Repeatable setup** — onboarding a new developer or spinning up a fresh staging environment requires only `oo seed:run` instead of manual database operations.
- **Separation of concerns** — schema structure (migrations) and data content (seeds) evolve independently, reducing noise in both histories.
- **Safe resets** — `oo seed:run --drop` wipes and repopulates data without touching the schema, useful for resetting demo or test environments.

**Good practices:**

- Use seeds for **reference data** (roles, permissions, countries, currencies) and **development fixtures** (demo users, sample products). Avoid using them for production user data.
- Keep each seed file focused on a single entity or dataset — one file per table is a reasonable default.
- Write seeds so they are idempotent: inserting with `ON CONFLICT DO NOTHING` or checking for existence before inserting prevents errors on re-runs.
- Never depend on data inserted by another module's seed unless you control the execution order explicitly.
- Mirror your migration order: seed data for a table only after the migration that creates it has been applied.
- Avoid generating seeds with random or time-dependent values — deterministic data makes debugging and comparison across environments reliable.

### Create a Seed

Generates a YAML seed file in `modules/<name>/src/seeds/` along with a test file and a `bin/seed/run.ts` runner (if not already present):

```bash
oo seed:create --module user
oo seed:create --name initial-roles --module user
```

### Run Seeds

Executes seeds across all modules sequentially:

```bash
oo seed:run
oo seed:run --drop   # drop data before seeding
```

---

## Issues

Issues bridge your Linear project management board and your local codebase. Each issue is represented as a YAML file under `modules/<name>/issues/` and serves as the single source of truth for what is being built, why, and what "done" looks like.

**Requirements:** `linear.api_key` must be set in the environment for commands that talk to Linear (`issue:pull`, `issue:push`). Add it to `modules/app/.env.yml`:

```yaml
linear:
  api_key: lin_api_xxxxxxxxxx
  team_id: your_team_id       # optional — skips the team selection prompt in issue:push
```

### Issue YAML format

Every issue file follows a consistent schema:

```yaml
id: "OON-123"
title: "Add password reset flow"
state: "In Progress"
priority: "High"
description: |
  **Context**: Users currently have no way to recover a forgotten password.

  **Goal**: Implement a secure email-based password reset flow.

  **Acceptance Criteria**:
  - [ ] User can request a reset link via their email address
  - [ ] Link expires after 1 hour
  - [ ] Used links are invalidated immediately

  **Technical Notes**: Use JWT with short TTL; store a one-time token hash in the database.
labels:
  - "authentication"
  - "security"
comments:
  - author: "Alice"
    message: "Make sure the token is hashed before storage, not stored in plain text."
```

---

### Create an Issue

`issue:create` scaffolds a new issue YAML locally with a generated `[A-F]{3}-[0-9]{6}` placeholder identifier. No Linear connection is required — use this when you want to define and refine an issue offline before pushing it to Linear.

By default all fields are empty; pass `--interactive` to be prompted for each one:

```bash
oo issue:create                                                  # Empty skeleton in shared module
oo issue:create --title "Add password reset" --module user       # Pre-fill title, save to user module
oo issue:create --interactive                                    # Prompt for title, state, priority, labels, description
oo issue:create --interactive --module user                      # Interactive + save into modules/user/issues/
```

After writing the file the command optionally **improves the description with Claude** — rewrites a raw description into the structured *Context / Goal / Acceptance Criteria / Technical Notes* format and suggests labels derived from the description.

---

### Pull an Issue

`issue:pull` fetches an existing Linear issue by its identifier and saves it as `modules/<name>/issues/<identifier>.yml`. Use this to sync a ticket into your local workspace before starting implementation.

```bash
oo issue:pull                               # Prompt for issue ID
oo issue:pull --id OON-123                  # Pull a specific issue
oo issue:pull --id OON-123 --module user    # Save into modules/user/issues/
```

After saving the file the command optionally improves the description with Claude, the same as `issue:create`.

---

### Create and Plan an Issue

`/issue:plan` both creates and plans issues. Give it an existing issue (ID or path) **or** a free-form description of the work — when given a description it first scaffolds the issue with `oo issue:create` (inferring the module from your wording), then plans it. Planning restructures the issue into `context`, `goal`, `dod`, and `dependencies` fields, suggests labels, and splits large issues into ordered sub-issues that share the same structure and act as step-by-step implementation guides.

```
/issue:plan --id OON-123 --module user          # plan an existing issue
/issue:plan add password reset to the user area  # create from a description, then plan
```

---

### Push an Issue

`issue:push` reads a local YAML file and syncs it back to Linear. It detects whether the issue already exists and either **updates** it (title, description, state, priority, labels, new comments) or **creates** it from scratch in a team you select interactively.

```bash
oo issue:push                               # Prompt for issue ID
oo issue:push --id OON-123                  # Push modules/shared/issues/OON-123.yml
oo issue:push --id OON-123 --module user    # Push modules/user/issues/OON-123.yml
```

When creating a new issue (no matching Linear issue found), the command:
- Prompts you to select a target team
- Resolves or creates states and labels as needed
- Renames the local file to match the real Linear identifier once the issue is created

---

### Recommended Workflow

There are two natural entry points depending on whether the ticket originates in Linear or locally.

#### Linear-first (existing ticket)

Use this when a ticket is already created in Linear (e.g. by a product manager) and you are picking it up for implementation:

```
1. oo issue:pull --id OON-123 --module user
   → Downloads the issue YAML into modules/user/issues/OON-123.yml
   → Optionally improves the description with Claude

2. oo issue:push --id OON-123 --module user
   → Pushes any local edits (description improvements, label changes, comments) back to Linear
   → Updates the state to reflect current progress (e.g. "In Progress" → "In Review")
```

#### Offline-first (new idea or local spike)

Use this when you are defining a new feature locally before it exists in Linear:

```
1. oo issue:create --interactive --module user
   → Creates a YAML skeleton with a placeholder ID (e.g. ABD-042381)
   → Optionally improves the description with Claude and suggests labels

2. Refine the YAML: adjust title, state, priority, description, labels.

3. oo issue:push --id ABD-042381 --module user
   → Creates the issue in Linear under the team you select
   → Renames the local file to the real Linear identifier (e.g. OON-124.yml)
```

#### Day-to-day tips

- **Commit issue YAMLs alongside implementation commits** — the file is the authoritative record of what was planned and why. Future reviewers and `git blame` will thank you.
- **Use the description improvement step** — a well-structured description (Context / Goal / Acceptance Criteria) makes the issue easier to implement and review.
- **Keep state in sync** — before marking a PR ready for review, run `issue:push` to move the Linear ticket to "In Review" so the board reflects reality.
- **Never commit `linear.api_key`** — keep it in `modules/app/.env.yml` and ensure `.env.yml` is in `.gitignore`.

---

## Generators

### AI

Generates AI classes in `modules/<name>/src/ai/`. Each generator automatically installs `@talosjs/ai`:

```bash
oo ai:chat:create --name Support --module user        # src/ai/chats/SupportChat.ts
oo ai:tool:create --name WebSearch --module user       # src/ai/tools/WebSearchTool.ts
oo ai:middleware:create --name Audit --module user     # src/ai/middlewares/AuditMiddleware.ts
```

- **`ai:chat:create`** — a chat that extends `Chat` and declares its model, system prompts, tools, and middlewares.
- **`ai:tool:create`** — a function-calling tool implementing `ITool`, registered on a chat's `getTools()`.
- **`ai:middleware:create`** — a chat-lifecycle middleware implementing `IMiddleware`, registered on a chat's `getMiddlewares()`.

**Why:** Calling LLM APIs directly from controllers or services mixes infrastructure concerns with business logic and makes it hard to swap providers. Dedicated AI classes encapsulate the model, prompt strategy, tools, and configuration in one place.

**Benefits:** Provider-agnostic abstraction, centralised prompt management, easy to mock in tests, swap or upgrade models without touching business logic.

**Good practices:**
- One chat per distinct AI capability (e.g. `SupportChat`, `SummarizeChat`, `ModerationChat`) — avoid a single god class.
- Keep system prompts and model configuration inside the chat, not scattered across callers.
- Give each tool a precise `getDescription()` — the model relies on it to decide when to call the tool.
- Always handle rate-limit and timeout errors gracefully; never let an AI failure crash the request.

---

### Analytics

Generates an analytics handler class in `modules/<name>/src/analytics/<Name>Analytics.ts`. Automatically installs `@talosjs/analytics`:

```bash
oo analytics:create --name User --module user
```

**Why:** Sprinkling raw analytics calls (PostHog, Segment, etc.) throughout controllers couples business logic to a third-party SDK. A dedicated analytics class centralises event definitions and makes it trivial to change or disable the provider.

**Benefits:** Single source of truth for event names and properties, easy to stub in tests, provider can be swapped without touching controllers, events are discoverable by name.

**Good practices:**
- Name events after business actions, not UI interactions (e.g. `user.subscribed`, not `button.clicked`).
- Define event property shapes as TypeScript types inside the class.
- Always fire analytics asynchronously — never `await` a tracking call on the critical path.
- Keep one analytics class per domain concept so event ownership is clear.

---

### Cache

Generates a cache handler class in `modules/<name>/src/cache/<Name>Cache.ts`. Automatically installs `@talosjs/cache`:

```bash
oo cache:create --name User --module user
```

**Why:** Inline cache calls scattered through services create duplicated TTL values, inconsistent key formats, and make it hard to invalidate related entries. A dedicated cache class owns the key scheme and TTL policy for a given domain object.

**Benefits:** Consistent key naming, single place to update TTLs, easy to add cache warming or invalidation logic, simple to disable caching during tests.

**Good practices:**
- Prefix keys with the module and entity name to avoid collisions (e.g. `user:profile:{id}`).
- Define TTLs as named constants, not magic numbers.
- Always invalidate or update the cache when the underlying data changes — stale reads are harder to debug than cache misses.
- Use the cache for reads only; never store the primary copy of data in a cache.

---

### Controller

Generates an HTTP or WebSocket controller registered in the target module. Prompts for route name, path, and HTTP method if not provided. Automatically installs `@talosjs/controller`:

```bash
oo controller:create --name UserCreate --module user
oo controller:create --name UserCreate --module user --route.name api.user.create --route.path /api/users --route.method POST
oo controller:create --name UserSocket --module user --isSocket
```

**Why:** Controllers are the entry point for all HTTP and WebSocket interactions. Generating them with a consistent structure ensures route registration, validation, and error handling are set up correctly from the start.

**Benefits:** Automatic route registration in the module, consistent request/response patterns, clear separation between routing and business logic, WebSocket support out of the box.

**Good practices:**
- One controller per HTTP action (e.g. `UserCreateController`, `UserListController`) — avoid multi-action controllers.
- Controllers should be thin: validate input, call a service, return a response. No business logic inside.
- Prefix route names with the module (e.g. `api.user.create`) to avoid cross-module collisions.
- Use the generated route name constant everywhere instead of hardcoding URL strings.

---

### Cron

Generates a cron job class in `modules/<name>/src/crons/<Name>Cron.ts` and registers it in the module. Automatically installs `@talosjs/cron`:

```bash
oo cron:create --name Cleanup --module user
```

**Why:** Ad-hoc scheduled scripts outside the application are fragile, hard to monitor, and disconnected from the codebase. Cron classes live inside the module that owns the task, are registered with the DI container, and benefit from the same logging and error handling as the rest of the application.

**Benefits:** Centralised schedule management, full access to injected services and repositories, observable via the application logger, easy to disable per environment.

**Good practices:**
- Name cron classes after the task, not the schedule (e.g. `ExpiredTokenCleanupCron`, not `DailyCron`).
- Keep the cron class small — delegate actual work to a service method so the logic is testable independently.
- Always log the start, end, and outcome of each run.
- Make cron jobs idempotent: running the same job twice should not corrupt data.
- Disable background jobs in the `testing` environment to keep tests fast and deterministic.

---

### Database

Generates a database adapter class in `modules/<name>/src/databases/<Name>Database.ts`. Automatically installs `@talosjs/database`:

```bash
oo database:create --name User --module user
```

**Why:** Direct use of the ORM or raw query builder in services tightly couples business logic to the database layer. A database adapter wraps the connection and query interface, making it straightforward to configure per-module connections, switch drivers, or mock the database in tests.

**Benefits:** Consistent connection configuration per module, single place to add query logging or instrumentation, easier to test services in isolation by injecting a mock adapter.

**Good practices:**
- Use the database adapter for raw queries or bulk operations that fall outside the repository pattern.
- Never expose the raw ORM connection object outside the adapter class.
- Configure connection pool sizes and timeouts in one place inside the adapter.
- Prefer the repository pattern for standard CRUD; reach for the database adapter only when you need full query control.

---

### Docker

Adds a Docker service to `modules/app/docker-compose.yml`. Creates the file if it does not exist. Available services: `postgres`, `mysql`, `mongodb`, `redis`, `rabbitmq`, `nats`, `elasticsearch`, `clickhouse`, `minio`, `memcached`, `prometheus`, `grafana`, `jaeger`, `keycloak`, `vault`, `temporal`, `libretranslate`, `maildev`:

```bash
oo docker:create
oo docker:create --name postgres
oo docker:create --name redis
```

**Why:** Manually writing Docker Compose service definitions is repetitive, error-prone, and inconsistent across projects. The generator adds a pre-configured, production-ready service block so local infrastructure matches what the application expects.

**Benefits:** Consistent port mappings and environment variables across the team, generated health-check and volume definitions, no need to memorise image names or versions.

**Good practices:**
- Commit `docker-compose.yml` to source control so every developer uses identical service versions.
- Use named volumes for persistent data (databases) and anonymous volumes for ephemeral services (caches).
- Never use Docker Compose in production — it is a local development tool only.
- Pin image versions (e.g. `postgres:16`) rather than using `latest` to keep environments stable.
- Add service dependencies (`depends_on`) so the application container only starts after its databases are healthy.

---

### Entity

Generates a TypeORM entity class in `modules/<name>/src/entities/<Name>Entity.ts` and registers it in `SharedModule`. Automatically installs `@talosjs/entity`:

```bash
oo entity:create --name User --module user
oo entity:create --name User --module user --tableName users
```

**Why:** Entities are the single source of truth for your database schema. Generating them with consistent decorators and base class inheritance ensures that timestamps, soft deletes, and other cross-cutting concerns are applied uniformly across every table.

**Benefits:** Automatic registration in `SharedModule`, consistent column conventions (snake_case table names, `created_at`/`updated_at` timestamps), TypeScript types aligned with the database schema.

**Good practices:**
- Always specify the table name explicitly to avoid surprises from TypeORM's pluralisation logic.
- Keep entities as pure data structures — no business logic, no service calls inside entity methods.
- Add database indexes to columns used in frequent `WHERE` or `ORDER BY` clauses.
- Use enums for columns with a fixed set of values to enforce data integrity at the database level.
- Create a migration immediately after adding or modifying an entity so schema and code stay in sync.

---

### Feature Flag

Generates a feature flag class in `modules/<name>/src/feature-flag/<Name>FeatureFlag.ts`. Automatically installs `@talosjs/feature-flag`:

```bash
oo feature-flag:create --name DarkMode --module user
```

**Why:** Hard-coding `if (someCondition)` checks throughout the codebase scatters rollout logic and makes it impossible to toggle behaviour without a deploy. A dedicated feature flag class centralises each flag's key, description, and enablement rule behind the `IFeatureFlag` interface, so gating decisions live in one well-named place.

**Benefits:** Each flag has a stable key and human-readable description for discoverability, `isEnabled()` can resolve from env vars, config, or remote sources without touching call sites, and flags integrate with the DI container so dependencies can be injected.

**Good practices:**
- Keep the flag key stable once it ships — external systems and dashboards reference it.
- Implement `isEnabled()` to fail closed (return `false`) when its configuration source is unavailable.
- Remove the flag and its checks once a feature is fully rolled out to avoid long-lived dead branches.
- Write the description for a teammate who has never seen the feature — state what turning it on does.

---

### Logger

Generates a logger class in `modules/<name>/src/loggers/<Name>Logger.ts`. Automatically installs `@talosjs/logger`:

```bash
oo logger:create --name Audit --module user
```

**Why:** Using a global logger everywhere produces undifferentiated log output that is hard to filter by feature or severity. A dedicated logger class per domain adds a consistent context (module name, logger name) to every log entry, making logs actionable in production.

**Benefits:** Structured log entries with automatic context tags, easy to route specific loggers to different backends (file, Better Stack, etc.), no need to repeat context strings across every log call.

**Good practices:**
- Use the `Audit` logger for security-sensitive actions (login, permission changes) and the default app logger for operational events.
- Always log at the correct level: `debug` for internal state, `info` for significant business events, `warn` for recoverable problems, `error` for failures that need attention.
- Include relevant IDs (user ID, request ID) in every log entry to enable correlation across services.
- Never log sensitive data such as passwords, tokens, or payment details.

---

### Mailer

Generates a mailer class (`<Name>Mailer.ts`) and its JSX template (`<Name>MailerTemplate.tsx`) in `modules/<name>/src/mailers/`. Automatically installs `@talosjs/mailer`:

```bash
oo mailer:create --name Welcome --module user
```

**Why:** Composing email HTML inline or with raw string templates is brittle and hard to preview. The generator creates a typed mailer class paired with a JSX template, keeping email logic and presentation cleanly separated and type-safe.

**Benefits:** JSX template enables component reuse and design-system consistency across emails, typed mailer class prevents missing required variables, easy to test rendering without sending real emails.

**Good practices:**
- One mailer per transactional email type (e.g. `WelcomeMailer`, `PasswordResetMailer`).
- Never send emails synchronously on the request path — enqueue them via a job or pub/sub event.
- Always provide a plain-text fallback alongside the HTML template for clients that block images.
- Test email rendering in multiple clients (Gmail, Outlook, Apple Mail) before deploying — CSS support varies widely.
- Use the `testing` environment mailer backend to capture sent emails without delivering them.

---

### Middleware

Generates an HTTP or WebSocket middleware class registered in the target module. Automatically installs `@talosjs/middleware`:

```bash
oo middleware:create --name Auth --module user
oo middleware:create --name Auth --module user --isSocket
```

**Why:** Cross-cutting concerns like authentication, CORS, request logging, and input sanitisation should not live inside controllers. Middleware classes intercept requests before they reach a controller, keeping that logic reusable and independently testable.

**Benefits:** Reusable across multiple controllers within the module, auto-registered in the middleware pipeline, full access to injected services via DI, works identically for HTTP and WebSocket routes.

**Good practices:**
- Keep middleware single-purpose (e.g. `AuthMiddleware` only handles authentication, not rate limiting).
- Always call `next()` explicitly or return a response — never leave the pipeline hanging.
- Order matters: authentication middleware must run before authorisation middleware.
- Avoid heavy computation in middleware; defer expensive work to the service layer.
- Write unit tests that verify the middleware passes, blocks, and modifies requests as expected.

---

### Permission

Generates a permission class in `modules/<name>/src/permissions/<Name>Permission.ts`. Automatically installs `@talosjs/permission`:

```bash
oo permission:create --name User --module user
```

**Why:** Scattering permission checks across controllers and services leads to inconsistency and makes auditing access control difficult. A dedicated permission class per domain centralises all access rules for that domain in one reviewable place.

**Benefits:** All permissions for a domain are discoverable in a single file, easy to audit who can do what, permissions can be reused across multiple controllers without duplication, changes to access rules require touching only one class.

**Good practices:**
- Name permissions after the action and resource (e.g. `UserPermission` checks `canCreate`, `canUpdate`, `canDelete`).
- Always check permissions in middleware or the service layer — never in the entity or repository.
- Combine with roles (RBAC) for coarse-grained access and permissions for fine-grained control.
- Write tests that assert both allowed and denied cases for every permission rule.
- Never hardcode user IDs or emails inside permission logic; use roles and attributes instead.

---

### PubSub

Generates a pub/sub event class in `modules/<name>/src/events/<Name>Event.ts` and registers it in the module. Automatically installs `@talosjs/event`:

```bash
oo event:create --name UserCreated --module user
oo event:create --name UserCreated --module user --channel user-created
```

**Why:** Direct calls between modules create tight coupling that makes the codebase fragile and hard to extend. Pub/sub events decouple the publisher from the subscriber: the `user` module emits `UserCreated` without knowing or caring which other modules react to it.

**Benefits:** Loose coupling between modules, multiple subscribers can react to the same event independently, easy to add new reactions without modifying the publisher, events are named and typed so their contracts are explicit.

**Good practices:**
- Name events in the past tense (e.g. `UserCreated`, `OrderShipped`) to make clear they describe something that already happened.
- Keep event payloads small and serialisable — include IDs rather than full entity objects where possible.
- Subscribe in the module that owns the reaction, not in the module that owns the event.
- Make event handlers idempotent: the same event may be delivered more than once in failure scenarios.
- Log every event published and consumed to simplify debugging distributed flows.

---

### Queue

Generates a queue class in `modules/<name>/src/queues/<Name>Queue.ts`. Automatically installs `@talosjs/queue`:

```bash
oo queue:create --name Email --module user
```

**Why:** Running slow or unreliable work (sending email, generating reports, calling third-party APIs) inline on the request path makes responses slow and couples the outcome to a single attempt. A queue class moves that work off the critical path into a named, retryable background job.

**Benefits:** Faster responses by deferring heavy work, automatic retries on transient failures, back-pressure handling when producers outpace consumers, and a single place that owns each job's payload shape and processing logic.

**Good practices:**
- Name queues after the job they process (e.g. `EmailQueue`, `ReportGenerationQueue`), not the transport.
- Keep payloads small and serialisable — enqueue IDs and look data up in the worker rather than embedding large objects.
- Make job handlers idempotent: a job may be retried or delivered more than once.
- Always set sensible retry limits and a dead-letter strategy so poison messages do not loop forever.

---

### Rate Limit

Generates a rate limiter class in `modules/<name>/src/rate-limit/<Name>RateLimiter.ts`. Automatically installs `@talosjs/rate-limit`:

```bash
oo rate-limit:create --name Login --module user
```

**Why:** Throttling logic scattered across controllers and middleware is hard to reuse, tune, and test. A rate limiter class encapsulates a single throttling strategy (sliding window, token bucket, fixed window) behind the `IRateLimiter` interface, so the same policy can be applied consistently wherever it is injected.

**Benefits:** Each strategy lives in one discoverable class implementing `check`/`isLimited`/`reset`/`getCount`, the backing store (Redis, Upstash, in-memory) can be swapped without touching call sites, limits are testable in isolation, and the class is registered with the DI container so dependencies can be injected.

**Good practices:**
- Name limiters after what they protect (e.g. `LoginRateLimiter`, `PasswordResetRateLimiter`), not the algorithm.
- Build the limit key from a stable client identity (user ID, API key, or IP) and namespace it per limiter to avoid collisions.
- Fail open or closed deliberately — decide what happens when the backing store is unavailable, and document it.
- Return the full `RateLimitResultType` (`remaining`, `resetAt`) so callers can set `Retry-After` / `X-RateLimit-*` headers.
- Keep `check` side-effect-light and idempotent enough to call once per request.

---

### Repository

Generates a repository class for data access in `modules/<name>/src/repositories/<Name>Repository.ts`. Automatically installs `@talosjs/repository`:

```bash
oo repository:create --name User --module user
```

**Why:** Putting database queries directly in services mixes business logic with persistence concerns and makes services impossible to test without a database. The repository pattern isolates all data-access code behind a typed interface that can be mocked in tests.

**Benefits:** Services remain database-agnostic, all queries for an entity are discoverable in one class, easy to swap the underlying ORM or database without touching business logic, clean boundary for unit testing.

**Good practices:**
- One repository per entity (e.g. `UserRepository` owns all queries against the `users` table).
- Repositories should only contain query logic — no business rules, no validation, no event publishing.
- Use descriptive method names that reflect intent (e.g. `findActiveByEmail`, `findExpiredTokens`) rather than generic `find` with complex filter objects.
- Return domain objects or plain data — never expose raw ORM query builders to callers.
- Add pagination to any method that can return an unbounded number of rows.

---

### Service

Generates a service class in `modules/<name>/src/services/<Name>Service.ts`. Automatically installs `@talosjs/service`:

```bash
oo service:create --name User --module user
```

**Why:** Business logic scattered across controllers is impossible to test, reuse, or reason about. Services are the home of all business rules, orchestrating repositories, events, and other services in a single, testable unit.

**Benefits:** Business logic is testable without HTTP, reusable across multiple controllers or cron jobs, dependencies are explicit via constructor injection, easy to mock at the service boundary in integration tests.

**Good practices:**
- One service per aggregate or major business capability (e.g. `UserService` for user lifecycle, `BillingService` for payment flows).
- Services should call repositories for data, never query the database directly.
- Keep services stateless — all required data should come from method arguments or injected dependencies.
- Raise typed exceptions (e.g. `UserNotFoundException`) rather than returning `null` or error codes.
- A service method should do one thing; if a method grows beyond ~20 lines, consider extracting a helper or sub-service.

---

### Storage

Generates a file storage class in `modules/<name>/src/storage/<Name>Storage.ts`. Automatically installs `@talosjs/storage`:

```bash
oo storage:create --name Avatar --module user
```

**Why:** Coupling file upload logic directly to a specific provider (S3, Cloudflare R2, local filesystem) makes it painful to change backends and duplicates configuration across the codebase. A storage class abstracts the provider behind a consistent interface scoped to a specific asset type.

**Benefits:** Provider-agnostic uploads and reads, all storage configuration for an asset type in one class, easy to switch between local filesystem (development) and cloud storage (production) via environment variables, consistent file-naming and path conventions.

**Good practices:**
- Name storage classes after the asset they manage (e.g. `AvatarStorage`, `InvoiceStorage`).
- Always validate file type and size before passing to the storage class — never trust client-supplied content types.
- Generate deterministic, collision-resistant file names (e.g. `{userId}/{uuid}.{ext}`) rather than using the original filename.
- Never store the full URL in the database — store only the path or key and derive the URL at read time so it works across environments.
- Delete orphaned files when the associated entity is deleted to avoid unbounded storage growth.

---

### Vector Database

Generates a vector database class in `modules/<name>/src/databases/<Name>VectorDatabase.ts`. Automatically installs `@talosjs/rag`:

```bash
oo vector-database:create --name Knowledge --module user
```

**Why:** Semantic search and Retrieval-Augmented Generation (RAG) require storing and querying high-dimensional embeddings, which relational databases are not designed for. A dedicated vector database class encapsulates the embedding model, index configuration, and similarity-search logic in one place.

**Benefits:** Centralised embedding and retrieval strategy per knowledge domain, easy to swap vector backends (pgvector, Qdrant, etc.), consistent chunking and metadata conventions, decoupled from the LLM layer so both can evolve independently.

**Good practices:**
- One vector database class per knowledge domain (e.g. `KnowledgeVectorDatabase`, `ProductCatalogVectorDatabase`).
- Always store the source document ID alongside each embedding so retrieved chunks can be traced back to their origin.
- Use a consistent chunking strategy (fixed-size or sentence-boundary) within a class — mixing strategies pollutes the index.
- Re-index when the embedding model changes; embeddings from different models are not comparable.
- Cache frequently retrieved embeddings to avoid redundant model calls on hot queries.

---

### Translation

Generates a translation class in `modules/<name>/src/translations/<Name>Translation.ts` plus a sibling `translations.yml` dictionary. Automatically installs `@talosjs/translation`:

```bash
oo translation:create --name Dashboard --module user
```

**Why:** Scattering hard-coded UI strings throughout controllers and templates makes localization, copy changes, and pluralization rules impossible to manage. A translation class loads a `translations.yml` dictionary and resolves localized, interpolated, pluralized messages behind a single `trans()` call.

**Benefits:** All copy for a domain lives in one YAML file, locale fallback to `en` is automatic, `{{ param }}` interpolation and `count`-based pluralization are built in, and the dictionary is decoupled from the code that renders it.

**Good practices:**
- Name translation classes after the domain they cover (e.g. `DashboardTranslation`, `CheckoutTranslation`).
- Group keys with dot-notation nesting (`user.profile.name`) so related strings stay together.
- Always provide the `en` fallback for every key; add other locales as needed.
- Use sibling `<key>_plural` / `<key>_zero` keys for pluralization rather than branching in code.
- Keep one shared `translations.yml` per `translations/` folder — re-running the generator never overwrites it.

Once a dictionary exists, use the `/translation:translate` skill to fill in additional locales — and, when asked, to pull hardcoded UI strings out of the source into keys first. It translates **meaning-for-meaning** across every target language (preserving `{{ param }}` placeholders and pluralization siblings) rather than word by word. See **Available Skills → Localization** below.

---

### Workflow

Generates a workflow class in `modules/<name>/src/workflows/<Name>Workflow.ts` and its transitions under `modules/<name>/src/workflows/transitions/`. Automatically installs `@talosjs/workflow`:

```bash
oo workflow:create --name Order --module order                       # OrderWorkflow.ts
oo workflow:transition:create --name Approve --module order           # transitions/ApproveTransition.ts
```

- **`workflow:create`** — a state machine that declares the states an entity can be in (e.g. an order's `pending → paid → shipped → delivered`) and the transitions allowed between them.
- **`workflow:transition:create`** — a single transition class that encapsulates the guard and side effects of moving from one state to the next.

**Why:** Encoding state transitions as scattered `if (status === ...)` checks across services makes invalid transitions easy to introduce and impossible to audit. A workflow centralises the allowed states and transitions in one place, so illegal moves are rejected by construction.

**Benefits:** All valid states and transitions are discoverable in one class, illegal transitions are blocked rather than silently allowed, each transition's guard and side effects are isolated and testable, and the flow is documented by the code itself.

**Good practices:**
- Model one workflow per stateful entity (e.g. `OrderWorkflow`, `SubscriptionWorkflow`).
- Keep transition side effects (emails, events, payments) inside the transition class, not in the caller.
- Make transitions idempotent where they trigger external effects, so a retried transition does not double-charge or double-send.
- Persist the current state on the entity and let the workflow be the only thing that mutates it.

---

## Custom Commands

Beyond the built-in `oo` generators, each module can define its own CLI commands — one-off scripts, maintenance tasks, data backfills, or anything you want to run from the terminal with full access to the module's services and dependencies.

### Create a Command

Generates a command class in `modules/<name>/src/commands/<Name>Command.ts` (defaults to the `shared` module) along with its test, and creates the module's `bin/command/run.ts` runner if it does not already exist:

```bash
oo command:create
oo command:create --name Backfill --module user
oo command:create --name Backfill --module user --override    # overwrite an existing command
```

Each command implements `ICommand`, exposes a `getName()` (the identifier you invoke) and a `getDescription()`, and runs its logic in `run()`.

### Run a Command

Executes a custom command by its `getName()` identifier, searching every module that has a `bin/command/run.ts` runner. Any extra arguments after the command name are forwarded to the command:

```bash
oo command:run <command-name>
oo command:run user:backfill --since 2024-01-01
```

The runner reports per module whether the command was found and whether it succeeded, exiting non-zero if it is not found in any module or if a matching command fails.

---

## Claude

This project ships with a set of **Claude Code skills** — pre-built instruction sets that tell Claude exactly how to scaffold, implement, and test each type of artefact in this codebase. Skills eliminate the gap between "generate the files" and "ship working code": each skill runs the CLI generator, reads the output, completes the implementation, writes tests, and lints — all in one `/command`.

### Why Skills?

Running `oo service:create` creates a skeleton. A Claude skill does that *and* completes the business logic, writes a meaningful test suite, applies coding conventions, and formats the result — turning a 10-step workflow into a single prompt.

**Benefits:**
- Consistent code quality across every artefact, regardless of who wrote it
- Conventions (visibility modifiers, naming suffixes, DI patterns) are enforced automatically
- Tests are generated alongside implementation, not as an afterthought
- Skills chain together — `controller:create` automatically triggers `service:create` and `event:create`

### Setup

Before using skills, generate the `.claude/` directory with all skill files and the project `CLAUDE.md`:

```bash
oo claude:init
```

This writes `.claude/CLAUDE.md` and one `SKILL.md` per skill under `.claude/skills/<skill-name>/`. Re-run any time you upgrade the CLI to pick up new or updated skills. Commit the generated files so every team member gets the same skill definitions without running the command themselves.

### How to Use

Open Claude Code in the project root and type `/skill-name`. Claude will execute the full workflow described in the skill. You can pass arguments inline:

```
/service:create --name=UserCreate --module=user
/controller:create --name=UserCreate --module=user --route.path=/users --route.method=POST
/commit
```

If you omit arguments, Claude will prompt you for the required values.

> **Important:** Always run skills from the project root, not from inside a module directory.

### Available Skills

#### Code Quality

| Skill | Description |
|---|---|
| `/optimize` | Enforce naming conventions, remove duplication, improve performance, and restructure tests across a module |
| `/commit` | Analyze staged changes, group them by module, and create properly scoped conventional commits |

#### Generators

| Skill | Description |
|---|---|
| `/ai:chat:create` | Generate an AI chat class extending `Chat`, wired to `@talosjs/ai` |
| `/ai:tool:create` | Generate an AI function-calling tool implementing `ITool`, wired to `@talosjs/ai` |
| `/ai:middleware:create` | Generate an AI chat-lifecycle middleware implementing `IMiddleware`, wired to `@talosjs/ai` |
| `/analytics:create` | Generate an analytics handler class for tracking domain events via `@talosjs/analytics` |
| `/cache:create` | Generate a cache handler class with key and TTL management via `@talosjs/cache` |
| `/command:create` | Generate a CLI command class implementing `ICommand` via `@talosjs/cli` |
| `/controller:create` | Generate an HTTP or WebSocket controller with route type, validation, roles, service, and pub/sub event |
| `/cron:create` | Generate a cron job class registered in its module via `@talosjs/cron` |
| `/database:create` | Generate a database adapter class for raw queries via `@talosjs/database` |
| `/entity:create` | Generate a TypeORM entity class registered in `SharedModule` via `@talosjs/entity` |
| `/feature-flag:create` | Generate a feature flag class implementing `IFeatureFlag` via `@talosjs/feature-flag` |
| `/logger:create` | Generate a structured logger class with domain context via `@talosjs/logger` |
| `/mailer:create` | Generate a mailer class and its JSX email template via `@talosjs/mailer` |
| `/middleware:create` | Generate an HTTP or WebSocket middleware class registered in the module via `@talosjs/middleware` |
| `/permission:create` | Generate a permission class centralising access rules for a domain via `@talosjs/permission` |
| `/event:create` | Generate a pub/sub event class registered in the module via `@talosjs/event` |
| `/queue:create` | Generate a queue class for background jobs via `@talosjs/queue` |
| `/rate-limit:create` | Generate a rate limiter class implementing `IRateLimiter` via `@talosjs/rate-limit` |
| `/repository:create` | Generate a repository class for typed data access via `@talosjs/repository` |
| `/sdk:create` | Generate a typed, browser-ready SDK from a module's controllers |
| `/service:create` | Generate a service class implementing `IService` with business logic and tests |
| `/spa:feature:create` | Generate a SPA feature slice — route, layouts, and TanStack Query hooks |
| `/storage:create` | Generate a file storage class for asset management via `@talosjs/storage` |
| `/translation:create` | Generate a translation class with a `translations.yml` dictionary via `@talosjs/translation` |
| `/vector-database:create` | Generate a vector database class for semantic search and RAG via `@talosjs/rag` |
| `/workflow:create` | Generate a workflow state machine via `@talosjs/workflow` |
| `/workflow:transition:create` | Generate a workflow transition class via `@talosjs/workflow` |

#### Database

| Skill | Description |
|---|---|
| `/migration:create` | Generate a migration file with `up`/`down` methods, index guidance, and structural tests |
| `/seed:create` | Generate a seed class and its YAML data file with idempotent insertion logic |

#### Localization

| Skill | Description |
|---|---|
| `/translation:translate` | Translate and complete one or more modules' `translations.json` / `translations.yml` dictionaries into the target locales — optionally extracting hardcoded UI text into keys first — translating meaning-for-meaning, never word by word |

The skill orchestrates two agents installed by `oo claude:init`: **`translation-extractor`** pulls hardcoded user-facing text into dictionary keys and rewires it to `trans(...)`, and **`translation-translator`** fills every target locale from the `en` source while keeping `{{ placeholders }}` and pluralization siblings intact.

### Coding Conventions Enforced by Skills

All generator skills automatically apply the conventions defined in `/optimize`:

- **Visibility modifiers** — every class method and property has explicit `public`, `private`, or `protected`
- **Naming suffixes** — types end with `Type`, interfaces start with `I`
- **Arrow functions** — used everywhere except class methods
- **No non-null assertions** — use default values or optional types instead
- **Dependency injection** — constructor injection via `@inject()` from `@talosjs/container`
- **Code hygiene** — no unused imports, no dead code, no bare `TODO` comments

---

## Codex

The same skills and agents that power Claude Code are also generated for [Codex](https://openai.com/codex/), so the project's conventions and workflows are available regardless of which assistant you use.

```bash
oo codex:init
```

This writes `AGENTS.md` at the project root and one `SKILL.md` per skill under `.codex/skills/<skill-name>/`, plus the supporting agents under `.codex/agents/`. Re-run any time you upgrade the CLI to pick up new or updated skills, and commit the generated files so every team member shares the same definitions.

> Both `oo claude:init` and `oo codex:init` are offered interactively when an application is first created with `oo app:init`.

---

## Shell Completion

Installs Zsh tab completion for the `oo` (and `talos`) commands so command names and flags autocomplete in your terminal:

```bash
oo completion:zsh
```

This writes the completion functions to `~/.zsh/_oo` and `~/.zsh/_talos`. If they are not already loaded, add the following to your `.zshrc`:

```bash
fpath=(~/.zsh $fpath)
autoload -Uz compinit && compinit
```

---

## Release

```bash
oo release:create
```

Scans every `packages/` and `modules/` directory for unreleased conventional commits and, for each one that has them, performs a full release cycle automatically:

1. **Detects unreleased work** — finds the last git tag matching `<package-name>@*` and lists all conventional commits that have landed since then in that directory. Packages with no new commits are skipped.
2. **Bumps the version** in `package.json`:
   - `minor` (e.g. `1.2.0 → 1.3.0`) when any commit is of type `feat`
   - `patch` (e.g. `1.2.0 → 1.2.1`) for all other types (`fix`, `refactor`, `perf`, `docs`, `chore`, …)
3. **Updates `CHANGELOG.md`** with a dated version section. Commits are grouped into standard Keep-a-Changelog categories and linked to their SHA on the remote:

   | Commit type | Changelog category |
   |---|---|
   | `feat` | Added |
   | `fix` | Fixed |
   | `refactor`, `perf`, `style`, `docs`, `build`, `ci`, `chore` | Changed |
   | `revert` | Removed |

4. **Creates a release commit** — stages `package.json` and `CHANGELOG.md` then commits with the message `chore(release): <name>@<version>`.
5. **Creates an annotated git tag** — `<name>@<version>` (e.g. `@acme/user@1.3.0`).
6. **Prompts to push** — after all packages are processed, asks whether to push commits and tags to the remote. If confirmed, it also runs `bun install`, commits the updated `bun.lock`, and pushes everything.

> **Note:** This command requires conventional commits (`type(scope): Subject`). Non-conventional commits are silently ignored when building the changelog.

---

## Scripts

| Command | Description |
|---|---|
| `bun run fmt` | Format all source files with Biome |
| `bun run lint` | Lint all modules with Biome and TypeScript |
| `bun run test` | Run tests across all modules |
| `bun run commit` | Interactive conventional commit prompt |

---

## Learn More

For more details about the Talos framework — guides, package references, and the full CLI command list — check the documentation at [https://docs.talos.com](https://docs.talos.com).

---
name: module-create
description: Scaffold a complete backend business-domain module and complete its initial artifacts. Use when creating a whole new module (a new domain like `billing`, `catalog`, `order`) — not a single artifact. Runs talos module:create, then drives the per-artifact create skills to fill in the entity, repository, service, controller, and any other artifacts the domain needs.
allowed-tools: Bash(talos module:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<name>] [--destination=<app|module>]
disallowed-tools: AskUserQuestion
---

# Make Module

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Scaffold a new business-domain module, then complete the artifacts that give it
its first vertical slice. Follow the shared workflow in the `talos-scaffold`
skill (run-from-root, `--name`/`--module` inference, module registration,
lint/format, conventions); this skill covers only the module-level orchestration.

For a **single** artifact inside an existing module, use the matching
`<artifact>-create` skill instead. For a front-end design system or SPA, use
`talos design:create` / `talos spa:create` (see `talos-commands`).

## Steps

### 1. Infer the module name and run the generator

Derive the name from the business domain ("a module for invoices and billing" →
`billing`). Pass it in any casing; the CLI normalizes it. The `--destination`
arg controls which module the new one registers into: pass `app` when the
project has a single `api` module; when it has several `api`/`microservice`
modules, infer the destination from the request. Then run:

```bash
talos module:create --name=<name> --destination=<destination>
```

This creates `modules/<name>/` with the `src/` subfolders (see
`talos-module`), a mirrored `tests/`, a `<name>.yml` config (no `type:` ⇒
backend module), and a `<PascalName>Module.ts`, and registers it into its
destination (for `app`, into `AppModule`/`SharedModule`; otherwise into the
chosen `api`/`microservice` module).

### 2. Plan the first slice

From the user's request, list the artifacts the domain needs for its first
working slice. A typical CRUD domain needs, in dependency order:

1. **entity** — the domain data model.
2. **migration** — DDL for the entity's table/columns/relations.
3. **repository** — persistence for the entity (keep only the CRUD methods used).
4. **service** — the use case / business logic, injecting the repository.
5. **controller** — the HTTP (or WebSocket) endpoint, injecting the service.

Add only what the domain calls for — `permission`, `middleware`, `cron`,
`queue`, `event`, `mailer`, `cache`, `seed`, `command`, etc. Don't scaffold
artifacts the request doesn't need.

### 3. Generate and complete each artifact

For each planned artifact, invoke its `<artifact>-create` skill with
`--module=<name>` (e.g. `/entity-create`, `/repository-create`,
`/service-create`, `/controller-create`). Each skill runs its generator,
completes the class + test, and registers it. Respect the **dependency rule** —
controllers → services → repositories → entities, never the reverse (see
`talos-module`).

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing. Report the module created, the artifacts
filled in, and anything left as a stub for the user to flesh out.

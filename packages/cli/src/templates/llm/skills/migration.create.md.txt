---
name: migration-create
description: Generate a new database migration file, then complete the generated code. Use when creating a new database migration for schema changes using @talosjs/migrations.
allowed-tools: Bash(talos migration:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Migration

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a migration file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--module` inference, lint/format, and coding conventions); this skill covers only the migration-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the option below, then run:

```bash
talos migration:create --module=<module>
```

**Inferring options from the user's request:**

- There is no `--name` option — the migration file is named automatically from its version/timestamp. Capture the user's intent (the schema change) in step 2 when implementing `up()`/`down()`, not in a flag.

Also generates a `migrations.ts` root export file in the migrations directory.

### 2. Complete the migration

Read `modules/<module>/src/migrations/Migration<version>.ts`, then implement:

- `up()` with schema changes (create tables, add columns, create indexes, etc.)
- `down()` with the reverse operations to undo the migration

**Index rules — always index:**
- Foreign keys (e.g., `user_id`, `order_id`)
- `WHERE` fields (e.g., `email`, `slug`, `token`, `status`, `type`)
- `ORDER BY` fields (e.g., `created_at`, `updated_at`, `position`)
- Unique constraints (e.g., `email`, `slug`)
- Composite index when two fields are always queried together

Drop each index explicitly in `down()` before dropping the table or column it covers.

`down()` is executed by `talos migration:down` (roll back the latest) and `talos migration:down --version <version>` (roll back this specific migration), so it must reverse `up()` exactly — a rollback that leaves the schema dirty is a bug.

### 3. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.

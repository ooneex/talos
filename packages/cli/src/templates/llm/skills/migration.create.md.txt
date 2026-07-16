---
name: migration-create
description: Generate a new database migration file, then complete the generated code.
when_to_use: Use when creating a new database migration for schema changes using @talosjs/migrations.
model: sonnet
effort: medium
allowed-tools: Bash(talos migration:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--module=<module>]
---

# Make Migration

> **Run autonomously — do not ask the user questions;** pick the recommended option and proceed. **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` — check both roots before assuming a path is missing.

Generate a migration file, then complete the implementation. Follow the shared `talos-scaffold` skill workflow (run-from-root, `--module` inference, lint/format, coding conventions); this covers only the migration-specific parts.

## Steps

### 1. Run the generator

```bash
talos migration:create --module=<module>
```

There is no `--name` option — the file is named automatically from its version/timestamp. Capture the schema-change intent in step 2's `up()`/`down()`, not in a flag. Also generates a `migrations.ts` root export file in the migrations directory.

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

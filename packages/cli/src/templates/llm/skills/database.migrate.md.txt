---
name: database-migrate
description: Run the database migration and seed lifecycle — apply pending migrations, roll back, reseed, and verify the schema matches the entities.
when_to_use: Use when applying or reverting migrations, troubleshooting a failed migration, syncing an entity change into the database, or running seeds. To author a new migration file, use migration-create first.
model: sonnet
effort: high
---

# Database Migrate

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Drive the database lifecycle with the `talos` commands. This is the *runtime* workflow — scaffold new migration/seed files with `migration-create` / `seed-create`, then come back here to apply them.

**Rules that apply throughout:**
- **Run every command from the monorepo root**, never from inside a package.
- **Docker services (Postgres, Redis, …) must be up.** A connection refused means Docker isn't running — start it with `talos app:start`.
- **`--drop` is destructive (dev only).** It wipes all data; never run it against a shared or production database, and confirm before any `--drop`.
- **Never edit an already-applied migration in place on a shared database** — add a new corrective migration instead.

## Apply migrations

```bash
talos migration:up            # run all pending migrations
talos migration:up --drop     # DROP the database first, then run every migration (destructive — dev only)
```

## Roll back migrations

```bash
talos migration:down                      # roll back only the most recently applied migration
talos migration:down --version <version>  # roll back the single migration with that version
```

Each rollback runs the migration's `down()` in a transaction and removes its row from the `migrations` table, so a later `talos migration:up` re-applies it. `<version>` is the timestamp in the migration's `getVersion()` (the number in the `Migration<version>.ts` filename). Rollback relies on a correct `down()` — if `down()` doesn't exactly reverse `up()`, prefer a new corrective migration over a rollback on shared data. Use `--version` instead of `--drop` when you only need to undo one migration.

## Seed data

```bash
talos seed:run                # run all seeds (idempotent)
talos seed:run --drop         # clear seeded data first, then reseed
```

## Sync an entity change into the schema

When you change an entity's columns/relations:

1. `/migration-create --module=<module>` — scaffold a timestamped migration.
2. Implement `up()` with the DDL for the change and `down()` to reverse it exactly (drop what `up` adds). Match the entity's column types, nullability, and lengths — an entity column without `nullable` must be `NOT NULL` in the migration, and vice-versa. An asymmetric/irreversible `down()` is a bug.
3. `talos migration:up` to apply it.
4. Re-run the tests to confirm the entity and schema agree.

## Verify and troubleshoot

- **Verify** — after applying, run `talos monorepo:run --commands=test` (repository/entity tests fail fast on a schema mismatch). Confirm every entity column has a matching migrated column with the same nullability/length.
- **Migration failed mid-way** — read the error, fix the offending `up()`, and in development re-run with `talos migration:up --drop` to rebuild from a clean state.
- **Error stems from application code** (entity decorators, DI) — hand off to the `debug` skill.

---
name: database-migrate
description: Run the database migration and seed lifecycle — apply pending migrations, roll back, reseed, and verify the schema matches the entities. Use when applying or reverting migrations, troubleshooting a failed migration, syncing an entity change into the database, or running seeds. To author a new migration file, use migration-create first.
disallowed-tools: AskUserQuestion
---

# Database Migrate

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Drive the database lifecycle with the `talos` commands. This is the *runtime*
workflow — to scaffold a new migration or seed file use `migration-create` /
`seed-create`, then come back here to apply it.

## Run from the project root

Run every command from the **monorepo root**, never from inside a package.
Docker services (Postgres, Redis, …) must be up — start them with `talos app:start`
if a connection fails.

## Apply migrations

```bash
talos migration:up            # run all pending migrations
talos migration:up --drop     # DROP the database first, then run every migration (destructive — dev only)
```

`--drop` wipes all data; never use it against a shared or production database.
Prefer plain `talos migration:up` and confirm before any `--drop`.

## Roll back migrations

```bash
talos migration:down                      # roll back only the most recently applied migration
talos migration:down --version <version>  # roll back the single migration with that version
```

Each rollback runs the migration's `down()` inside a transaction and removes its
row from the `migrations` table, so a later `talos migration:up` re-applies it. The
`<version>` is the timestamp in the migration's `getVersion()` (the number in the
`Migration<version>.ts` filename). Rolling back relies on a correct `down()` — if
`down()` doesn't exactly reverse `up()`, prefer a new corrective migration over a
rollback on shared data.

## Seed data

```bash
talos seed:run                # run all seeds (idempotent)
talos seed:run --drop         # clear seeded data first, then reseed
```

## Sync an entity change into the schema

When you change an entity's columns/relations:

1. `/migration-create --module=<module>` — scaffold a timestamped migration.
2. Implement `up()` with the DDL for the change and `down()` to reverse it
   exactly (drop what `up` adds). Match the entity's column types, nullability,
   and lengths — an entity column without `nullable` must be `NOT NULL` in the
   migration, and vice-versa.
3. `talos migration:up` to apply it.
4. Re-run the tests to confirm the entity and schema agree.

## Verify and troubleshoot

- **Verify** — after applying, run `talos monorepo:run --commands=test` (repository/entity tests fail
  fast on a schema mismatch). Confirm every entity column has a matching
  migrated column with the same nullability/length.
- **Migration failed mid-way** — read the error, fix the offending `up()`, and
  in development re-run with `talos migration:up --drop` to rebuild from a clean
  state. Never edit an already-applied migration in place on a shared database —
  add a new corrective migration instead.
- **Revert a single migration** — `talos migration:down --version <version>` runs its
  `down()` and lets you fix and re-apply it with `talos migration:up`. Use this
  instead of `--drop` when you only need to undo one migration.
- **Connection refused** — Docker isn't running; `talos app:start`.
- **`down()` doesn't reverse `up()`** — an irreversible or asymmetric migration
  is a bug; make `down()` undo exactly what `up()` did.

If a migration error stems from application code (entity decorators, DI), hand
off to the `debug` skill.

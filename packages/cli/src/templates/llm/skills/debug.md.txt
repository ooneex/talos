---
name: debug
description: Diagnose and fix a failing test, runtime exception, or startup error in an @talosjs app. Reads the stack trace, traces it to the root cause through the DI / exception / migration patterns, fixes it, and re-verifies. Use when something is broken — a test fails, the app won't boot, a request throws — not for new features or convention cleanups.
disallowed-tools: AskUserQuestion
---

# Debug

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Find the root cause of a failure and fix it — don't patch the symptom. This
workflow is for things that are broken; for convention cleanups use `optimize`,
for review use `review`.

## Run from the project root

Run every command from the **monorepo root**.

## Steps

### 1. Reproduce

Get the failure in front of you with the exact command:

```bash
talos monorepo:run --commands=test            # or scope to one file: bun test modules/<module>/tests/...
talos app:start            # for boot / runtime failures
```

Capture the full error and stack trace. Don't theorize before you've seen it.

### 2. Read the trace to the root cause

Start at the deepest @talosjs frame and work outward. Common signatures:

- **`ContainerException` at startup** — a DI class is missing its
  `@decorator.*()`, missing its required suffix, or not registered in the
  module's `ModuleType` (controllers/entities/middlewares/crons/events must be
  listed; services/repositories auto-register via their decorator). See
  `talos-module` and `talos-scaffold`.
- **A typed `Exception` subclass** — read its structured `data`; the throw site
  is the real source. Trace which service threw and why, not just where it
  surfaced.
- **Migration / schema error** — entity and database disagree (nullability,
  length, missing column/table). Hand the schema lifecycle to `database-migrate`.
- **`undefined` / null access** — a dependency wasn't injected, or
  `noUncheckedIndexedAccess` exposed an unguarded index/optional.
- **Test failure** — distinguish a real regression from a stale test; read the
  assertion and the code it covers before changing either.

### 3. Fix the cause

Make the smallest change that addresses the root cause, following project
conventions (apply the `optimize` skill's rules). Don't widen types to `any`,
swallow exceptions, or delete the assertion to make a test pass — fix the
underlying defect. If the test itself was wrong, fix the test and say so.

### 4. Verify

```bash
talos monorepo:check
```

Confirm the original failure is gone and nothing else broke. Report the root
cause, the fix, and how you verified it.

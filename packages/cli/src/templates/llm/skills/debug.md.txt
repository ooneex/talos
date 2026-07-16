---
name: debug
description: Diagnose and fix a failing test, runtime exception, or startup error in an @talosjs app. Reads the stack trace, traces it to the root cause through the DI / exception / migration patterns, fixes it, and re-verifies.
when_to_use: Use when something is broken — a test fails, the app won't boot, a request throws — not for new features or convention cleanups.
model: opus
effort: high
agent: general-purpose
context: fork
---

# Debug

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Find the root cause of a failure and fix it — don't patch the symptom. For convention cleanups use `optimize`; for review use `review`. **Run every command from the monorepo root.**

## 1. Reproduce

Reproduce the failure with the exact command and capture the full error and stack trace. Don't theorize before you've seen it.

```bash
talos monorepo:run --commands=test   # or one file: bun test modules/<module>/tests/...
talos app:start                       # for boot / runtime failures
```

## 2. Read the trace to the root cause

Start at the deepest @talosjs frame and work outward. Common signatures:

- **`ContainerException` at startup** — a DI class is missing its `@decorator.*()`, missing its required suffix, or not registered in the module's `ModuleType` (controllers/entities/middlewares/crons/events must be listed; services/repositories auto-register via their decorator). See `talos-module`, `talos-scaffold`.
- **A typed `Exception` subclass** — read its structured `data`; the throw site is the real source. Trace which service threw and why, not just where it surfaced.
- **Migration / schema error** — entity and database disagree (nullability, length, missing column/table). Hand the schema lifecycle to `database-migrate`.
- **`undefined` / null access** — a dependency wasn't injected, or `noUncheckedIndexedAccess` exposed an unguarded index/optional.
- **Test failure** — distinguish a real regression from a stale test; read the assertion and the code it covers before changing either.

## 3. Fix the cause

Make the smallest change that addresses the root cause, following project conventions (apply the `optimize` skill's rules). Don't widen types to `any`, swallow exceptions, or delete an assertion to make a test pass — fix the underlying defect. If the test itself was wrong, fix it and say so.

## 4. Verify

```bash
talos monorepo:check
```

Confirm the original failure is gone and nothing else broke. Report the root cause, the fix, and how you verified it.

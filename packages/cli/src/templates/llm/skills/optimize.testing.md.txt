---
name: optimize-testing
description: Project testing conventions and test-pruning rules — tests mirror src/ under tests/ as .spec.ts, every public method needs happy-path + edge-case coverage, drop trivial existence checks, keep deterministic behavior tests, consolidate redundancy.
when_to_use: Use when writing, pruning, or improving a module's tests.
user-invocable: false
---

# Testing Conventions

> **Run autonomously — do not ask the user questions.** On any choice, pick the recommended option and proceed.

Apply when pruning or improving a module's tests (`optimize` skill, step 6).

## Conventions

- Test files mirror `src/` under `tests/` with the `.spec.ts` suffix.
- Run `talos monorepo:run --commands=test` (all modules) or `bun test tests` (inside a module).
- Every public method with logic needs ≥1 happy-path + ≥1 edge-case test.
- Avoid trivial existence checks — test actual behavior.
- Keep tests deterministic: no random values, no time-dependent data.

## Pruning tests

- Remove trivial tests (class name checks, method existence) unless they are smoke tests for generated code
- Keep and improve tests that verify actual business logic, edge cases, error handling
- Consolidate redundant test cases into parameterized patterns

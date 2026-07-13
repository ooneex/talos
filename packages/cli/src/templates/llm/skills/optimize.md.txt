---
name: optimize
description: Optimize a module's codebase for quality, performance, and clean conventions. Enforces arrow functions (except class methods), Type/I naming, explicit visibility, nullable columns; removes duplication and dead code; prunes trivial tests. Use to optimize/clean up/refactor a module — not for new features, bug fixes, or issues.
argument-hint: [module]
disallowed-tools: AskUserQuestion
---

# Optimize Codebase

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Bring a module in line with project conventions: clean code, no duplication, only meaningful tests. Not for new features, bug fixes, or issues — use the matching workflow instead.

## Rules

- Run every command from the **monorepo root**, never from inside a package.
- Start clean: no uncommitted changes before you begin (`git status`). Refactor only — never alter behavior or public APIs without checking callers first.
- Tests must pass before and after. If they were failing before, say so; don't claim a fix you didn't make.

## Routing — load on demand

Invoke each sub-skill only at the step that needs it; skip ones that don't apply.

| Invoke | Before | When |
|---|---|---|
| `optimize-conventions` | steps 3–5 | always |
| `optimize-testing` | step 6 | the module has tests |
| `optimize-ui` | step 7 | module is `design` or `spa` only |

## Steps

1. **Target** — work in `modules/<module>/`; ask if unspecified. When the user
   names **several modules**, dispatch the `code-optimizer` sub-agent once per
   module via the Agent tool (independent modules concurrently) — each agent runs
   the steps below for its module and reports back; then collate the reports. For
   a **single** module, run the steps inline yourself.

2. **Map (sub-agent)** — reading every file inline floods context. Spawn one read-only `Explore` sub-agent scoped to `modules/<module>/` and have it return *only* a digest, not file contents:
   - **Inventory** — each type, interface, class, standalone function + path.
   - **Naming violations** — type not ending `Type`; interface not starting `I`; non-arrow standalone function; method/property missing visibility; non-null assertion (`!`); optional entity property missing `null`/`nullable`.
   - **Duplication** — repeated logic, types, or utilities + paths.
   - **Dead code** — unused imports, unreachable branches, unused vars, empty files.

   Apply every fix yourself in the steps below.

3. **Conventions** — invoke the `optimize-conventions` skill, then fix each reported violation; rename and update all references.

4. **Duplication & dead code** — extract shared logic into helper arrows or base classes; consolidate types; merge near-duplicate utilities; delete dead code.

5. **Performance** — apply the performance rules from `optimize-conventions`.

6. **Tests** — invoke `optimize-testing`, then prune trivial tests, keep/improve meaningful ones, consolidate redundancy.

7. **UI** — if `design`/`spa`, invoke `optimize-ui` and adopt its patterns.

8. **Verify** — from the root:

   ```bash
   talos monorepo:check
   ```

   Fix every failure before completing.

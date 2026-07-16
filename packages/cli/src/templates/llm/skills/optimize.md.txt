---
name: optimize
description: Optimize a module's codebase for quality, performance, and clean conventions. Enforces arrow functions (except class methods), Type/I naming (DI-enforced), explicit visibility, nullable columns; removes duplication and dead code; prunes trivial tests.
when_to_use: Use to optimize/clean up/refactor a module — not for new features, bug fixes, or issues.
model: sonnet
effort: high
agent: general-purpose
context: fork
argument-hint: [module]
---

# Optimize Codebase

> **Run autonomously — do not ask the user questions.** On any choice, pick the recommended option and proceed.

Bring a module in line with project conventions: clean code, no duplication, only meaningful tests. Not for new features, bug fixes, or issues — use the matching workflow instead.

**Rules throughout:**
- **Module location:** `<module>` = `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.
- Run every command from the **monorepo root**, never from inside a package.
- Start clean: no uncommitted changes (`git status`). Refactor only — never alter behavior or public APIs without checking callers first.
- Tests must pass before and after. If they were failing before, say so; don't claim a fix you didn't make.

## Routing — load on demand

Invoke each sub-skill only at the step that needs it; skip ones that don't apply.

| Invoke | Before | When |
|---|---|---|
| `optimize-conventions` | steps 3–5 | always |
| `optimize-testing` | step 6 | the module has tests |
| `optimize-ui` | step 7 | module is `design` or `spa` only |

## Steps

1. **Target** — work in `modules/<module>/`; ask if unspecified. For **several modules**, dispatch the `code-optimizer` sub-agent once per module via the Agent tool (independent modules concurrently); each runs these steps for its module and reports back, then collate. For a **single** module, run inline.

2. **Map (sub-agent)** — reading every file inline floods context. Spawn one read-only `Explore` sub-agent scoped to `modules/<module>/` returning *only* a digest, not file contents:
   - **Inventory** — each type, interface, class, standalone function + path.
   - **Naming violations** — type not ending `Type`; interface not starting `I`; non-arrow standalone function; method/property missing visibility; non-null assertion (`!`); optional entity property missing `null`/`nullable`.
   - **Duplication** — repeated logic, types, or utilities + paths.
   - **Dead code** — unused imports, unreachable branches, unused vars, empty files.

   Apply every fix yourself in the steps below.

3. **Conventions** — invoke `optimize-conventions`, then fix each reported violation; rename and update all references.

4. **Duplication & dead code** — extract shared logic into helper arrows or base classes; consolidate types; merge near-duplicate utilities; delete dead code.

5. **Performance** — apply the performance rules from `optimize-conventions`.

6. **Tests** — invoke `optimize-testing`, then prune trivial tests, keep/improve meaningful ones, consolidate redundancy.

7. **UI** — if `design`/`spa`, invoke `optimize-ui` and adopt its patterns.

8. **Verify** — from the root:

   ```bash
   talos monorepo:check
   ```

   Fix every failure before completing.

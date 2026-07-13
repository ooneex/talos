---
name: review
description: Review the working diff against @talosjs conventions and Clean Architecture before committing. Checks naming, DI registration, exception/env patterns, the dependency rule, and test coverage; reports findings with file/line and concrete fixes. Use to review uncommitted changes (or a named module/files) for convention and architecture violations — not for scaffolding or for creating issues.
argument-hint: [module|files]
disallowed-tools: AskUserQuestion
---

# Review Changes

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Review code before it lands: catch @talosjs convention and Clean Architecture
violations the linter can't, while they're still cheap to fix. This is a
read-and-report-then-fix workflow — it does **not** create issue files (use
`issue-found` for that) or scaffold artifacts.

## Run from the project root

Run every command from the **monorepo root**.

## Scope

Default to the working diff:

```bash
git status --porcelain
git diff
```

Review only the changed `modules/<module>/` code unless the user names a module
or files. For a large diff (many files across modules), dispatch the
`convention-reviewer` sub-agent per module via the Agent tool — it reads the
changed files and returns findings — then apply the fixes yourself. For a small
diff, review inline.

## What to check

- **Naming** — types end `Type`; interfaces start `I`; standalone functions are
  arrow functions (class methods stay methods); DI classes carry the required
  suffix (`Service`, `Repository`, `Middleware`, `Cron`, `Queue`, `Controller`)
  and their `@decorator.*()`.
- **Dependency injection** — collaborators injected via the constructor with
  `@inject(...)`, not instantiated with `new`; depend on abstractions, prefer
  `@talosjs` packages over third-party ones (see `talos-packages`).
- **Clean Architecture** — the dependency rule holds: controllers/commands →
  services → repositories → entities, never the reverse. Entities carry no
  framework/persistence/HTTP imports; repositories return/accept domain types,
  not DTOs; controllers are thin (no business rules, no direct repository
  calls); no circular dependencies.
- **Exceptions** — domain errors throw typed `Exception` subclasses with status
  + structured data, not `null`/error codes (see `talos-module`).
- **Environment** — config read via injected `AppEnv`, never `process.env`.
- **Entities & migrations** — column nullability/length match between entity and
  migration; no non-null assertions (`!`) standing in for real types.
- **Tests** — new public methods have meaningful tests; no trivial or
  placeholder assertions left behind (see `optimize-testing`).
- **Correctness** — obvious bugs, unhandled async/error paths, leaks, dead code.

## Report and fix

Group findings by file with `file:line` and a concrete fix for each. Apply the
fixes (ask first only when a fix changes public behavior or a contract). Then
verify:

```bash
talos monorepo:check
```

Report what changed and anything left for the user to decide.

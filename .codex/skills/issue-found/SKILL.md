---
name: issue:found
description: Use when the user asks to audit an Talos package, find actionable issues, or create issue YAML files for findings.
metadata:
  short-description: Audit a package and create issues
---

# Issue Found

Audit one package and create issue files for real, actionable findings.

## Important

Always run commands from the monorepo root.

Do not use `oo issue:create` unless it has been updated to write under `packages/`. Write issue YAML files directly in this repository layout.

## Locate the Package

The user must provide or imply a package name.

Read:

```text
packages/<package>/src/
packages/<package>/tests/
packages/<package>/package.json
packages/<package>/README.md
```

If `packages/<package>/package.json` does not exist, stop and report the exact path checked.

## Audit Categories

Only report issues grounded in code you read.

| Category | Look for |
| --- | --- |
| `Security` | Missing auth/authorization checks, unvalidated input, unsafe deserialization, secrets, sensitive data in logs or responses |
| `Performance` | N+1 queries, unbounded reads, missing pagination, repeated computation, sync work in hot paths, excessive payloads |
| `Architecture` | Cross-package imports into `src` or `dist`, circular dependencies, public API not exported from `src/index.ts`, framework details leaking into domain code |
| `Testing` | Public behavior without meaningful tests, missing edge cases, missing error-path coverage |
| `Improvement` | Weak typing, duplicated logic, missing error handling, inconsistent naming, unclear API boundaries |
| `Cleanup` | Dead code, unused exports, obsolete shims, redundant tests, stale docs |
| `Database` | Missing migrations for schema changes, nullable mismatch, unsafe raw SQL, relation mistakes |
| `API` | Breaking or undocumented public API behavior, incorrect package exports, unstable types |

## Create Issues

For each finding:

- Create one issue file in `packages/<package>/issues/`.
- Generate a unique ID as `XXX-000000`.
- Set `state` to `Todo`.
- Infer priority from severity.
- Use one or more labels from the audit category vocabulary.
- Include concrete file paths and line numbers when useful.

YAML shape:

```yaml
id: "ABC-012345"
title: "Remove unused route shim"
state: "Todo"
priority: "Low"
labels:
  - "Cleanup"
description: |
  packages/app/src/httpRouteUtils.ts is a re-export shim over packages/app/src/utils/.
  Internal imports should use ./utils directly, or the shim should be exported
  publicly if it is intentionally supported.
```

## Priority

- `Urgent` for exploitable security issues, data loss, broken builds, or release blockers.
- `High` for authorization gaps, serious regressions, or architecture problems blocking other work.
- `Medium` for missing tests, non-critical bugs, and normal improvements.
- `Low` for cleanup, docs, naming, and minor refactors.

## Confirm

Report a compact table:

| ID | Title | Priority | Labels | File |
| --- | --- | --- | --- | --- |

Then list every issue file path and the total count.

If no real issues are found, create nothing and say so.

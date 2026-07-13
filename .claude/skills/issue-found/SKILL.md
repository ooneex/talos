---
name: issue-found
description: Audit a package's source code for issues (security, performance, architecture, missing tests, improvements) and create a YAML issue file in packages/<package>/issues/ for each finding with the state always set to Todo.
---

# Issue Found

Analyse the source code of a package, detect issues across several categories, and create a YAML issue file for every finding.

## Important

Always work from the **root of the monorepo**, not from inside individual packages.

## Workflow

### 1. Locate the Package

The user must provide:
- `--package` — the package name to audit (e.g. `routing`, `cache`, `container`)

Read the package source under:

```
packages/<package>/src/
```

If the directory does not exist, stop and tell the user the exact path that was checked.

Read every relevant file in the package — implementation files, decorators, types, exceptions, the public entry point `src/index.ts`, `package.json`, and tests under `packages/<package>/tests/`. Build a complete picture before reporting anything.

### 2. Audit the Code

Inspect the package across these categories. For each, look for the listed signals:

| Category | What to look for |
|----------|------------------|
| **Security** | Unvalidated or unsanitized input, secrets or credentials in code, unsafe deserialization, sensitive data in logs or error messages, injection risks in query/command construction, missing permission checks where the package enforces access control |
| **Performance** | Repeated computation, synchronous work in hot paths, missing caching, unbounded loops or queries, large payloads, arrays used for lookups where `Map`/`Set` fits, unnecessary `async`/`await` |
| **Architecture** | Violations of the monorepo dependency rules — reaching into another package's `src/` or `dist/` instead of its public entry point (`@talosjs/<name>`); core packages depending on application-layer ones; circular dependencies between packages; internals exported from `src/index.ts` that are not part of the public API; missing constructor injection (`@inject` from `@talosjs/container`) for collaborators; duplicated logic that an existing `@talosjs` package already provides |
| **Missing Tests** | Public classes or functions without a corresponding `.spec.ts` in `tests/`, untested error paths, untested edge cases, missing tests for new public methods, non-deterministic tests (random values, time-dependent data) |
| **Improvement** | Dead or unused code, duplicated logic, unused exports, weak typing (`any`), missing error handling, inconsistent naming, returning `null`/error codes instead of throwing typed exceptions extending `Exception` from `@talosjs/exception` |
| **Code Quality** | Standalone functions not using arrow syntax, missing explicit visibility modifiers on class members, type aliases not ending with `Type`, interfaces not starting with `I`, non-null assertions (`!`), DI naming-suffix violations (`Service`, `Repository`, `Middleware`, `Cron`), magic values |

Only report **real, actionable** findings grounded in the code you read. Do not invent issues or pad the list. If the package is clean in a category, skip it.

### 3. Create an Issue per Finding

For each finding, write one YAML issue file to `packages/<package>/issues/<ID>.yml`, exactly as described in the `/issue-create` skill (generate a `XXX-NNNNNN` ID, check for collisions).

Derive each field from the finding:

| Field | How to derive |
|-------|---------------|
| `title` | Concise, action-oriented (verb + noun), e.g. `"Add validation to route parameter parsing"` |
| `package` | The audited `--package` value |
| `state` | **Always** `Todo` — never override |
| `priority` | Infer from severity (see below) |
| `labels` | The matching category label (see vocabulary below) |
| `description` | A short, factual summary of the problem and the file(s)/line(s) involved |

**Priority** — infer from the finding's severity:

- `Urgent` — exploitable security vulnerabilities, data loss, or anything actively broken.
- `High` — serious performance problems, architectural violations that block other work, or bugs affecting consumers of the package.
- `Medium` — missing tests, non-critical improvements, and standard refactors. This is the fallback.
- `Low` — minor polish, naming, dead code, and docs.

**Labels** — use the category from step 2, mapped to this exact casing:

`Security`, `Performance`, `Architecture`, `Testing`, `Improvement`, `Refactor`, `Bug`, `Cleanup`, `Database`, `API`

### 4. Confirm

Report a summary table of every issue created:

| ID | Title | Priority | Label | File |
|----|-------|----------|-------|------|

Then list the path of each created file (e.g. `packages/routing/issues/EAB-204913.yml`) and the total count.

### 5. Suggest Next Steps

After creating the files, suggest:

- `/issue-improve` — to expand each finding into a structured description with Context, Goal, and Acceptance Criteria
- `/issue-fix` — to implement a chosen issue once it is ready

## Notes

- Group genuinely related findings into a single issue rather than creating many tiny duplicates; split unrelated concerns into separate issues.
- Always reference the concrete file path (and line range when useful) inside the `description` so the finding is reproducible.
- Never invent findings — every issue must map to code you actually read in the package.
- If the package has no issues, say so and create nothing.
- Apply the same coding conventions used by the `optimize` skill when judging code quality.

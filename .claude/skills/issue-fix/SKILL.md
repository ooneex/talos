---
name: issue:fix
description: Find an issue by ID in a package and implement it. Reads packages/<package>/issues/<ID>.yml, implements the change in the package's src/ and tests/, then runs fmt, lint, and tests.
---

# Issue Fix

Locate the issue YAML file for the provided package and ID, then implement it.

## Important

Always run all commands from the **root of the monorepo**, not from inside individual packages.

## Steps

### 1. Locate and read the issue YML

The user provides:
- `--package` — the package name (e.g. `routing`, `cache`, `container`)
- `--id` — the issue identifier (e.g. `EAB-204913`)

Read the file at:

```
packages/<package>/issues/<ID>.yml
```

If `--package` is missing, search `packages/*/issues/<ID>.yml` for the ID. If the file does not exist, stop and tell the user the exact path that was checked.

An issue YML looks like:

```yaml
id: "EAB-204913"
title: "Add route parameter validation"
state: "Todo"
priority: "High"
description: |
  ## Context
  …
  ## Goal
  …
  ## Acceptance Criteria
  - [ ] …
  ## Technical Notes
  …
labels:
  - "Feature"
  - "API"
```

### 2. Analyse the issue

Extract from the description:

- **Goal** — what must exist or change when the work is done
- **Acceptance Criteria** — the checklist driving the implementation; every unchecked item must be addressed
- **Technical Notes** — constraints or implementation hints, when present

Then read the target package (`src/`, `tests/`, `package.json`, `README.md`) to understand its public API, existing patterns, and dependencies before changing anything.

### 3. Implement the change

Work inside `packages/<package>/src/`, following the standard package layout:

```
packages/<name>/
  src/
    index.ts          # Public entry point — only export what is part of the API
    decorators.ts     # DI registration decorators (where applicable)
    types.ts          # Package-local type and interface definitions
    ...
  tests/              # *.spec.ts files run by `bun test`
```

Apply the repository conventions (see AGENTS.md and the `optimize` skill):

- Explicit `public`/`private`/`protected` on every class method and property
- Arrow functions everywhere except class methods
- Type aliases end with `Type`; interfaces start with `I`
- No non-null assertions — use default values or optional types (`?` unions include `null`)
- DI naming suffixes are enforced at registration time: `Service`, `Repository`, `Middleware`, `Cron`
- Wire collaborators through constructor injection with `@inject(...)` from `@talosjs/container`
- Throw typed exceptions extending `Exception` from `@talosjs/exception` rather than returning `null` or error codes

Respect the **package dependency rules**:

- Consume sibling packages only through their public entry point (`@talosjs/<name>`) — never reach into another package's `src/` or `dist/`
- Core packages must not depend on application-layer ones; no circular `workspace:^` dependencies
- When a new cross-package dependency is needed, add it to the package's `package.json` as `"@talosjs/<name>": "workspace:^"` and prefer reusing an existing package over duplicating logic

Export every new public class, function, or type from `src/index.ts`; keep internals unexported.

### 4. Add or update tests

For every public method or function with logic touched by the issue, ensure `packages/<package>/tests/` contains at least one happy-path and one edge-case `.spec.ts` test. Test actual behavior, not existence; keep tests deterministic (no random values, no time-dependent data).

### 5. Lint, format, and test

```bash
bunx biome check --write
bunx nx run @talosjs/<package>:lint
bun test packages/<package>/tests
```

Fix any failures before completing.

### 6. Update the issue file

In `packages/<package>/issues/<ID>.yml`:

- Tick every acceptance criterion that is now satisfied (`- [ ]` → `- [x]`)
- Set the state to `Done`:

```yaml
state: "Done"
```

### 7. Confirm

Report:

- Issue `id` and `title` implemented
- Files created or changed (paths)
- Tests added and the test/lint results
- Issue state set to `Done`
- Any acceptance criterion that was skipped and why

## Notes

- The acceptance criteria are the single source of truth for what to implement — do not add unrequested features beyond them.
- If a file already exists, update it rather than overwrite it — add new methods, exports, or tests without removing existing ones unless they conflict.
- Derive all names and locations from the issue and the package's existing patterns; never ask the user for values that can be inferred.
- Apply all coding conventions from the `optimize` skill to every file you touch.

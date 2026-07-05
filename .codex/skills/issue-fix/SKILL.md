---
name: issue:fix
description: Use when the user asks to implement, fix, complete, or resolve an existing package issue YAML file in this Talos monorepo.
metadata:
  short-description: Implement a package issue
---

# Issue Fix

Locate a package issue YAML file, implement it, and mark it done.

## Important

Always run commands from the monorepo root.

Implement changes in the existing package style. Do not use app/module scaffolding commands that write to `modules/` unless the issue explicitly concerns generated application modules.

## Locate the Issue

The user must provide or imply:

- `package`: package name under `packages/`
- `id`: issue identifier, for example `ABC-012345`

Read:

```text
packages/<package>/issues/<ID>.yml
```

If the file does not exist, stop and report the exact path checked.

## Analyze

Extract:

- `title`
- `description`
- `priority`
- `labels`
- optional `resources`
- optional `spec`

Read the relevant package source, tests, `package.json`, and public exports before editing.

## Implement

Follow the issue description and acceptance criteria. Keep the change scoped to the package unless the issue requires cross-package work.

Package rules:

- Keep public exports in `packages/<package>/src/index.ts`.
- Add or update tests in `packages/<package>/tests/`.
- Import sibling packages through `@talosjs/<name>`.
- Do not edit generated `dist/` files unless explicitly requested.
- Respect strict TypeScript settings and the conventions from `optimize`.
- Update `README.md` when public usage changes.
- Update `package.json` dependencies only when imports or build behavior require it.

Layering rules for packages that implement application resources:

```text
controller / command -> service -> repository -> entity
```

- Controllers and commands are thin adapters.
- Services own business logic.
- Repositories own persistence access.
- Entities hold data shape and pure domain rules.
- Use constructor injection where DI is part of the package pattern.

If `spec.roles` is present, use canonical roles from:

```text
packages/role/src/roles.yml
```

## Validate

Run the narrowest useful checks first:

```bash
bun test packages/<package>/tests
bunx nx run @talosjs/<package>:build
bunx nx run @talosjs/<package>:lint
```

For cross-package changes, run broader validation:

```bash
oo monorepo:run --commands=build
oo monorepo:run --commands=lint
oo monorepo:run --commands=test
```

Fix failures caused by the implementation.

## Mark Done

After implementation and validation, update the issue file:

```yaml
state: "Done"
```

Preserve comments, labels, resources, spec, and description unless the implementation requires an issue metadata update.

## Confirm

Report:

- Issue ID and title.
- Files changed at a high level.
- Validation commands run and results.
- Issue state set to `Done`.
- Any skipped validation and why.

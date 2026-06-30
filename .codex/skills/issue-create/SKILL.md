---
name: issue:create
description: Use when the user asks to create, file, or draft a new package issue YAML file for this Talos monorepo.
metadata:
  short-description: Create a package issue YAML file
---

# Issue Create

Create a new package issue YAML file under `packages/<package>/issues/`.

## Important

Always run commands from the monorepo root.

Do not use `oo issue:create` for this monorepo prompt unless the CLI has first been fixed to write under `packages/`. The current command targets `modules/`, which is not the workspace layout for repository issues.

## Gather Details

Ask only for missing required values.

| Field | Required | Rule |
| --- | --- | --- |
| `title` | Yes | Use exactly the user-provided title |
| `package` | Yes | Must exist under `packages/<package>` |
| `priority` | No | Infer unless the user provides it |
| `labels` | No | Short label list, default `[]` |
| `description` | No | Free-form text, default `null` |

The `state` is always `Todo`.

## Priority

Infer priority from the title and description:

- `Urgent` for security vulnerabilities, data loss, broken builds, production outages, or blocked releases.
- `High` for important regressions, authorization gaps, or user-facing bugs.
- `Medium` for normal features, improvements, and non-blocking bugs.
- `Low` for polish, cleanup, docs, chores, and minor refactors.

If the user explicitly states a priority, honor it.

## Labels

Use concise labels with this vocabulary where possible:

`Feature`, `Bug`, `Improvement`, `Enhancement`, `Performance`, `Refactor`, `Security`, `Breaking Change`, `Documentation`, `Testing`, `Database`, `API`, `UI`, `Infrastructure`, `Cleanup`, `Architecture`

## Create the File

1. Ensure `packages/<package>/package.json` exists.
2. Ensure `packages/<package>/issues/` exists.
3. Generate an ID as `XXX-000000`, where `XXX` is three uppercase letters and the number is six digits.
4. Check that `packages/<package>/issues/<ID>.yml` does not already exist.
5. Write the YAML file directly.

```yaml
id: "ABC-012345"
title: "Add user validation"
state: "Todo"
priority: "Medium"
labels: []
description: null
```

For multiline descriptions:

```yaml
description: |
  First paragraph.

  Second paragraph.
```

## Confirm

Report the created file path and assigned ID.

Suggest `issue-improve` when the description would benefit from structure, or `issue-fix` when it is ready to implement.

---
name: issue:create
description: Create a new YAML issue file in packages/<package>/issues/ by gathering title, priority, labels, description, and package from the user, with the state always set to Todo.
---

# Issue Create

Gather issue details from the user and write a new YAML issue file to `packages/<package>/issues/<ID>.yml`.

## Important

Always work from the **root of the monorepo**. Issue files are plain YAML written directly with the Write tool — no external command is needed.

## Workflow

### 1. Gather Issue Details

Collect the following from the user (ask only for missing values; infer reasonable defaults for the rest):

| Field | Default | Valid values |
|-------|---------|--------------|
| `title` | — (required) | Any non-empty string |
| `package` | inferred (see below) | Any package directory under `packages/` (e.g. `routing`, `cache`, `container`) |
| `priority` | inferred (see below) | `Low`, `Medium`, `High`, `Urgent` |
| `labels` | `[]` | Comma-separated list |
| `description` | `null` | Free-form text |

The `state` is **always** `Todo` — do not ask the user for it and never override it.

Infer the `package` from the title and description when possible (e.g. an issue about route parameter parsing → `routing`). Validate the name against the directories under `packages/` — if it does not match an existing package, list the closest matches and ask the user instead of creating a new directory. If no package can be inferred, ask.

Infer the best `priority` from the title and description rather than asking the user. Use these cues:

- `Urgent` — production outages, security vulnerabilities, data loss, broken builds, or anything blocking other work ("critical", "asap", "broken", "down", "vulnerability").
- `High` — important bugs or features users are actively waiting on, regressions, or anything time-sensitive.
- `Medium` — standard features, improvements, and non-blocking bugs. This is the fallback when no signal points elsewhere.
- `Low` — nice-to-haves, minor polish, refactors, docs, and chores.

If the user explicitly states a priority, always honor it over the inferred value.

If the user provides a free-form description, use it as-is — `/issue:improve` will structure it later.

### 2. Generate the ID and Write the File

Generate an identifier in the format `XXX-NNNNNN` — three uppercase letters followed by six digits (e.g. `EAB-204913`). Check `packages/<package>/issues/` for collisions and regenerate if the ID already exists.

Write the file to `packages/<package>/issues/<ID>.yml`:

```yaml
id: "EAB-204913"
title: "Add user validation"
state: "Todo"
priority: "Medium"
description: null
labels: []
```

Multi-line descriptions use YAML block style:

```yaml
description: |
  First line
  Second line
```

### 3. Confirm Creation

Report the path of the created file (e.g. `packages/routing/issues/EAB-204913.yml`) and the assigned ID.

### 4. Suggest Next Steps

After creating the file, suggest:

- `/issue:improve` — to rewrite the description into a structured format with Context, Goal, Acceptance Criteria, and optional Technical Notes
- `/issue:fix` — to implement the issue once it is ready

## Notes

- If the user already provided all required details, skip interactive prompting and write the file directly.
- Never invent a title — always use exactly what the user provided.
- Never create a new directory under `packages/` — issues belong to existing packages only.

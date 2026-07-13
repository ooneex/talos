---
name: issue-improve
description: Improve a YAML issue file by rewriting the description into a structured format, extracting labels, and optionally splitting into smaller focused issues. Reads from packages/<package>/issues/<ID>.yml.
---

# Issue Improve

Improve an existing YAML issue file: rewrite the description, suggest labels, and optionally split into smaller issues.

## Workflow

### 1. Locate the Issue File

Ask the user for the issue identifier or file path if not already provided.
Look for the file in `packages/<package>/issues/<ID>.yml`. If the package is not given, search `packages/*/issues/<ID>.yml` for the ID.
Read the YAML file with the Read tool.

### 2. Improve the Description

Rewrite the `description` field into this structured format:

```markdown
## Context
<Background information explaining why this issue exists>

## Goal
<What needs to be achieved>

## Acceptance Criteria
- [ ] <Condition 1 that must be met>
- [ ] <Condition 2 that must be met>
- [ ] <Public API change is exported from `src/index.ts`>
- [ ] <Tests cover the new behavior (happy path + edge case)>
- [ ] <…>

## Technical Notes
<Optional: technical constraints or implementation hints — omit section if not applicable>
```

Rules:
- Preserve all factual information from the original description
- Keep each section concise and actionable
- Acceptance Criteria must be checkboxes (`- [ ]`), not prose
- When a criterion covers a public API change, add indented sub-checkboxes (`  - [ ] \`memberName\` — <description>`) for each exported class, function, or option involved
- Descriptions of API members must be plain English — what the member does for the consumer, not implementation details
- Ground Technical Notes in this repository's conventions: package layout (`src/index.ts` entry point, `tests/` specs), DI via `@talosjs/container`, typed exceptions extending `Exception`, and sibling packages consumed only through `@talosjs/<name>`
- Omit `## Technical Notes` if there is nothing relevant to add
- Omit `## Technical Notes` in the parent issue when it has sub-issues — add it only in sub-issues
- When the issue is split, the parent `## Acceptance Criteria` must be the exact union of all sub-issues' criteria, grouped by sub-issue title — never written before sub-issues exist

### 3. Extract Labels, Set State and Priority

**Labels** — Based on the improved description, suggest relevant labels:
- Short (1–3 words), properly cased: Title Case for general terms, uppercase for acronyms (e.g. `Feature`, `Bug`, `API`, `Database`, `UI`, `Breaking Change`)
- Deduplicate against labels already present in the YAML

Common label vocabulary (use these exact casings):
`Feature`, `Bug`, `Improvement`, `Enhancement`, `Performance`, `Refactor`, `Security`, `Breaking Change`,
`Documentation`, `Testing`, `Database`, `API`, `UI`, `Infrastructure`, `Cleanup`

**State** — The `state` is **always** `Todo` — set it to `Todo` and never override it.

**Priority** — Always set or confirm the `priority` field. Valid values: `Urgent`, `High`, `Medium`, `Low`.
Infer the best `priority` from the title and description rather than asking the user. Use these cues:

- `Urgent` — production outages, security vulnerabilities, data loss, broken builds, or anything blocking other work ("critical", "asap", "broken", "down", "vulnerability").
- `High` — important bugs or features users are actively waiting on, regressions, or anything time-sensitive.
- `Medium` — standard features, improvements, and non-blocking bugs. This is the fallback when no signal points elsewhere.
- `Low` — nice-to-haves, minor polish, refactors, docs, and chores.

If the user explicitly states a priority, always honor it over the inferred value.

### 4. Check Whether Splitting Is Needed

Evaluate whether the issue is large or complex enough to split. An issue needs splitting when it:
- Spans multiple unrelated concerns or implementation areas
- Cannot be completed in one focused developer session
- Contains several independent acceptance criteria that could ship separately

Skip splitting if the issue is already small and focused.

### 5. Split Into Sub-Issues (if needed)

Break the issue into 3–7 small, self-contained, independently implementable issues.

For each sub-issue:
- Generate a new identifier using the format `XXX-NNNNNN` (3 uppercase letters + 6 digits); check the issues directory for collisions
- Write a new YAML file to the same `packages/<package>/issues/` directory
- Inherit `priority` and `labels` from the parent issue, and set `state` to `Todo`

Each sub-issue description must use the same structured format as the parent issue, including `## Acceptance Criteria` with checkboxes. The `## Context` and `## Goal` sections should be concise (2–3 sentences each) and scoped to the sub-issue.

After writing all sub-issues, update the parent issue's `## Acceptance Criteria` to be the exact union of all sub-issues' `## Acceptance Criteria` items, grouped under a labeled header per sub-issue:

```markdown
## Acceptance Criteria

### <Sub-issue title>
- [ ] <Condition from sub-issue>
- [ ] <…>

### <Sub-issue title>
- [ ] <Condition from sub-issue>
- [ ] <…>
```

Do not invent new criteria — copy them verbatim from each sub-issue.

Sub-issue YAML structure:
```yaml
id: "<generated-id>"
title: "<action-oriented title: verb + noun>"
state: "Todo"
priority: "<parent priority>"
description: |
  ## Context
  <2–3 sentences scoped to this sub-issue>

  ## Goal
  <What this sub-issue specifically achieves>

  ## Acceptance Criteria
  - [ ] <Condition 1>
  - [ ] <Condition 2>
  - [ ] <…>

  ## Technical Notes
  <Optional — omit if not applicable>
labels:
  - "<label>"
```

### 6. Save Changes

Update the original YAML file with the improved description and new labels using the Edit or Write tool.
Confirm each file written with a success message showing the relative path.

## YAML Structure Reference

```yaml
id: "EAB-204913"
title: "Add user validation"
state: "Todo"
priority: "High"
description: |
  ## Context
  …
  ## Goal
  …
  ## Acceptance Criteria
  - [ ] …
labels:
  - "Enhancement"
  - "API"
comments:
  - author: "Alice"
    message: "Some comment"
```

## Notes

- Never invent facts — only restructure and clarify what is already in the description
- If the description is missing or empty, tell the user and stop
- When splitting, inform the user of each sub-issue file created

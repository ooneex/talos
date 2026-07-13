---
name: issue-improve
description: Use when the user asks to improve, refine, structure, rewrite, split, or clarify an existing package issue YAML file.
metadata:
  short-description: Improve an issue YAML file
---

# Issue Improve

Improve an existing package issue YAML file.

## Locate the Issue

Ask for the package name and issue ID or file path if missing.

Default path:

```text
packages/<package>/issues/<ID>.yml
```

If the file does not exist, stop and report the exact path checked.

## Improve the Description

Rewrite `description` into this structure:

```markdown
## Context
<Why this issue exists>

## Goal
<What needs to be achieved>

## Acceptance Criteria
- [ ] <Condition that must be met>
- [ ] <Behavior, API, test, or docs requirement>

## Technical Notes
<Optional implementation constraints or useful references>
```

Rules:

- Preserve all factual information from the original issue.
- Do not invent requirements.
- Keep each section concise and actionable.
- Acceptance Criteria must be checkboxes.
- Omit `## Technical Notes` when there are no useful notes.
- For package public API changes, include criteria for exports, tests, and README updates when those are implied by the issue.
- For data model work, include field-level acceptance criteria in plain English. Put TypeORM decorator details in `## Technical Notes`, not in field descriptions.

## Labels, State, and Priority

Set `state` to `Todo` unless the user explicitly asks to preserve a later state.

Use labels from this vocabulary where possible:

`Feature`, `Bug`, `Improvement`, `Enhancement`, `Performance`, `Refactor`, `Security`, `Breaking Change`, `Documentation`, `Testing`, `Database`, `API`, `UI`, `Infrastructure`, `Cleanup`, `Architecture`

Priority values are `Urgent`, `High`, `Medium`, `Low`.

Infer priority:

- `Urgent` for security vulnerabilities, data loss, broken builds, production outages, or blocked releases.
- `High` for important regressions, authorization gaps, or user-facing bugs.
- `Medium` for normal features, improvements, and non-blocking bugs.
- `Low` for polish, cleanup, docs, chores, and minor refactors.

Honor an explicit user priority.

## Split When Needed

Split a large issue only when it spans independent deliverables that could ship separately.

When splitting:

1. Create 3-7 sub-issues in the same `packages/<package>/issues/` directory.
2. Generate unique IDs using `XXX-000000`.
3. Inherit parent priority and labels unless a sub-issue clearly needs a narrower label.
4. Set every sub-issue state to `Todo`.
5. Rewrite the parent acceptance criteria as the exact union of sub-issue criteria, grouped by sub-issue title.

Sub-issue structure:

```yaml
id: "ABC-012345"
title: "Add route cache tests"
state: "Todo"
priority: "Medium"
labels:
  - "Testing"
description: |
  ## Context
  ...

  ## Goal
  ...

  ## Acceptance Criteria
  - [ ] ...
```

## Save

Update the YAML file directly. Preserve unrelated fields such as `comments`, `resources`, or `spec` unless they conflict with the improved issue.

Confirm every path written.

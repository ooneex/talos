---
name: issue-plan
description: Create and plan one or more YAML issues from the user's input. Infers target issues and modules from whatever the user says — existing issue files/IDs and/or free-form descriptions, across one or more modules. For each description it scaffolds the issue with talos issue:create (inferring the module), then plans it — restructuring into context, goal, definition of done, and dependencies, extracting labels, and optionally splitting into ordered sub-issues with the same structure. Reads/writes modules/<module>/issues/<ID>.yml.
when_to_use: Use when the user wants to create and plan one or more YAML issues from descriptions or existing issue files. Triggers on requests like "create an issue", "plan this issue", or "turn this into issues".
model: opus
effort: high
argument-hint: [issue-id|description]
---

# Issue Plan

> **Run autonomously — never ask the user questions.** On any choice, pick the recommended option and proceed.

Infer which issues to plan — one or more, across one or more modules. Each input item is **either** an existing issue (ID or path) **or** a free-form description; either way the output is a planned issue: restructured into `context` / `goal` / `dod` / `testing` / `dependencies`, labelled, state and priority set, optionally split into ordered, self-contained sub-issues (same structure) reading as a step-by-step guide.

**Global rules:**
- **Module location:** `<module>` = `modules/<module>/` **or** `packages/<module>/`. Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- Run every command from the monorepo root.
- **Never invent facts** — only restructure and clarify what's in the issue. If the original description is missing/empty, tell the user and stop.

## Workflow

### Plan Mode First

Switch to **plan mode** (Claude Code's read-only mode — distinct from this skill's create/plan *target* modes in step 0). Investigate there: resolve targets, read issue files and module configs, work out restructuring/labelling/splitting. Present the plan, then **exit to execute** — repo writes (`talos issue:create`, YAML rewrites/Edits, parent deletion on split) happen only after leaving plan mode.

### 0. Resolve Targets and Mode

Input may name several issues across several modules, mixing existing issues with new descriptions. Resolve into a target list, each tagged:

- **Plan mode** — an existing issue ID (e.g. `OON-123456`) or `.yml` path under `modules/<module>/issues/`. ID without a module → glob `modules/*/issues/<ID>.yml` and plan each match. → step 1.
- **Create mode** — a free-form description with no existing issue. → step 0a to scaffold, then step 1.

Splitting input into targets:
- Multiple IDs/paths (repeated, comma-separated, or listed) → one plan-mode target each.
- A description covering **distinct, unrelated work — especially across different modules** → **one create-mode target per piece** (e.g. "add an org create API and a billing settings page" → a backend issue + a spa issue). Keep tightly related work as one target; step 4 decides splitting.
- When unsure whether a fragment is one issue or several, prefer fewer targets and let steps 4–5 break them down; only ask when grouping genuinely can't be inferred.
- Anything not a recognizable issue ID or existing file path is a description (create mode).

Build the full list first, then run steps 0a–6 per target. Process targets independently — one failing (missing file, empty description) skips only that target; continue and report skips in step 7. If nothing resolves, tell the user and stop.

### 0a. Create Mode — Scaffold First

Per create-mode target, derive fields from that target's slice of the description — infer reasonable values, ask only when a required value genuinely can't be inferred:

| Field | Default | How to derive |
|-------|---------|---------------|
| `title` | — (required) | Concise, action-oriented (verb + noun). Use the user's wording; never invent. |
| `module` | `shared` | **Infer from input** — match domain nouns to a module under `modules/` (e.g. "user profile" → `user`, "checkout" → `order`). Verify it exists; if no match, default to `shared` and say so. |
| `priority` | inferred (step 3) | Infer from the description; honor any stated priority. |
| `labels` | `[]` | Suggest from the description (step 3 vocabulary); refined below. |
| `description` | `null` | The user's free-form text, as-is — planning steps structure it. |

`state` is **always** `Todo` at creation — never ask. Planning moves it to `Planned`.

```bash
talos issue:create \
  --title="<title>" --module=<module> --state="Todo" --priority="<priority>" \
  [--labels="<label1>,<label2>"] [--description="<description>"]
```

Writes a YAML skeleton to `modules/<module>/issues/<ID>.yml` (`<ID>` auto-generated, e.g. `ABC-012345`). Note `<ID>` and `<module>`, continue to step 1.

### 1. Locate the Issue File and Module Type

Plan mode: use the resolved ID/path (if not found, record the exact path checked, skip, continue). Create mode: use the file from 0a. Read `modules/<module>/issues/<ID>.yml` (default module: `shared`).

A plan-mode issue is plannable only when `state` is exactly `Todo` (create-mode issues always are). Any other state (`Planned`/`In Progress`/`Done`) → skip, don't re-plan, note the skip and current state for step 7, continue.

Read `modules/<module>/<module>.yml` for its `type`, which decides the `goal`'s technical vocabulary (see **Technical Structure by Module Type**):
- `"module"`/`"api"`/`"microservice"` (or none) — backend → `### Data Model` with TypeORM relations.
- `"spa"` — front-end SPA → `### Front-End Structure`.
- `"design"` — design system → `### Design System Structure`.

### 2. Restructure the Parent Issue

Replace the free-form `description` with the **same five fields sub-issues use**, so the parent is structurally identical to one:

- `context` — background and why the issue exists.
- `goal` — concrete work to do, including any **Technical Notes** (constraints, hints) and the technical subsection matching the module type, when applicable.
- `dod` — acceptance criteria as checkboxes (`- [ ]`), all required.
- `testing` — an ordered checkbox list (`1. [ ]`, …) of concrete steps a reviewer follows to verify the change end-to-end, exercising every `dod` item (see **How to Test**).
- `dependencies` — issue IDs to complete first (usually `[]` for a standalone parent); also scan existing issues for real prerequisites (step 3a).

Rules:
- Preserve all factual info from the original; keep fields concise and actionable.
- `dod` items are checkboxes, never prose. For data models, add indented sub-checkboxes per field: `  - [ ] \`fieldName\` — <description>`.
- `dod` descriptions are plain-English outcomes — no implementation syntax. Backend: `` `type` — b2b | school | internal `` (not `ENUM(...)`); `` `createdAt` — Created date `` (not `TIMESTAMPTZ via @CreateDateColumn`); `` `packs` — One organization has many packs `` (not `@OneToMany`). SPA/design: `` Profile page renders the user's avatar and name `` (not `<UserAvatar/> in features/user/components`).
- Use the entity name, not an ID suffix: `` `address` — User has one address `` (not `addressId`); `` `organization` — Membership belongs to one organization `` (not `organizationId`).
- Implementation specifics (decorators, file paths, hook names) appear only in `goal`'s technical subsection, never in `dod`.
- Applies only when **not** split — when split, the parent is deleted (step 5) and its intent lives in the sub-issues.

### 3. Extract Labels, Set State and Priority

**Module** — Preserve the existing `module` field (set by `talos issue:create`); give every sub-issue the parent's `module`. It mirrors the `modules/<module>/` directory the issue lives in — never drop it when rewriting YAML.

**Labels** — Suggest relevant labels: short (1–3 words), Title Case for general terms, uppercase for acronyms. Deduplicate against existing YAML labels. Vocabulary (exact casing), two kinds:

- **Change-type** — `Feature`, `Enhancement`, `Bug`, `Security`, `Hotfix`, `Performance`, `Refactor`, `Cleanup`, `Architecture`, `Testing`, `Documentation`, `Build`, `Dependencies`, `CI`, `Style`, `Improvement`, `Chore`, `Maintenance`, `Revert`. `Breaking Change` is a modifier layered on top of one of these.
- **Area** — `Database`, `API`, `UI`, `SPA`, `Design`, `Infrastructure`.

**Always include ≥1 change-type label, listed first.** `/issue-fix` maps it to the git branch type (`Feature` → `feat/…`, `Bug` → `fix/…`, `Refactor` → `refactor/…`, etc.); an area-only issue falls back to a `chore/…` branch, rarely intended. Add area labels alongside when helpful (e.g. `["Feature", "API"]`). Leave `branch` unset — `/issue-fix` computes it on first run.

**State** — Valid: `Todo`, `Planned`, `In Progress`, `Done`. This skill produces a plan, so always set `state: "Planned"` (every sub-issue when split, else the parent). Never any other state.

**Priority** — Always set/confirm. Valid: `Urgent`, `High`, `Medium`, `Low`. Infer rather than ask; a stated priority overrides the inferred value:
- `Urgent` — outages, security vulns, data loss, broken builds, blockers ("critical", "asap", "broken", "down", "vulnerability").
- `High` — important bugs/features users await, regressions, time-sensitive work.
- `Medium` — standard features, improvements, non-blocking bugs (fallback when no signal).
- `Low` — nice-to-haves, polish, refactors, docs, chores.

### 3a. Scan Existing Issues for Dependencies

Beyond the current batch, an issue may depend on work already filed. For each module touched, glob existing issue files (`modules/<module>/issues/*.yml`, and the `packages/` equivalent) and read each `id`, `title`, `goal`.

- Wire a dependency only when this issue **genuinely can't be implemented until the other is complete** — a real prerequisite (an API endpoint this UI calls, an entity this migration extends, a shared util this feature imports). Add the prerequisite's `id`.
- **Skip `Done` issues** — not blockers. Only `Todo`, `Planned`, `In Progress` can be prerequisites.
- Cross-module is fair game — a `spa` issue may depend on an `api` issue elsewhere; reference the ID regardless of location.
- Never invent a dependency to be safe — a spurious edge stalls `/issue-fix`. When in doubt, leave it out. Keep the graph acyclic: a sub-issue must never (directly or transitively) depend on itself.

Apply to the parent's `dependencies` (step 2) and each sub-issue's (step 5), on top of intra-batch wiring.

### 4. Check Whether Splitting Is Needed

Split when the issue spans multiple unrelated concerns, can't be done in one focused session, or has several independent acceptance criteria that could ship separately. Skip if already small and focused.

### 5. Plan the Sub-Issues (if needed)

Break into 3–7 small, self-contained, independently implementable sub-issues reading as an ordered guide. For each:
- Generate an ID `XXX-000000` (3 uppercase letters + 6 digits).
- Write a new YAML file to the same `modules/<module>/issues/` directory.
- Inherit `priority` and `labels` from the parent; set `state: "Planned"`.
- Order by implementation sequence via `dependencies` (sub-issue IDs to complete first, `[]` when none).
- Use the same five fields, scoped to the sub-issue: `context` (scoped, plus how it fits the larger plan), `goal`, `dod`, `testing` (only what this sub-issue delivers), `dependencies`.

When a sub-issue needs implementation detail, `goal` includes the technical subsection matching the module type (see **Technical Structure by Module Type**). Backend `### Data Model` lists every relation with the exact field name on the owning entity, the TypeORM decorator, and the inverse field / FK-or-join-table owner:

```
- `EntityA.fieldName` → `@OneToMany(() => EntityB, (b) => b.a)` — one A has many Bs
- `EntityB.fieldName` → `@ManyToOne(() => EntityA, (a) => a.bs)` — many Bs belong to one A
- `EntityA.fieldName` → `@ManyToMany(() => EntityB)` + `@JoinTable()` — pivot table owned by A
- `EntityA.fieldName` → `@OneToOne(() => EntityB)` + `@JoinColumn()` — one-to-one, FK on A
```

For spa use `### Front-End Structure`, for design `### Design System Structure`, naming the concrete files/folders to add or change.

After writing all sub-issues, **delete the parent issue file** — but first confirm every piece of the parent's intent is carried into at least one sub-issue's `context`, `goal`, or `dod`. Never leave the plan with neither parent nor sub-issues. List each created sub-issue (ID and title) so the user sees what replaced the parent.

Sub-issue YAML:
```yaml
id: "<generated-id>"
module: "<module>"
title: "<action-oriented title: verb + noun>"
state: "Planned"
priority: "<parent priority>"
labels:
  - "<label>"
context: |
  <Details needed to understand this sub-issue — 2–3 sentences scoped to it>
goal: |
  <What this sub-issue specifically achieves>

  ## Technical Notes
  <Optional — omit if not applicable>

  ### Data Model | Front-End Structure | Design System Structure
  <Subsection matching the module type — omit if not applicable>
dod: |
  - [ ] <Condition 1>
  - [ ] <…>
testing: |
  1. [ ] <First verification step — command to run or route/flow to exercise>
  2. [ ] <Next step and the expected result>
dependencies:
  - "<id of a sub-issue to complete first>"
```

### 6. Save Changes

- **If split:** write all sub-issue files, then `rm modules/<module>/issues/<ID>.yml` (Bash). Confirm each sub-issue written and the parent removed, with relative paths.
- **If not split:** rewrite the parent YAML with `context`/`goal`/`dod`/`testing`/`dependencies` (replacing `description`) plus new labels, via Edit or Write. Confirm with the relative path.

### 7. Confirm the Batch

Once every target is planned, report a batch summary. Per issue: `id`, `title`, module, mode (created vs. planned-in-place), final `priority`/`labels`, and whether split (listing the sub-issue IDs/titles that replaced it). Then list any skipped/unplannable targets (state not `Todo` with its current state, plan-mode file not found with the exact path checked, or an ambiguous grouping awaiting confirmation).

A not-split parent uses the identical structure (`id`/`module`/`title`/`state`/`priority`/`labels` + the five fields), preserving any existing `comments`:
```yaml
comments:
  - author: "Alice"
    message: "Some comment"
```

## How to Test

`testing` is an **ordered checkbox list** (`1. [ ]`, `2. [ ]`, …) of concrete steps a reviewer runs to confirm the change works end-to-end. Where `dod` states *what must be true*, `testing` states *how to prove it*.

- Write real, runnable steps in implementation order — the command to run, the route/flow to exercise, the input to provide — each paired with its **expected result**. Prefer project tooling (`talos monorepo:check`, `bun run e2e`, `talos app:start`, a specific `curl`/route) over vague prose.
- Cover every `dod` item: each criterion exercised by ≥1 step, including meaningful edge/error cases.
- Match the module type: backend tests endpoints/services/migrations (requests, DB state, `talos monorepo:check`); SPA/design tests rendered routes and interactions (`talos app:start`, then the browser flow, plus `bun run e2e` when a Playwright spec exists).
- Keep it self-contained: a sub-issue's steps verify only what it delivers. Omit the field only when the issue has nothing observable to verify (e.g. a pure chore); otherwise it's required.

```yaml
testing: |
  1. [ ] Run `talos monorepo:check` from the project root — lint, types, and tests pass.
  2. [ ] Start the app with `talos app:start` and open `/users/new`.
  3. [ ] Submit the form with a duplicate email — rejected with a 409 and the inline error shows.
```

## Technical Structure by Module Type

The `goal`'s technical subsection follows the module's conventions (from step 1's `<module>.yml` `type`). Use exactly one of the three, matching the type; omit it for issues with no structural component (pure bug fix, copy change, chore).

### Backend module (`type: "module"`, `"api"`, `"microservice"`, or none) — `### Data Model`

The module owns controllers, services, repositories, entities, migrations, and seeds under `src/`. List TypeORM relations with the exact field name on the owning entity, the decorator, and the inverse field / FK-or-join-table owner (see the block in step 5). Reference services, repositories, controllers, and DI by their `@talosjs` conventions; entities register in `SharedModule`.

### SPA module (`type: "spa"`) — `### Front-End Structure`

A front-end SPA (TanStack Router + TanStack Query), **not** registered into `AppModule`/`SharedModule`. Code is organized as vertical slices — name the concrete files/folders to add or change:

- `src/routes/<kebab>.tsx` — file-based route mapping to a URL; keep thin, delegate UI to features and data to services.
- `src/features/<feature>/` — self-contained slice owning its `assets/`, `components/`, `hooks/` (data fetching / API calls / local UI state), `layouts/`, `services/` (the only layer talking to the backend), `store/` (client state), `styles/`, `types/`, `utils/`. A feature must not import another feature's internals — promote shared code to `src/shared/`.
- `src/shared/<sub-layer>/` — the only place ≥2 features may import from in common (same sub-layout as a feature).

For a new feature, `talos spa:feature:create --name <Name> --module <module>` (skill `/spa-feature-create`) scaffolds the route, the page/skeleton/error/not-found layouts under `features/<feature>/layouts/`, and example query (`useGet<Name>`) + mutation (`useUpdate<Name>`) hooks under `features/<feature>/hooks/`. Describe the feature, its route path, the layouts, and the hooks needed — spell hooks as `useGet<Name>` / `useUpdate<Name>`, components/layouts in PascalCase.

### Design module (`type: "design"`) — `### Design System Structure`

A front-end design system (reusable UI primitives), **not** registered into `AppModule`/`SharedModule`. Code under `src/` is organized by asset kind — name the concrete files/folders to add or change:

- `src/components/<component>/` — one folder per component grouping its variants (e.g. `button/` holds `Button.tsx`, `ButtonSave.tsx`, …). Compose existing primitives instead of ad-hoc markup.
- `src/hooks/` — generic presentation-layer hooks (state, DOM measurement, events); no domain/data-fetching logic.
- `src/icons/` — SVG icons in `fill/` + `outline/` variants, grouped by category and size (`sm`, `md`, `lg`); add to the matching category folder, never inline SVG.
- `src/fonts/` — bundled web fonts with their `@font-face` CSS; no external CDNs.
- `src/styles/` — global stylesheets (`app.css`, `brand.css`, `typography.css`, …) for app-wide tokens/themes; prefer shared styles + component-scoped classes over one-off CSS.
- `src/utils/` — small pure presentation helpers (`cn`, `staleChunk`); no backend/business logic.

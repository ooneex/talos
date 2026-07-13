---
name: issue-plan
description: Create and plan one or more YAML issues from the user's input. Infers target issues and modules from whatever the user says — existing issue files/IDs and/or free-form descriptions, across one or more modules. For each description it scaffolds the issue with talos issue:create (inferring the module), then plans it — restructuring into context, goal, definition of done, and dependencies, extracting labels, and optionally splitting into ordered sub-issues with the same structure. Reads/writes modules/<module>/issues/<ID>.yml.
argument-hint: [issue-id|description]
disallowed-tools: AskUserQuestion
---

# Issue Plan

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Infer which issues to plan from the user's input — one or more issues across one or more modules. Each input item is **either** an existing issue (ID or path) **or** a free-form description. Either way, the result is a planned issue: restructured into `context` / `goal` / `dod` / `dependencies`, labelled, with state and priority set, and optionally broken into ordered, self-contained sub-issues (same structure) that read as a step-by-step implementation guide.

## Workflow

### Switch to Plan Mode First

Before anything else, switch to **plan mode** (Claude Code's read-only mode — distinct from this skill's create/plan *target* modes in step 0). Do all investigation there: resolve targets, read existing issue files and module configs, work out how each issue is restructured, labelled, and split. Present the plan, then **exit plan mode to execute** — repo writes (`talos issue:create`, rewriting/Editing YAML, deleting a parent on split) only happen after you leave plan mode.

### 0. Resolve the Targets and Mode

The input may name several issues across several modules, mixing existing issues with new descriptions. Resolve it into a list of targets, each tagged with its mode:

- **Plan mode** — an existing issue ID (e.g. `OON-123456`) or path to a `.yml` under `modules/<module>/issues/`. If an ID is given without a module, glob `modules/*/issues/<ID>.yml`; plan each match. Goes straight to step 1.
- **Create mode** — a free-form description with no existing issue. Run step 0a to scaffold, then step 1 to plan.

Splitting input into targets:
- Multiple IDs/paths (repeated, comma-separated, or listed) each become a plan-mode target.
- A description covering **distinct, unrelated work — especially work spanning different modules** — becomes **one create-mode target per piece** (e.g. "add an org create API and a billing settings page" → a backend issue + a spa issue in another module). Keep tightly related work as one target; step 4 decides whether to split it.
- When it's unclear whether a fragment is one issue or several, prefer fewer targets and let steps 4–5 break them down; only ask when the grouping genuinely can't be inferred.
- Treat anything that isn't a recognizable issue ID or existing file path as a description (create mode).

Build the full target list first, then run steps 0a–6 for **each** target. If no targets resolve, tell the user nothing matched and stop.

### 0a. Create Mode — Scaffold the Issue First

**Always run commands from the monorepo root.** Run this per create-mode target. Derive fields from that target's slice of the description — infer reasonable values, ask only when a required value genuinely can't be inferred:

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
  --title="<title>" \
  --module=<module> \
  --state="Todo" \
  --priority="<priority>" \
  [--labels="<label1>,<label2>"] \
  [--description="<description>"]
```

This writes a YAML skeleton to `modules/<module>/issues/<ID>.yml` (`<ID>` auto-generated, e.g. `ABC-012345`). Note the `<ID>` and `<module>`, then continue to step 1.

### 1. Locate the Issue File and Module Type

For the current target — plan mode: use its resolved ID/path (if not found, record the exact path checked, skip it, continue with the rest). Create mode: use the file scaffolded in 0a. Read `modules/<module>/issues/<ID>.yml` (default module: `shared`).

If a plan-mode issue's `state` is already `Planned`, it's done — skip it (don't re-plan), note the skip for step 7, continue. (Create-mode issues are always `Todo`, so this never skips them.)

Then read the module config `modules/<module>/<module>.yml` for its `type`, which decides the `goal`'s technical vocabulary (see **Technical Structure by Module Type**):
- `type: "module"`, `"api"`, `"microservice"` (or none) — backend → `### Data Model` with TypeORM relations.
- `type: "spa"` — front-end SPA → `### Front-End Structure` (features/routes/layouts/hooks/services).
- `type: "design"` — design system → `### Design System Structure` (components/hooks/icons/styles).

### 2. Restructure the Parent Issue

Replace the free-form `description` with the **same four fields used by sub-issues**, so the parent is structurally identical to one:

- `context` — relevant background and why the issue exists.
- `goal` — concrete work to do, including any **Technical Notes** (constraints, hints) and the technical subsection matching the module type (`### Data Model` / `### Front-End Structure` / `### Design System Structure`), when applicable.
- `dod` — acceptance criteria as checkboxes (`- [ ]`), all required.
- `dependencies` — issue IDs to complete first (usually `[]` for a standalone parent).

Rules:
- Preserve all factual information from the original; keep fields concise and actionable.
- `dod` items are checkboxes, never prose. For data models, add indented sub-checkboxes per field: `  - [ ] \`fieldName\` — <description>`.
- `dod` descriptions are plain-English outcomes — no implementation syntax. Backend: `` `type` — b2b | school | internal `` (not `ENUM(...)`); `` `createdAt` — Created date `` (not `TIMESTAMPTZ via @CreateDateColumn`); `` `packs` — One organization has many packs `` (not `@OneToMany`). SPA/design: `` Profile page renders the user's avatar and name `` (not `<UserAvatar/> in features/user/components`).
- Use the entity name, not an ID suffix: `` `address` — User has one address `` (not `addressId`); `` `organization` — Membership belongs to one organization `` (not `organizationId`).
- Implementation specifics (decorators, file paths, hook names) appear only in `goal`'s technical subsection, never in `dod`.
- This step applies only when **not** split — when split, the parent is deleted (step 5) and its intent lives in the sub-issues.

### 3. Extract Labels, Set State and Priority

**Module** — Preserve the existing `module` field (set by `talos issue:create`), and give every sub-issue the same `module` value as the parent. It mirrors the `modules/<module>/` directory the issue lives in — never drop it when rewriting the YAML.

**Labels** — Suggest relevant labels: short (1–3 words), Title Case for general terms, uppercase for acronyms. Deduplicate against existing YAML labels. Vocabulary (exact casing): `Feature`, `Bug`, `Improvement`, `Enhancement`, `Performance`, `Refactor`, `Security`, `Breaking Change`, `Documentation`, `Testing`, `Database`, `API`, `UI`, `Infrastructure`, `Cleanup`.

**State** — Valid: `Todo`, `Planned`, `In Progress`, `Done`. This skill produces a plan, so always set `state: "Planned"` (on every sub-issue when split, or the parent when not). `Planned` means ready to pick up — `/issue-fix` takes over. Never set any other state.

**Priority** — Always set/confirm. Valid: `Urgent`, `High`, `Medium`, `Low`. Infer rather than ask:
- `Urgent` — outages, security vulnerabilities, data loss, broken builds, blockers ("critical", "asap", "broken", "down", "vulnerability").
- `High` — important bugs/features users await, regressions, time-sensitive work.
- `Medium` — standard features, improvements, non-blocking bugs (fallback when no signal).
- `Low` — nice-to-haves, polish, refactors, docs, chores.

Honor an explicitly stated priority over the inferred value.

### 4. Check Whether Splitting Is Needed

Split when the issue spans multiple unrelated concerns, can't be done in one focused session, or has several independent acceptance criteria that could ship separately. Skip if it's already small and focused.

### 5. Plan the Sub-Issues (if needed)

Break into 3–7 small, self-contained, independently implementable sub-issues that read as an ordered guide. For each:
- Generate an ID `XXX-000000` (3 uppercase letters + 6 digits).
- Write a new YAML file to the same `modules/<module>/issues/` directory.
- Inherit `priority` and `labels` from the parent; set `state: "Planned"`.
- Order by implementation sequence, expressed through `dependencies`.

Each sub-issue uses the same four fields (`context` scoped to it plus how it fits the larger plan; `goal`; `dod`; `dependencies` = sub-issue IDs to complete first, `[]` when none).

When a sub-issue needs implementation detail, `goal` includes the technical subsection matching the module type (see **Technical Structure by Module Type**). For backend, `### Data Model` lists every relation with the exact field name on the owning entity, the TypeORM decorator, and the inverse field / FK-or-join-table owner:

```
- `EntityA.fieldName` → `@OneToMany(() => EntityB, (b) => b.a)` — one A has many Bs
- `EntityB.fieldName` → `@ManyToOne(() => EntityA, (a) => a.bs)` — many Bs belong to one A
- `EntityA.fieldName` → `@ManyToMany(() => EntityB)` + `@JoinTable()` — pivot table owned by A
- `EntityA.fieldName` → `@OneToOne(() => EntityB)` + `@JoinColumn()` — one-to-one, FK on A
```

For spa use `### Front-End Structure`, for design `### Design System Structure`, naming the concrete files/folders to add or change under that module's conventions.

After writing all sub-issues, **delete the parent issue file** — the sub-issues fully replace it. First confirm every piece of the parent's intent is carried into at least one sub-issue's `context`, `goal`, or `dod`. List each created sub-issue (ID and title) so the user sees what replaced the parent.

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
dependencies:
  - "<id of a sub-issue to complete first>"
```

### 6. Save Changes

- **If split:** write all sub-issue files, then `rm modules/<module>/issues/<ID>.yml` (Bash). Confirm each sub-issue written and the parent removed, with relative paths.
- **If not split:** rewrite the parent YAML with `context`/`goal`/`dod`/`dependencies` (replacing `description`) plus new labels, via Edit or Write. Confirm with the relative path.

### 7. Confirm the Batch

Once every target is planned, report a batch summary. Per issue: `id`, `title`, module, mode (created vs. planned-in-place), final `priority`/`labels`, and whether it was split (listing the sub-issue IDs/titles that replaced it). Then list any skipped or unplannable targets (already `Planned`, plan-mode file not found with the exact path checked, or an ambiguous grouping awaiting confirmation).

## YAML Structure Reference

Parent issue when not split — same structure as a sub-issue, plus any existing `comments`:
```yaml
id: "OON-123456"
module: "user"
title: "Add user validation"
state: "Planned"
priority: "High"
labels:
  - "Enhancement"
  - "API"
context: |
  <Details needed to understand it>
goal: |
  <What to do>

  ## Technical Notes
  <Optional — omit if not applicable>

  ### Data Model | Front-End Structure | Design System Structure
  <Subsection matching the module type — omit if not applicable>
dod: |
  - [ ] <Condition 1>
  - [ ] <…>
dependencies: []
comments:
  - author: "Alice"
    message: "Some comment"
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

For a new feature, note that `talos spa:feature:create --name <Name> --module <module>` (skill `/spa-feature-create`) scaffolds the route, the page/skeleton/error/not-found layouts under `features/<feature>/layouts/`, and example query (`useGet<Name>`) + mutation (`useUpdate<Name>`) hooks under `features/<feature>/hooks/`. Describe the feature, its route path, the layouts, and the hooks needed. Spell hooks as `useGet<Name>` / `useUpdate<Name>` and components/layouts in PascalCase.

### Design module (`type: "design"`) — `### Design System Structure`

A front-end design system (reusable UI primitives), **not** registered into `AppModule`/`SharedModule`. Code under `src/` is organized by asset kind — name the concrete files/folders to add or change:

- `src/components/<component>/` — one folder per component grouping its variants (e.g. `button/` holds `Button.tsx`, `ButtonSave.tsx`, …). Compose existing primitives instead of ad-hoc markup.
- `src/hooks/` — generic presentation-layer hooks (state, DOM measurement, events); no domain/data-fetching logic.
- `src/icons/` — SVG icons in `fill/` + `outline/` variants, grouped by category and size (`sm`, `md`, `lg`); add to the matching category folder, never inline SVG.
- `src/fonts/` — bundled web fonts with their `@font-face` CSS; no external CDNs.
- `src/styles/` — global stylesheets (`app.css`, `brand.css`, `typography.css`, …) for app-wide tokens/themes; prefer shared styles + component-scoped classes over one-off CSS.
- `src/utils/` — small pure presentation helpers (`cn`, `staleChunk`); no backend/business logic.

## Notes

- Never invent facts — only restructure and clarify what's already in the issue.
- If the original description is missing or empty, tell the user and stop.
- Only delete the parent after every sub-issue file is written — never leave the plan with neither parent nor sub-issues.
- Keep dependencies acyclic — a sub-issue must never (directly or transitively) depend on itself.
- When the batch spans related issues, wire `dependencies` across them — if one must be implemented before another (even in a different module), reference the prerequisite's ID so `/issue-fix` picks them up in order.
- Process targets independently — one failing (missing file, empty description) skips only that target; continue with the rest and report skips in step 7.

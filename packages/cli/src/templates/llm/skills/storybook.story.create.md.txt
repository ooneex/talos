---
name: storybook-story-create
description: Author storybook stories for design-system components or icons — infer the targets from the request, then write a single story for a plain component or a main story plus one per sub-component (nested in the sidebar) for a compound component, wiring everything so the storybook builds and renders.
when_to_use: Use when (re-)creating storybook stories for one or more design-system components or icons (e.g. "create stories for the avatar component", "add stories for the weather icons", "story the badge and card from design into storybook"). Handles plain and compound components, icons, multiple source design modules, and multiple target storybook modules.
model: sonnet
effort: medium
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
argument-hint: <component / icon names or design paths> [→ target storybook module]
---

# Create Storybook Stories

> **Run autonomously — never ask questions.** Infer the targets and target storybook module from the request; on any remaining choice, pick the recommended option and proceed.

Author `*.stories.tsx` files under a storybook module's `src/features/` to preview components/icons from a design module's `src/`. There is **no `talos` generator** — write the files by hand against the `meta` model. For the storybook module layout, the `meta` shape, the registry, and the Canvas/Sidebar/palette engine, see `talos-storybook`; the authoring-critical rules below assume that background.

## Infer the request first

The user names targets in plain language ("avatar", "the weather icons", "badge + card"). Resolve:

1. **Source design module(s)** — which `modules/<design>/` holds each target (usually `modules/design`; a request can span several). Confirm each under `src/components/<name>/` (component) or `src/icons/<variant>/<category>/<size>/<Name>Icon.tsx` (icon).
2. **Target storybook module(s)** — which `modules/<storybook>/` receives the stories (default `modules/storybook`; can differ from the source and can be several).
3. **Targets** — the concrete components/icons; expand loose phrasing ("the weather icons") by listing matching design files. A request can mix components and icons and fan several sources into one storybook or one into several.
4. **New vs. update** — if a `*.stories.tsx` already exists under the target's `src/features/`, update it in place; else create it. Never write stories outside `src/features`.

Read each target storybook's `vite.config.ts` for the design alias (e.g. `@module/design` → `../design/src`) and import through it — never relative paths across modules.

## Authoring rules

### Every story

- File `src/features/<component>/<Name>.stories.tsx` (one folder per component; icons may share a folder). Import via the alias (`@module/design/components/<name>` or `@module/design/icons/<variant>/<category>/<size>/<Name>Icon`).
- **`usage`** — detailed markdown covering, in order, **what** the component/icon is, **how** to use it, **when**, and **when not to**. Be specific: enumerate real sub-components, compositions, states. Compose with `[...].join("\n")`, `""` for blank lines, `**bold**` lead-ins (`**What**`, `**How to use it**`, `**When to use it**`, `**When not to use it**`). Lead with a real sentence — the palette hint is its first sentence.
- **Every `select`/`radio` option** carries `usage` = a short description **and** when to reach for it (concrete contexts, not the name restated). There is no per-prop usage — fold non-option guidance into `meta.usage`. Reuse the design component's real `cva` variant/size names as option `name`s.
- Give every prop a `default` so the preview is populated. Pass composed JSX via `children` (no control); use `control: "text"` only for genuinely string children.

### Plain components

`meta.component` = the component; `children` default is composed JSX (or a text child); add a `select`/`radio` control per `cva` variant group (size, tone, …) with per-option `usage`.

### Compound components

Compound = the root attaches sub-components as properties, e.g. `Avatar = Object.assign(AvatarRoot, { Image, Fallback, Badge, Group, GroupCount })`.

1. **Main story** — `title: "<Name>"`, `component: <Name>`, `children` = the canonical composition of the primary sub-components. Its root is `<Name>`, so `size`/variant controls flow onto it via the Canvas clone path.
2. **One story per meaningful sub-component** — `title: "<Name>.<Sub>"` (dot notation drives sidebar nesting), file `<Name><Sub>.stories.tsx`. **Set `component` to the element type that roots the composition.** A sub-component that only renders inside its parent (`Image`, `Fallback`, `Badge`, overflow counts) gets `component: <Name>` with `children` = the full `<Name>…<Name.Sub/>…</Name>`; the shared `size` control resizes it via the clone path. A sub-component that is itself a root (`Avatar.Group`) gets `component: <Name>.<Sub>` with `children` = `<Name.Sub>…</Name.Sub>`. No demo wrappers — the clone behavior replaces them; if one is truly unavoidable, type its props so `prop.name` type-checks against `Meta<typeof Wrapper>`.
3. **Same `group` for parent and children** so they file together; nesting is otherwise automatic from dotted titles.

### Icons

- One story per icon (or a compact set): `title: "<Name>Icon"`, `group: "Icons"`, `component: <Name>Icon`. Add a `size`/`color` control only if the icon takes props worth previewing (`SVGProps<SVGSVGElement>` — usually styled via `className`). Keep `usage` short but cover what it depicts, how to size/color it (`className`, `currentColor`), and when to use it over another. Icons may share `src/features/icons/`; files `<Name>Icon.stories.tsx`.

## Steps

1. **Resolve the request** (sources, targets, target storybook(s), new-vs-update) per above.
2. **Read each target's source.** Component: list `modules/<design>/src/components/<name>/`, read every file + `index.ts`, determine plain vs. compound (`Object.assign(Root, { … })`), sub-components, their props, and `cva` size/variant options. Icon: read the icon file for its props.
3. **Mirror a sibling story** in the target storybook — the compound example `features/avatar/` and a plain one if present — for structure, `group` usage, and prose depth.
4. **Write or update** the stories in `src/features/`, reusing real variant/size names as options, each with `usage`.
5. **Check** — `talos monorepo:check` (lint, format, test). Fix every failure. Verify mentally against the model: each `meta.title` yields a sidebar entry under its `group`; dotted titles nest; the `size` control resizes the composed preview; every option shows its `usage`.

---
name: talos-storybook
description: Directory structure and conventions for a storybook module — the front-end component-gallery app (bootstrap, routes, features/stories, shared story model + registry, preview/controls/sidebar/palette) that previews a design module's components and icons, with per-folder usage guidance.
when_to_use: Use when creating or navigating a storybook module — the app that documents and previews a design system's components and icons.
user-invocable: false
---

# Storybook Architecture

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

A **storybook module** (`talos storybook:create`) holds a front-end component gallery that documents and previews the components and icons of a **design module** — it is a spa-flavour front end, not backend logic. It is **not** registered into `AppModule`/`SharedModule` and its `<name>.yml` declares `type: "storybook"`. It renders **no domain logic of its own**: every previewed component and icon is imported from a design module through a Vite alias, and each preview is described by a story `meta` object rather than hand-written markup. All code lives under `modules/<name>/`:
```
modules/<name>/                   # type: "storybook"
  vite.config.ts                # Build + dev config. Declares the alias that points at the design module's src
                                #   (e.g. `@module/design` → `../design/src`). Stories import targets through this alias —
                                #   never with relative paths across modules. A storybook can alias several design modules.
  public/                       # Static files copied verbatim to the web root — favicon, logos. No bundling/hashing;
                                #   reference by absolute path (`/favicon.svg`).
  src/
    bootstrap/                  # Entry point and build wiring. Rarely edited by hand once scaffolded.
      index.html                #   HTML shell — the single document; mount node + script tag.
      app.tsx                   #   Bootstrap: creates the router + React root and mounts into the shell; wires global providers.
      routeTree.gen.ts          #   Auto-generated route tree. Tooling output — never edit; Biome-ignored.
    routes/                     # File-based TanStack Router routes driving `routeTree.gen.ts`. Keep thin — the shell that
      __root.tsx                #   hosts the gallery chrome (sidebar, command palette, canvas). Delegate rendering to shared/.
      index.tsx                 #   Index (`/`) route — the gallery landing / default preview.
    features/                   # One folder per storied component; the stories themselves. Nothing else lives here.
      <component>/              #   e.g. `avatar/` — a folder per component grouping its story files.
        <Name>.stories.tsx      #     The main story: exports a `meta satisfies Meta<typeof Component>`. For a compound
                                #       component, sibling `<Name><Sub>.stories.tsx` files (title `"<Name>.<Sub>"`) nest
                                #       automatically under it in the sidebar. See `storybook-story-create`.
      icons/                    #   Icons can share one feature folder (no compound nesting); files `<Name>Icon.stories.tsx`.
    shared/                     # The gallery engine — reused by every route. Do not put stories here.
      story/                    #   The story model + discovery.
        types.ts                #     `Meta` shape: title, group, tags, component, usage (markdown), props[] (name, control,
                                #       options[], default, callback). The contract every `*.stories.tsx` satisfies.
        registry.ts             #     Discovers stories via `import.meta.glob("../../features/**/*.stories.{ts,tsx}")`, keys
                                #       them by slugified `meta.title`, and yields one sidebar entry + preview per story.
      components/               #   The gallery UI. Only touch these to change the engine, not to add a story.
        Canvas.tsx              #     Renders the live preview. Normally `createElement(meta.component, args)`; when
                                #       `args.children` is an element whose `type === meta.component`, it clones that element
                                #       and applies the remaining args (size, …) — the key rule for compound/nested previews.
        Controls.tsx            #     The Controls + Usage tabs; renders `meta.usage` markdown and per-option `usage`.
        Sidebar.tsx             #     Builds the tree: folds dotted titles (`<Name>.<Sub>`) into collapsible children and
                                #       partitions by `meta.group` (`"Components"`, `"Icons"`, …) in first-seen order.
        CommandPalette.tsx      #     ⌘K palette; per-item hint is the first sentence of each story's `usage`.
      # plus the usual spa shared/ layers as needed (assets, hooks, layouts, styles, types, utils).
```

## Conventions

- **Stories only under `src/features/`.** Every preview is a `*.stories.tsx` exporting a `meta`; there is **no `talos` generator** for stories — author them by hand against the `meta` model in `shared/story/types.ts`. To add or update stories, use the `storybook-story-create` skill.
- **Import previewed code through the design alias**, never relative paths across modules — read `vite.config.ts` for the alias (`@module/design/components/<name>`, `@module/design/icons/<variant>/<category>/<size>/<Name>Icon`).
- **The engine is `shared/`.** Adding a component to the gallery means adding a story file, not editing `Canvas`/`Sidebar`/`CommandPalette`/`registry` — only touch those when the discovery, preview, nesting, or sectioning logic itself must change.
- **Sidebar nesting and sectioning are data-driven.** A title `<Name>.<Sub>` nests under `<Name>`; a shared `meta.group` files siblings into the same section. Give a compound component and its sub-component stories the same `group`.

For authoring or updating story files, see `storybook-story-create`. For the design system this gallery previews, see `talos-design`; for the general single-page-app layout it shares (`public`, `bootstrap`, `routes`, `features`, `shared`), see `talos-spa`; for backend module layout, see `talos-module`.

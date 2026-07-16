---
name: talos-design
description: Directory structure and conventions for a design module — the front-end design system layout (components, hooks, icons, fonts, styles, translations, utils) with per-folder usage guidance.
when_to_use: Use when creating or navigating a design system.
user-invocable: false
---

# Design System Architecture

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

A **design module** (`talos design:create`) holds the front-end design system, not backend logic. It is **not** registered into `AppModule`/`SharedModule` and its `<name>.yml` declares `type: "design"`. `src/` is organized by asset kind:
```
modules/<name>/        # type: "design"
  src/
    components/   # React (.tsx) UI, one folder per component grouping its variants (~50: accordion, avatar, badge,
                  #   button (Button.tsx, ButtonSave.tsx, …), card, dialog, form, input, select, table, tabs, tooltip, …).
                  #   Compose these primitives; never write ad-hoc markup or duplicate internals.
    hooks/        # Reusable presentation-layer React hooks (state, DOM measurement, events) — useClickOutside, useMobile,
                  #   useControlledState, useAutoHeight. Keep generic; domain/data-fetching logic belongs in services.
    icons/        # SVG icons in fill/ + outline/ variants, grouped by category + size (sm, md, lg).
                  #   Add new icons to the matching category folder — never inline SVG.
    fonts/        # Bundled web fonts (Space Grotesk) with @font-face CSS; no external CDNs. Add new font files here with their CSS.
    styles/       # Global stylesheets — app.css, brand.css, shape.css, status.css, typography.css. Prefer shared styles +
                  #   component-scoped classes over one-off CSS. Every color/spacing/radius/shadow used elsewhere in the
                  #   module must resolve to a token defined here — never a hardcoded one-off value.
    translations/ # Translation classes + translations.yml dictionary (from `talos translation:create`) — backend-flavour
                  #   Translation class, not a spa hook. Classes load the sibling translations.yml; add locale keys there.
    utils/        # Front-end helpers — cn (class-name merge), staleChunk. Add small pure presentation helpers; no backend/business logic.
```

For the interaction, motion, typography, color, and surface rules every component here must follow — including how to avoid AI-slop visual patterns (stock gradients, glassmorphism-as-decoration, template layouts) — see `optimize-ui`. For the SPA consuming this design system, see `talos-spa`; for backend module layout, see `talos-module`.

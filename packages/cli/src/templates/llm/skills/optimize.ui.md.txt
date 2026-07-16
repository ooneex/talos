---
name: optimize-ui
description: Recommended UI/UX craft rules and React implementation patterns for design and spa modules — design-system-first styling plus reference docs for interaction states, motion, typography, color/contrast, surfaces, layout, hooks, and TanStack/Zustand state.
when_to_use: Use only when building or optimizing a React module (design or spa).
user-invocable: false
---

# UI & React Patterns (design & spa modules)

> **Run autonomously — do not ask the user questions.** On any choice, pick the recommended option and proceed.

Apply **only** to a React module (`design` or `spa`) — `optimize` calls this for step 7. `<module>` = `modules/<module>/` or `packages/<module>/`; check both roots.

Install missing deps at the project root:

```bash
bun add zustand @tanstack/react-query @tanstack/react-virtual @tanstack/react-pacer @tanstack/react-hotkeys
```

## Design system

**Always build UI with the project's main design system — never restyle from scratch or hand-roll primitives that already exist there.** Use its component/token if one fits; else add the primitive to the design module per its conventions. Never ask which visual treatment, color, spacing, or variant — infer from the system's tokens/components and these rules.

- Before styling, do a discovery pass: does a token/component already cover this? If a deviation is unavoidable, classify it (missing token vs. one-off implementation vs. conceptual mismatch with neighboring screens) so the fix addresses the real cause.
- In a `spa` module, read the `design:` field in `modules/<module>/<module>.yml` for the linked design module, then list its exports (`ls modules/<design>/src/components`, `cat modules/<design>/src/index.ts`).
- Import design components via the module path alias:

  ```typescript
  import { Button } from "@module/<design>/components/Button";
  // or from a barrel re-export:
  import { Button, Card } from "@module/<design>";
  ```

- When optimizing existing UI, replace ad-hoc styled elements (raw `<button>`, `<input>`, one-off styled divs) with the system's equivalents. Fall back to plain elements only when no matching component exists — prefer adding the missing primitive to the design module over duplicating styles in the SPA.
- In a `design` module, extend the system itself: new components belong there and follow its tokens, variants, and conventions — colors, spacing, radii, shadows, and type sizes must always resolve to tokens, never a hardcoded one-off.

## UI craft references

Read the relevant reference(s) below **before** implementing — each is short, so open only what applies:

| Reference | Read when touching... |
|---|---|
| `references/ai-slop.md` | any new screen, layout, or component — always read this one |
| `references/interaction-states.md` | any interactive element — hover/focus/active/disabled/loading/error states, empty states, error copy, destructive actions, hit areas |
| `references/motion.md` | any transition, animation, or entrance/exit effect |
| `references/typography.md` | text sizes, line length, dynamic numbers, headings |
| `references/color-contrast.md` | colors, contrast, state indicators, accent usage |
| `references/surfaces.md` | shadows, borders, cards, elevation, radii |
| `references/layout-spacing.md` | spacing, gaps, grids/flex, breakpoints, z-index |

## React pattern references

| Reference | Read when touching... |
|---|---|
| `references/state-and-hooks.md` | custom hooks, compound components, Zustand global state |
| `references/data-and-performance.md` | TanStack Query, long lists (Virtual), debounce/throttle (Pacer), keyboard shortcuts (Hotkeys), perceived-speed techniques |

## Self-review before calling UI work done

Check every component/layout/feature against realistic conditions, not just the happy path — do this yourself:

- **Squint test** — defocus; primary/secondary elements and groupings stay identifiable. A monotone uniform grid can pass every rule and still read as flat.
- **Edge-case inputs** — very long/short text, empty lists, huge lists, missing images, offline/slow network, permission-denied. A layout that only works with perfect demo data isn't done.
- **Accessibility** — tab the whole flow with no mouse; every interactive control reachable with a visible focus state; semantic elements/roles, form labels, and `alt` text present; hit areas ≥44×44px (≥40×40px in dense desktop UI); state never signalled by color alone; `prefers-reduced-motion` respected.
- **Removal test** — for any added motion, shadow, or flourish: if removed, would anyone notice? If not, it isn't earning its place.
- **AI-slop check** — run against `references/ai-slop.md`: no generic gradient-as-brand, no glassmorphism-as-decoration, no stock hero+3-card-grid, no emoji standing in for the icon set, no marketing-cliché copy.

---
name: optimize-ui
description: Recommended UI/UX craft rules and React implementation patterns for design and spa modules — design-system-first styling plus reference docs for interaction states, motion, typography, color/contrast, surfaces, layout, hooks, and TanStack/Zustand state. Use only when building or optimizing a React module (design or spa).
user-invocable: false
disallowed-tools: AskUserQuestion
---

# UI & React Patterns (design & spa modules)

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Apply **only** to a React module (`design` or `spa`) — `optimize` calls this for step 7.

Install missing deps at the project root:

```bash
bun add zustand @tanstack/react-query @tanstack/react-virtual @tanstack/react-pacer @tanstack/react-hotkeys
```

## Design system

**Always build UI with the project's main design system — never restyle from scratch or hand-roll primitives that already exist there.** This is not optional and not a judgment call to surface to the user: if the design system already has a component or token for the job, use it; if it doesn't, add the primitive to the design module following its existing conventions. Never stop to ask which visual treatment, color, spacing value, or component variant to use — infer it from the design system's existing tokens/components and this skill's rules, and proceed.

- In a `spa` module, read the `design:` field in `modules/<module>/<module>.yml` to find the linked design module, then list its exports (`ls modules/<design>/src/components` and `cat modules/<design>/src/index.ts`) to learn the available primitives.
- Import design components through the module path alias:

  ```typescript
  import { Button } from "@module/<design>/components/Button";
  // or, if the design module re-exports from a barrel:
  import { Button, Card } from "@module/<design>";
  ```

- When optimizing existing UI, replace ad-hoc styled elements (raw `<button>`, `<input>`, one-off styled divs) with the design system's equivalents. Only fall back to plain elements when the design system has no matching component — and prefer adding the missing primitive to the design module over duplicating styles in the SPA.
- In a `design` module, extend the system itself: new components belong in the design module and follow its existing tokens, variants, and conventions — colors, spacing, radii, shadows, and type sizes must always resolve to the design system's tokens, never a hardcoded one-off value.
- Before styling anything, do a quick design-system discovery pass: does a token/component already cover this? If a deviation is unavoidable, classify it (missing token vs. one-off implementation vs. conceptual mismatch with neighboring screens) so the fix addresses the real cause instead of patching the symptom.

## UI craft references

Read the reference(s) below that are relevant to what you're touching **before** implementing — each is short and focused, so open only what applies rather than guessing:

| Reference | Read it when you're touching... |
|---|---|
| `references/ai-slop.md` | any new screen, layout, or component — read this one always, not just when it "seems relevant" |
| `references/interaction-states.md` | any interactive element — hover/focus/active/disabled/loading/error states, empty states, error copy, destructive actions, hit areas |
| `references/motion.md` | any transition, animation, or entrance/exit effect |
| `references/typography.md` | text sizes, line length, dynamic numbers, headings |
| `references/color-contrast.md` | colors, contrast, state indicators, accent usage |
| `references/surfaces.md` | shadows, borders, cards, elevation, radii |
| `references/layout-spacing.md` | spacing, gaps, grids/flex, breakpoints, z-index |

## React pattern references

| Reference | Read it when you're touching... |
|---|---|
| `references/state-and-hooks.md` | custom hooks, compound components, Zustand global state |
| `references/data-and-performance.md` | TanStack Query, long lists (Virtual), debounce/throttle (Pacer), keyboard shortcuts (Hotkeys), perceived-speed techniques |

## Self-review before calling UI work done

Before finishing any component, layout, or feature, check it against realistic conditions instead of only the happy path — do this yourself, do not ask the user to confirm any of it:

- **Squint test** — defocus and confirm the primary element, secondary elements, and groupings are still identifiable; a monotone grid with uniform spacing can pass every rule above and still read as flat.
- **Edge-case inputs** — very long/short text, empty lists, very large lists, missing images, offline/slow network, permission-denied. A layout that only works with perfect demo data isn't done.
- **Keyboard & reduced motion** — tab through the whole flow with no mouse, and verify `prefers-reduced-motion` is respected.
- **Removal test** — for any added motion, shadow, or decorative flourish: if you removed it, would anyone notice? If not, it isn't earning its place.
- **AI-slop check** — run the result against `references/ai-slop.md`: no generic gradient-as-brand-color, no glassmorphism-as-decoration, no stock hero+3-card-grid skeleton, no emoji standing in for the icon set, no marketing-cliché copy.

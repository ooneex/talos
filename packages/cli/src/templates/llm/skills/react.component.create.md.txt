---
name: react-component-create
description: Generate a new React component with a happy-dom + React Testing Library test, then complete the generated code.
when_to_use: Use when adding a presentational or container React component to a SPA module — at the module level or scoped to a feature.
model: sonnet
effort: medium
allowed-tools: Bash(talos react:component:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--feature=<feature>]
---

# Make React Component

> **Run autonomously — never ask questions.** On any choice, pick the recommended option and proceed.

Generate a React component and its test, then complete both. Follow the shared `talos-scaffold` workflow (run-from-root, `--name`/`--module` inference, lint/format, conventions); this covers only the component-specific parts.

## Rules

- A component belongs to a **SPA module** (`type: spa` in its `<name>.yml`). Create it first with `spa:create` if missing.
- `<module>` resolves to `modules/<module>/` **or** `packages/<module>/` — check both before assuming a path is missing.
- Keep components **presentational**: compose primitives from the linked `design` module (never style from scratch), receive data via props or a feature hook, reach the backend through services/hooks (never import server modules).
- **Placement:** shared across the SPA → module level (`src/components/`); serves one feature → `--feature` (`src/features/<feature>/components/`). Never import another feature's internals; shared-by-two → keep at module level (or promote a reusable primitive to the design module).

## Steps

### 1. Infer options, then run the generator

```bash
talos react:component:create --name=<name> --module=<module> [--feature=<feature>]
```

- `--name` — from what it renders ("a back button" → `ButtonBack`). Any casing; normalized to PascalCase.
- `--module` — target SPA (e.g. "in the `dashboard` SPA"). No default; prompts if omitted.
- `--feature` — feature owner (e.g. "for the user-profile feature"). Omit for a shared component. Any casing; normalized to kebab-case, strips trailing `Feature`/`Layout`.
- `--override` — pass to regenerate an existing component; otherwise the generator prompts and aborts if declined.

The generator also installs test dev deps (`@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/jest-dom`) at the project root and writes shared `happydom.ts` + `bunfig.toml` at the module root on first use (never overwriting existing files).

**Files generated** (`<Name>` PascalCase, `<feature>` kebab-case):

| | Component | Test |
|---|---|---|
| Module-level | `src/components/<Name>.tsx` | `tests/components/<Name>.spec.tsx` |
| Feature-scoped | `src/features/<feature>/components/<Name>.tsx` | `tests/features/<feature>/components/<Name>.spec.tsx` |

### 2. Resolve the linked design module

Read `modules/<module>/<module>.yml`'s `design:` field (kebab-case name, e.g. `design: "ui"`).

- **No `design:` field** — no design module: build with plain elements and suggest `talos design:create`.
- Otherwise list its primitives and props, then import via the `@module/<design>/...` alias, matching the export style you find (per-file vs. barrel):

```bash
ls modules/<design>/src/components 2>/dev/null && cat modules/<design>/src/index.ts 2>/dev/null
```
```typescript
import { Button } from "@module/<design>/components/Button"; // per-file
import { Button } from "@module/<design>";                   // barrel
```

### 3. Complete the component

Replace the placeholder body with the real UI — a thin arranger over the design primitives. Follow the `optimize-ui` skill (interaction, motion, typography, color, surface): resolve every visual value from design-module tokens, never a hardcoded one-off; avoid AI-slop (`optimize-ui`'s `references/ai-slop.md`).

- Props type `<Name>PropsType`; prefer extending the underlying props (`React.ComponentProps<typeof Button>`) over redeclaring.
- Pure and presentational — no data fetching; receive via props or, for containers, a feature hook (`features/<feature>/hooks/`).
- **One component per file**, named after it; extract sub-pieces into their own file in the same folder.

```tsx
import { ArrowLeftIcon } from "@module/<design>/icons/ArrowLeftIcon";
import { Button } from "@module/<design>/components/Button";

type ButtonBackPropsType = Omit<React.ComponentProps<typeof Button>, "variant">;

export const ButtonBack = ({ children, ...props }: ButtonBackPropsType) => {
  return (
    <Button variant="outline" {...props}>
      <ArrowLeftIcon />
      {children ?? "Back"}
    </Button>
  );
};
```

### 4. Complete the test

Expand the generated spec to cover real behavior:

- Keep the `/// <reference lib="dom" />` directive and the `bun:test` + testing-library imports (`happydom.ts` registers DOM globals).
- Query by role/text/label, not test IDs; assert with jest-dom matchers.
- Cover: renders, each meaningful prop/variant, and user interactions (`@testing-library/user-event` or `fireEvent`) with their effect.
- Keep the relative import path (generator wires the correct depth) pointing at the component under test.

```tsx
/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ButtonBack } from "../../src/components/ButtonBack";

describe("ButtonBack", () => {
  test("renders the default label", () => {
    render(<ButtonBack />);
    expect(screen.getByRole("button")).toHaveTextContent("Back");
  });

  test("renders custom children", () => {
    render(<ButtonBack>Go back</ButtonBack>);
    expect(screen.getByRole("button")).toHaveTextContent("Go back");
  });
});
```

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.

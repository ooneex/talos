---
name: e2e-create
description: Generate a Playwright end-to-end test with its config, then complete the spec with real browser assertions.
when_to_use: Use when adding browser end-to-end tests (Playwright) to a module — a `.spec.ts` under `e2e/`, plus the module's `playwright.config.ts`.
model: sonnet
effort: low
allowed-tools: Bash(talos e2e:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Playwright E2E Test

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate a Playwright end-to-end test and its config, then complete the spec. Follow the shared workflow in the `talos-scaffold` skill (run-from-root and `--name`/`--module` inference); this covers only the e2e-specific parts.

**Unlike the other `*-create` generators:** the e2e test is a plain Playwright spec, not a DI-registered class — there is **no** module registration step and the class-identity test baseline does not apply.

## 1. Infer options, then run the generator

- `--name` — spec file name in PascalCase, from the flow under test (e.g. "e2e test for the checkout flow" → `Checkout`). The CLI strips a trailing `Spec`/`E2e` and writes `e2e/<Name>.spec.ts`.
- `--module` — target module (defaults to `shared`).

```bash
talos e2e:create --name=<name> --module=<module>
```

The generator creates:

- `modules/<module>/e2e/<Name>.spec.ts` — the test (overwrite is confirmed if it exists)
- `modules/<module>/playwright.config.ts` — the config (created once; an existing one is left untouched)
- an `"e2e": "bunx playwright test"` script in `modules/<module>/package.json` (added only when missing)
- `@playwright/test` as a root dev dependency, with browsers downloaded (`bunx playwright install`)

## 2. Complete the spec

Read `modules/<module>/e2e/<Name>.spec.ts` and replace the placeholder `playwright.dev` sample with tests for the actual flow. Base every assertion on the app being tested, not the template.

```typescript
import { test, expect } from '@playwright/test';

test('renders the home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/<Expected Title>/);
});

test('completes the primary user flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '<Link Name>' }).click();
  await expect(page.getByRole('heading', { name: '<Heading>' })).toBeVisible();
});
```

- Prefer role-/text-based locators (`getByRole`, `getByText`, `getByLabel`) over CSS selectors.
- Use web-first assertions (`await expect(locator).toBeVisible()`) so Playwright auto-waits.
- Cover the meaningful states (happy path plus at least one edge/error case where it applies).

## 3. Point the config at the app under test

Read `modules/<module>/playwright.config.ts` and, when the tests target the local app, uncomment and set:

- `use.baseURL` — so specs can call `page.goto('/')` with relative paths.
- `webServer` — the command and URL that boot the app before the run (e.g. `talos app:start`), with `reuseExistingServer: !process.env.CI`.

Trim the `projects` list to the browsers the suite needs; leave the defaults otherwise.

## 4. Lint and format

```bash
talos monorepo:check
```

Fix every failure before completing. The suite itself runs separately with `bun run e2e` inside `modules/<module>/` (or `talos e2e:run --modules=<module>` from the root — see the `e2e-run` skill) once the target app is running.

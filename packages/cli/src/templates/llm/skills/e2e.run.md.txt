---
name: e2e-run
description: Run the Playwright end-to-end suite across packages and modules with granular caching, then triage failures against the app under test.
when_to_use: Use when running existing Playwright e2e tests — a whole suite, a single module, or as a pre-merge gate. To author a new spec first, use e2e-create.
model: sonnet
effort: medium
allowed-tools: Bash(talos e2e:run *), Bash(talos monorepo:run *), Bash(talos app:start *), Read, Edit, Grep, Glob
argument-hint: [--modules=<a,b>] [--packages=<a,b>] [--logs] [--no-cache]
---

# Run E2E Tests

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Drive the Playwright end-to-end suite with `talos e2e:run` — the alias for `talos monorepo:run --commands=e2e`. This is the *runtime* workflow: scaffold new specs with `e2e-create`, then come back here to run them.

**Rules that apply throughout:**
- **Run every command from the monorepo root**, never from inside a package.
- **The app under test must be reachable.** A spec's `webServer` boots it (e.g. `talos app:start`); if a suite has no `webServer`, start the app yourself before running. A connection refused means the app or its Docker services aren't up.
- **Always pass `--logs` when running as an agent** — the interactive footer is for a TTY; `--logs` streams plain output you can read.
- **Only targets with an `e2e` script run.** Targets whose `package.json` lacks it are skipped without error, so an empty run usually means the module was never scaffolded with `e2e-create`.

## Run the suite

```bash
talos e2e:run --logs                          # run the e2e script across every package and module
talos e2e:run --modules=billing,user --logs   # only the named modules (also --packages=a,b)
talos e2e:run --no-cache --logs               # ignore the task cache and re-run everything
```

`e2e:run` runs each target's `e2e` script (`bunx playwright test`) in workspace dependency order, caching results in `var/cache/monorepo/` keyed by file content, transitive workspace deps, the script text, and root configs. The first failure stops the run and prints the failing task's output; a cache hit replays the previous logs. Use `--no-cache` when a spec's result depends on live app state the cache can't see (a running server, seeded data).

## Triage failures

When a spec fails, read the printed Playwright output, then:

1. **Locate the spec** — `modules/<module>/e2e/<Name>.spec.ts`. Read the failing assertion and the locator it targets.
2. **Decide test vs. app.** A locator that never resolves (`toBeVisible` timeout) usually means the UI changed — update the spec's role/text locator to match the real DOM. A wrong value or status means the app regressed — fix the app, not the assertion.
3. **Check the target.** Confirm `modules/<module>/playwright.config.ts` points `use.baseURL` / `webServer` at the app you intend to test; a stale `baseURL` makes every spec fail identically.
4. **Re-run scoped** — `talos e2e:run --modules=<module> --no-cache --logs` to confirm the fix without waiting on the whole suite.

Prefer web-first assertions (`await expect(locator).toBeVisible()`) and role-/text-based locators when editing a spec, matching the `e2e-create` conventions. Never weaken an assertion to make a real regression pass.

## Verify

Once green, run the full gate so the fix doesn't break lint/format or unit tests:

```bash
talos monorepo:check --modules=<module> --logs
```

If a failure stems from application code (a controller, DI, an entity) rather than the spec, hand off to the `debug` skill.

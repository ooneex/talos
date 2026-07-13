---
name: deslop
description: Remove AI-generated code slop from the working diff — unnecessary comments, out-of-place defensive checks and try/catch, `any` casts used to dodge types, and needless nesting. Use after generating or editing code and before committing, to make the diff read like it was written by hand in this codebase's style.
argument-hint: [module|files]
disallowed-tools: AskUserQuestion
---

# Remove AI Slop

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Check the diff against `main` and remove AI-generated slop introduced in the
branch. This is a style clean-up, not a rewrite — keep behavior unchanged
unless you find a clear bug along the way.

## Run from the project root

Run every command from the **monorepo root**.

## Scope

```bash
git status --porcelain
git diff main...HEAD
git diff
```

Review only the changed lines, and only the file they live in for surrounding
context. Limit to a module or file list if the user names one.

## Focus areas

- **Extra comments** — comments that restate what the code already says, or
  that don't match the file's existing comment density/style. Delete them; the
  code should read fine without narration. Keep a comment only if it captures a
  non-obvious *why* (a workaround, a hidden constraint, a subtle invariant).
- **Out-of-place defensive checks or try/catch** — null checks, type guards, or
  try/catch blocks wrapping trusted, internal code paths that can't actually
  fail the way they're guarded against. `@talosjs` domain errors are typed
  `Exception` subclasses thrown deliberately, not caught defensively at every
  call site — see `optimize-conventions`. Remove guards that exist "just in
  case" rather than because the surrounding code demonstrably needs them.
- **`any` casts used to dodge types** — `as any`, `: any`, or a chain of casts
  used only to silence a type error instead of fixing the underlying type. Fix
  the real type; if that's out of scope, say so instead of casting past it.
- **Needless nesting** — deeply nested conditionals that should be flattened
  with early returns/guard clauses, matching the project's existing style (see
  `optimize-conventions`'s performance rules).
- **Anything else inconsistent** with the file's and surrounding codebase's
  established style — naming, formatting, structure that doesn't match how the
  rest of the module does the same thing.

## Guardrails

- Keep behavior unchanged unless fixing a clear bug — and call out any bug fix
  explicitly rather than folding it in silently.
- Prefer minimal, focused edits over broad rewrites; don't restructure code
  beyond what removing the slop requires.
- Don't touch code outside the diff unless it's the direct context needed to
  judge a change (e.g. checking whether a try/catch is actually warranted).

## Verify

```bash
talos monorepo:check
```

Fix every failure before completing.

## Report

Keep the final summary concise (1-3 sentences): what was removed and why, and
anything left alone because it would change behavior.

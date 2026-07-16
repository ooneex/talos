---
name: deslop
description: Remove AI-generated code slop from the working diff — unnecessary comments, out-of-place defensive checks and try/catch, `any` casts used to dodge types, and needless nesting.
when_to_use: Use after generating or editing code and before committing, to make the diff read like it was written by hand in this codebase's style.
model: sonnet
effort: medium
agent: general-purpose
context: fork
argument-hint: [module|files]
---

# Remove AI Slop

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Check the diff against `main` and remove AI-generated slop introduced in the branch. A style clean-up, not a rewrite: **keep behavior unchanged unless you find a clear bug — and call any bug fix out explicitly rather than folding it in silently.** Prefer minimal, focused edits; don't restructure beyond what removing the slop requires. **Run every command from the monorepo root.**

## Scope

```bash
git status --porcelain
git diff main...HEAD
git diff
```

Review only the changed lines (plus surrounding file for context); don't touch code outside the diff unless it's the direct context needed to judge a change (e.g. whether a try/catch is warranted). Limit to a module or file list if the user names one.

## Focus areas

- **Extra comments** — comments that restate the code or don't match the file's comment density/style. Delete them; keep a comment only if it captures a non-obvious *why* (workaround, hidden constraint, subtle invariant).
- **Out-of-place defensive checks or try/catch** — null checks, type guards, or try/catch wrapping trusted internal paths that can't fail as guarded. `@talosjs` domain errors are typed `Exception` subclasses thrown deliberately, not caught defensively at every call site (see `optimize-conventions`). Remove guards that exist "just in case".
- **`any` casts used to dodge types** — `as any`, `: any`, or cast chains used only to silence a type error. Fix the real type; if that's out of scope, say so instead of casting past it.
- **Needless nesting** — deeply nested conditionals that should be flattened with early returns/guard clauses, matching the project's style (see `optimize-conventions`).
- **Anything else inconsistent** with the file's and codebase's established style — naming, formatting, structure that doesn't match how the rest of the module does the same thing.

## Verify

```bash
talos monorepo:check
```

Fix every failure before completing. Keep the final summary concise (1-3 sentences): what was removed and why, and anything left alone because it would change behavior.

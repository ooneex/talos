---
name: pr
description: Create a pull request for the current branch. Pushes the branch, analyzes the commits and diff against the base branch, then opens a PR with the GitHub CLI using a conventional title and a structured Summary / Changes / Testing body.
when_to_use: Use when the user wants to open a pull request for the current branch. Triggers on requests like "create a PR", "open a pull request", or "raise a PR".
model: sonnet
effort: medium
agent: general-purpose
context: fork
---

# Create Pull Request

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Open a pull request for the current branch. **Run every command from the monorepo root.** Requires the GitHub CLI (`gh`) installed and authenticated (`gh auth status`).

## Workflow

1. **Base branch** — usually `main` (`git remote show origin` to confirm the default).
2. **Current branch** — `git rev-parse --abbrev-ref HEAD`. If it is the base branch, create a feature branch first and move the work to it.
3. **Sync** — ensure `git status --porcelain` is clean. Commit any uncommitted changes yourself using the `commit` skill's module-grouping, type, and subject rules (`commit` is user-invoked only — do not invoke it as a tool).
4. **Push** — push using **only** the `gh` cli (never `git push`/`git pull` or ssh/http). Use `gh auth switch` to find the active account. Never force-push unless the user explicitly asks.
5. **Analyze** — review `git log <base>..<branch>` and `git diff <base>...<branch>` for scope.
6. **Open** — `gh pr create` with a conventional title and structured body.
7. **Report** — print the PR URL returned by `gh`.

## Title

`type(scope): Subject` — same `type`/`scope` rules as the `commit` skill. Single module → that module's scope; spans several → dominant scope or `common`. Subject: sentence-case, imperative, no trailing period, max 100 chars. Single-commit branch → reuse that commit's subject.

## Body

Factual to the diff — describe only what it changes; never invent testing that was not performed.

```markdown
## Summary

- What this PR does and why.

## Changes

- Notable changes grouped by module/package.

## Testing

- Commands run (e.g. `bun test`, `bun run lint`) and their result.
```

Example:

```bash
gh pr create \
  --base main \
  --head feature/user-auth \
  --title "feat(user): Add authentication service" \
  --body "$(cat <<'EOF'
## Summary

- Add `AuthService` with login/logout and session handling.

## Changes

- `modules/user/` — new `AuthService`, wired into the user module.
- `modules/user/tests/` — coverage for the auth flow.

## Testing

- `bun test` — passing
- `bun run lint` — passing
EOF
)"
```

## Special Cases

- **Draft work** — add `--draft` if the branch is clearly incomplete.
- **Existing PR** — if `gh pr view` shows one, update with `gh pr edit` instead of duplicating.
- **No remote / no `gh`** — report that the PR cannot be created and stop; do not attempt an alternative.

## Trailers & Conventions

- Do not add any `Co-Authored-By` or tool-attribution trailer to the title or body.
- Apply all coding conventions from the `optimize` skill.

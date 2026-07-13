---
name: pr
description: Create a pull request for the current branch. Pushes the branch, analyzes the commits and diff against the base branch, then opens a PR with the GitHub CLI using a conventional title and a structured Summary / Changes / Testing body.
disable-model-invocation: true
disallowed-tools: AskUserQuestion
---

# Create Pull Request

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Open a pull request for the current branch following the project's conventions.

## Important

Always run all commands from the **root of the project** (the monorepo root), not from inside individual packages.

This skill uses the GitHub CLI (`gh`). It must be installed and authenticated (`gh auth status`).

## Workflow

1. **Determine the base branch** — usually `main` (run `git remote show origin` to confirm the default branch).
2. **Check the current branch** — run `git rev-parse --abbrev-ref HEAD`. If it is the base branch, do not open a PR; create a feature branch first and move the work to it.
3. **Sync** — make sure all work is committed (`git status --porcelain` is clean). If there are uncommitted changes, stage and commit them yourself using the same module-grouping, type, and subject rules as the `commit` skill (see Commit Message Format below) — `commit` is user-invoked only, so do not rely on invoking it as a tool.
4. **Push** — run `git push -u origin <branch>`.
5. **Analyze** — review `git log <base>..<branch>` and `git diff <base>...<branch>` to understand the scope.
6. **Open the PR** — run `gh pr create` with a conventional title and a structured body.
7. **Report** — print the PR URL returned by `gh`.

## Title Format

```
type(scope): Subject line
```

- Same `type(scope)` rules as the `commit` skill (scope is `common` or a package/module directory name).
- If the branch touches a single module, scope is that module name; if it spans several, pick the dominant scope or `common`.
- Subject: sentence-case, imperative mood, no trailing period, max 100 chars.
- When the branch is a single commit, reuse that commit's subject as the title.

## Body Format

```markdown
## Summary

- Concise bullet points describing what this PR does and why.

## Changes

- Bullet list of notable changes grouped by module/package.

## Testing

- Commands run (e.g. `bun test`, `bun run lint`) and their result.
```

Keep the body factual — describe only what the diff actually changes. Do not invent testing that was not performed.

## Creating the PR

```bash
git push -u origin feature/user-auth

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

## Handling Special Cases

- **Draft work**: if the branch is clearly incomplete, add `--draft`.
- **Existing PR**: if `gh pr view` shows a PR already exists for the branch, update it with `gh pr edit` instead of creating a duplicate.
- **No remote / no `gh`**: report that the PR cannot be created and stop; do not attempt an alternative.

## PR Trailers

Do not add any `Co-Authored-By` or tool-attribution trailer to the PR title or body.

## Coding Conventions

Apply all coding conventions from the `optimize` skill.

---
name: commit
description: Create commit messages grouped by module. Analyzes git changes, groups files under modules/ by module name, and creates separate commits following the project's conventional-commit rules. Uses common scope for non-module changes.
disable-model-invocation: true
disallowed-tools: AskUserQuestion
---

# Commit by Module

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Create separate commits per modified module, following the project's conventional-commit rules.

## Important

Always run all commands from the **root of the project** (the monorepo root), not from inside individual packages.

Commit messages are linted by a git `commit-msg` hook (installed with `talos commitlint:init`, which runs `talos commitlint:check`). The available types, scopes, and other rules are described below.

## Workflow

1. **Analyze changes** — run `git status --porcelain`
2. **Group by module** — files under `modules/<name>/` → scope is the module name; all other files → scope `common`
3. **Screen for secrets** — before staging, skip anything that looks like a credential (`.env*`, `*.pem`, `*.key`, `*credentials*`, private keys, tokens). Do **not** commit these; surface them to the user instead.
4. **For each group** — stage the files, pick the commit type, commit with `type(scope): Subject`
5. **Push**
   - Prefer the `gh` CLI: first run `gh auth switch --hostname github.com` (or the repo's host) to make sure the active account matches the current repo's remote, then push with `git push` (or `git push -u origin <branch>` if there's no upstream yet)
   - If `gh auth switch` or the push through `gh` fails (not installed, no matching account, auth error), fall back to the normal SSH-based flow: plain `git commit` / `git push` using the repo's configured SSH remote
   - Never force-push (`--force`/`--force-with-lease`) unless the user explicitly asks for it

## Commit Message Format

```
type(scope): Subject line
```

### Valid Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring, renaming |
| `test` | Tests only |
| `chore` | Deps, configs, maintenance |
| `docs` | Documentation |
| `style` | Formatting only |
| `perf` | Performance |
| `build` | Build system |
| `ci` | CI/CD |
| `revert` | Revert previous commit |

### Scope Rules

- Files under `modules/<name>/` → module name in lower-case (e.g., `user`, `product`)
- All other files → `common`
- Scope must never be empty
- Any `modules/<name>` or `packages/<name>` directory name is automatically a valid scope — scopes are discovered at commit time, so there is no config to edit for a new module or package. If a meaningful scope cannot be determined, fall back to `common`

### Subject Rules

- Sentence-case, no trailing period, max 100 chars total
- Imperative mood ("Add" not "Added")

## Determining Commit Type

| Change | Type |
|--------|------|
| New files with functionality | `feat` |
| Bug fixes | `fix` |
| Restructuring, renaming | `refactor` |
| Only `*.spec.ts` files | `test` |
| Only `*.md` files | `docs` |
| Lock files, deps | `chore` |
| Build configs, scripts | `build` |
| CI/CD files | `ci` |
| Formatting only | `style` |

## Examples

```bash
# Multiple module changes + non-module files
git add modules/user/
git commit -m "feat(user): Add AuthService and update UserService"

git add modules/product/
git commit -m "refactor(product): Update Product entity and repository"

git add bun.lock packages/cache/
git commit -m "chore(common): Update dependencies and cache package"
```

## Handling Special Cases

- **Mixed feat + fix in one module**: use `feat` if primary change is new functionality; `fix` if primary is a bug fix; split into multiple commits if truly independent
- **Deleted files only**: use `refactor` (e.g., `refactor(user): Remove deprecated UserAdapter`)
- **Renamed/moved files**: use `refactor` (e.g., `refactor(product): Reorganize service file structure`)

## Commit Trailers

Do not add any `Co-Authored-By` trailer to commits.

## Coding Conventions

Apply all coding conventions from the `optimize` skill.

---
name: commit
description: Use when the user asks to create commits, commit current changes, group changes by Talos package, or apply this repository's conventional commit workflow.
metadata:
  short-description: Create package-scoped conventional commits
---

# Commit by Package

Create separate commits per changed package, following this repository's Conventional Commit rules.

## Important

Always run commands from the monorepo root.

Do not add any `Co-Authored-By` trailer.

## Workflow

1. Run `git status --porcelain` and inspect the changed files.
2. Group files under `packages/<name>/` by `<name>`.
3. Group root files, workspace config, lockfiles, and cross-package tooling as `common`.
4. Stage and commit each independent group separately.
5. Use a commit header in this exact format:

```text
type(scope): Subject line
```

## Valid Types

| Type | Use for |
| --- | --- |
| `feat` | New public behavior or package capability |
| `fix` | Bug fix |
| `refactor` | Restructuring, renaming, or API-neutral code change |
| `test` | Tests only |
| `chore` | Dependencies, metadata, generated release noise, maintenance |
| `docs` | Documentation only |
| `style` | Formatting only |
| `perf` | Performance improvement |
| `build` | Build system, package exports, workspace scripts |
| `ci` | CI/CD |
| `revert` | Revert previous commit |

## Scope Rules

- Files under `packages/<name>/` use `<name>` as the scope, for example `routing`, `cache`, or `http-request`.
- Repo-wide files use `common`.
- Release version bumps use `release`.
- Multiple scopes are allowed when one coherent change spans packages, for example `feat(app,routing): Add route cache metadata`.
- The scope must be lower-case, non-empty, and must exist in `.commitlintrc.ts`.
- If a package name is not in `.commitlintrc.ts`, stop and mention the missing scope instead of inventing one.

## Subject Rules

- Subject must be sentence-case, start-case, pascal-case, or upper-case.
- Use imperative mood: `Add`, `Fix`, `Remove`, not `Added`.
- No trailing period.
- Header max length is 100 characters.

## Type Selection

| Change | Type |
| --- | --- |
| New public API or new behavior | `feat` |
| Correct broken behavior | `fix` |
| Restructure without behavior change | `refactor` |
| Only `tests/` or `*.spec.ts` changes | `test` |
| Only Markdown docs | `docs` |
| Dependency or lockfile changes | `chore` |
| Package exports, bundling, Nx, Bun, or build scripts | `build` |
| GitHub Actions or CI config | `ci` |
| Formatting only | `style` |

## Examples

```bash
git add packages/routing
git commit -m "feat(routing): Add route parameter validation"

git add packages/cache packages/app
git commit -m "fix(app,cache): Preserve cache ttl on route responses"

git add package.json bun.lock nx.json
git commit -m "chore(common): Update workspace dependencies"
```

## Validation

Before committing, run the narrowest useful validation for the affected change. Prefer package-level commands for package-only work:

```bash
bun test packages/<name>/tests
bunx nx run @talosjs/<name>:build
```

For broad changes, use:

```bash
bun run build
bun run lint
bun run test
```

Apply the coding conventions from the `optimize` skill.

---
name: commit
description: Create commit messages grouped by module. Analyzes git changes, groups files under modules/ by module name, and creates separate commits following commitlint conventions. Uses common scope for non-module changes.
---

# Commit by Module

Create separate commits per modified module, following the project's commitlint conventions.

## Important

Always run all commands from the **root of the project** (the monorepo root), not from inside individual packages.

Check the `.commitlintrc.ts` file in the root of the project to know the available types, scopes, and other rules.

## Workflow

1. **Analyze changes** — run `git status --porcelain`
2. **Group by module** — files under `modules/<name>/` → scope is the module name; all other files → scope `common`
3. **For each group** — stage the files, pick the commit type, commit with `type(scope): Subject`
4. **Push** — after all commits are created, run `git push`

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
- If the module name doesn't match a valid commitlint scope, add the missing scope to the `scope-enum` list in `.commitlintrc.ts` (keep it lower-case and alphabetically grouped with related scopes); only fall back to `module` if a meaningful scope cannot be determined

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

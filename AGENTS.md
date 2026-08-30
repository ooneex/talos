# AGENTS.md

Router for AI coding assistants working on **Talos itself**. Every capability below ships as a **skill** (a task procedure) under `.claude/skills/<name>/SKILL.md` — load the one that matches the task instead of improvising. This file stays small on purpose.

## Project

Talos is the framework, not an app built with it. This repo is a Bun workspace of 60+ independent `@talosjs/*` TypeScript packages under `packages/*`, each versioned and published on its own, plus the Rust CLI in `packages/cli` (binary `talos`, installed with an `oo` symlink).

There is **no `modules/` directory here** — that layout belongs to applications generated from Talos. Skills that talk about modules, spa, design or swagger live in the Skeleton repo (see [Two repos](#two-repos)).

```
packages/<name>/
  src/           # index.ts is the public entry; types.ts holds the Type/I exports
  tests/         # mirrors src/, one <File>.spec.ts per source file
  package.json  tsconfig.json  bunup.config.ts  bunfig.toml  README.md  CHANGELOG.md  LICENSE
packages/cli/
  src/commands/  # one .rs per command, registered + dispatched in mod.rs
  src/templates/completions/  # _talos, _oo, bash, fish — hand-maintained, baked in with include_str!
  src/templates/llm/          # assistant adapters used by `talos agent:skills:create`
```

## CLI first

Reach for the `talos` CLI before doing the same work by hand — it is faster, deterministic, cached, and costs a fraction of the tokens. Run everything **from the workspace root**. Package manager is `bun`/`bunx` only, never `npm`, `npx`, `yarn` or `pnpm`.

```bash
talos fmt                             # Biome format across the workspace
talos lint                            # tsc --noEmit + Biome lint (cargo clippy for the CLI)
talos test                            # bun test per package (cargo test for the CLI)
talos build                           # bunup per package
talos check                           # build + fmt + lint + test, one report (alias of workspace:check)
talos check --packages=cache,routing  # scope any of the above to named packages
talos check --logs --no-cache         # stream task output / bypass var/cache
talos check --output=md               # also write var/outputs/talos_check.md for an agent to fix
talos coverage                        # per-package line and function coverage
talos security:check                  # OSV.dev audit of every lockfile + LLM config audit
talos performance:check               # performance rules over the sources
talos project:check --strict          # the whole-project gate, every check aggregated
talos project:check --output=md       # also write var/outputs/talos_project_check.md for an agent to fix
talos release:create                  # detect unreleased commits, bump, changelog, tag, push
```

`talos help` and `talos <command> --help` list what exists — check there before writing a manual procedure. Inside a single package, `bun test tests`, `bunx biome check --write` and `bun run build` still work.

## Skills

This repo ships skills only; the agents live in Skeleton and target generated apps.

| Task | Skill |
|---|---|
| Scaffold a new `@talosjs/<name>` package | `package-create` |
| Audit a package and file one YAML issue per finding | `issue-found` |
| Create a single issue by hand | `issue-create` |
| Restructure / split an issue | `issue-improve` |
| Implement an issue, then fmt + lint + test | `issue-fix` |
| Enforce conventions, drop duplication and trivial tests | `optimize` |
| Commit, grouped by package | `commit` |
| Finish a new or changed CLI command | `cli-command-integrate` |

### Issues

YAML under `packages/<package>/issues/<ID>.yml`, `state` always `Todo` on creation. Flow: `issue-found` (audit) → `issue-improve` (structure) → `issue-fix` (implement) → `commit`.

### Two repos

`/Volumes/Projects/Ooneex/Skeleton` (github.com/ooneex/skeleton) holds the canonical assistant config that `talos agent:skills:create` clones and installs into a generated project for each of the eleven supported assistants. Claude content lives under `.claude/`; Codex has native `.codex/skills/` and `.codex/agents/*.toml` sources exposed through `.agents/skills/`. Other assistants are adapted from the Claude source. Those documents describe **applications** built on Talos; the ones in this repo describe **the framework**.

So a change to a CLI command's name, flags or behaviour is not done when it compiles: the four completion templates and the matching Skeleton skill have to follow. That is exactly what `cli-command-integrate` covers — run it as the last step of adding or changing a command in `packages/cli/src/commands/`.

## Package catalogue

Grouped by domain; read the package's `README.md` and `src/index.ts` for its real surface.

| Domain | Packages |
|---|---|
| Application & architecture | `app`, `app-env`, `container`, `module`, `service`, `repository`, `command`, `exception`, `types`, `utils`, `cli` |
| HTTP & routing | `routing`, `controller`, `middleware`, `http-request`, `http-request-file`, `http-response`, `http-header`, `http-mimes`, `http-status`, `fetcher`, `url`, `rate-limit` |
| Real-time | `socket`, `socket-client`, `event` |
| Data & persistence | `database`, `entity`, `migrations`, `seeds`, `cache`, `storage`, `rag` |
| Auth & access control | `auth`, `jwt`, `permission`, `role`, `user` |
| AI & integrations | `ai`, `analytics`, `linear`, `mailer`, `payment`, `payment-stripe`, `youtube`, `youtube-utils` |
| Cross-cutting services | `logger`, `cron`, `validation`, `feature-flag`, `translation`, `queue`, `workflow` |
| Files & formats | `fs`, `csv`, `json`, `yml`, `html`, `pdf` |
| Reference data & helpers | `color`, `country`, `currencies`, `hour-utils` |

Intra-repo dependencies are declared as `"@talosjs/<name>": "workspace:^"`, and a package only depends on what it truly imports — a package that would drag half the ecosystem in is a design smell, not a dependency list to extend.

## Conventions

Full rules live in the `optimize` skill; the load-bearing ones:

- **Visibility** — explicit `public` / `private` / `protected` on every class member.
- **Naming** — type aliases end with `Type`, interfaces start with `I`. DI decorators enforce class-name suffixes (`Service`, `Repository`, `Middleware`, `Cron`) and throw a `ContainerException` at startup otherwise.
- **Arrow functions** everywhere except class methods.
- **No non-null assertions** — use defaults or optional types.
- **No `any`, no `console`**, no unused imports or variables — all Biome errors.
- **Never read `process.env` directly** — inject `AppEnv` from `@talosjs/app-env` and read typed properties.
- **Exceptions** extend `Exception` from `@talosjs/exception` and carry an HTTP status plus structured data; throw them instead of returning `null` or error codes.
- **TypeScript is strict** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, decorators with `emitDecoratorMetadata`, ES2022 / ESNext / bundler resolution. Packages extend the root `tsconfig.json` and never relax it.
- **Biome** formats at 120 columns, 2-space indent, LF.

## Testing

- `tests/` mirrors `src/` with a `.spec.ts` per source file holding behaviour.
- Every public method with logic gets at least one happy-path and one edge-case test.
- No trivial existence checks; test real behaviour.
- Deterministic — no random values, no time-dependent data.
- Run with `talos test` at the root, or `bun test tests` inside a package. The Rust CLI runs its own suite through `packages/cli/scripts/coverage.sh`.

## Commits

`type(scope): Subject` — checked by a git `commit-msg` hook (`talos commitlint:init` / `talos commitlint:check`).

- **Type**: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `build`, `ci`, `revert`.
- **Scope**: the package directory name (`routing`, `cache`, `cli`); anything outside `packages/` uses `common`. Never empty.
- **Subject**: sentence-case, imperative, no trailing period, 100 characters max for the whole line.
- Do **not** add a `Co-Authored-By` trailer.

```bash
feat(country): Add getCities lookup backed by the cities dataset
fix(cli): Gate unix permission handling behind cfg(unix) for Windows builds
chore(common): Update bun.lock
chore(release): @talosjs/workflow@1.1.5
```

Use the `commit` skill — it groups the working tree by package, screens for secrets, and pushes.

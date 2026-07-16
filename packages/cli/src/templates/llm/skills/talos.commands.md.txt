---
name: talos-commands
description: Reference for the `talos` CLI commands — app lifecycle, module/design/spa/microservice/SDK/docker scaffolding, database migrations and seeds, monorepo task running, releases, and issues.
when_to_use: Use when you need the exact command or flags to run a project task from the terminal.
user-invocable: false
---

# talos CLI Commands

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

Always run from the project root.

## Bootstrap
```bash
talos app:create [--name <name>] [--destination <path>]  # Scaffold a brand-new project (app + shared modules, deps, optional CI/CD)
talos app:init [--name <name>] [--destination <path>]     # (Re)write project config (biome, tsconfig, git, commit-msg hook, env, assistant skills)
talos commitlint:init                                     # Install a git commit-msg hook that lints commit messages (runs commitlint:check)
talos commitlint:check --file <path>                      # Lint a commit message file against the type(scope): Subject rules
```

`app:create` also generates Docker files and runs `app:init` (project config only) automatically.

## Application
```bash
talos app:start                   # Start Docker services + all runnable modules with hot reload
talos app:start --modules=a,b     # Start only the modules named "a" and "b"
talos app:start --packages=a,b    # Alias for --modules
talos app:stop                    # Stop the app module's Docker stack (started for api/microservice modules)
talos app:stop --modules=a,b      # Stop the Docker stack when the named modules include an api/microservice
```

## Generators
```bash
talos module:create --name <name>        # Scaffold a module
talos module:remove --name <name>        # Remove a module + all references
talos design:create --name <name>        # Scaffold a design module (from @talosjs/design)
talos design:remove --name <name>        # Remove a design module + all references
talos spa:create --name <name>           # Scaffold a spa module (from @talosjs/spa)
talos spa:remove --name <name>           # Remove a spa module + all references
talos microservice:create --name <name>  # Scaffold a microservice
talos microservice:remove --name <name>  # Remove a microservice + all references
talos sdk:create                         # Generate a browser SDK from module controllers
talos docker:create --name <service>     # Add a Docker service to docker-compose.yml

# Issues
talos issue:create --id <id> --title <title> [--module <name>]  # YAML skeleton (non-interactive)
talos issue:create --interactive [--module <name>]              # Prompt for ID/title/description
talos issue:pull [--id <id>] [--module <name>]                  # Pull a Linear issue as YAML
talos issue:push [--id <id>]                                    # Push a local issue YAML to Linear
```

Class generators share the form `talos <artifact>:create --name <Name> --module <name>`, where `<artifact>` is one of:
`ai:chat` (chat class), `ai:middleware` (chat middleware), `ai:tool` (chat tool), `analytics` (handler), `cache` (handler), `command` (CLI/`ICommand`), `controller` (HTTP/WS), `cron` (job), `database` (adapter), `entity` (TypeORM), `event` (pub/sub), `flag` (feature flag), `logger`, `mailer` (class + JSX template), `middleware` (HTTP/WS), `permission`, `queue` (BullMQ job queue), `rate-limit` (throttling strategy / `IRateLimiter`), `repository`, `service`, `spa:feature` (SPA feature slice), `storage`, `translation` (localized dictionary), `vector-database`.

The matching `/<artifact>-create` skills wrap these generators, complete the code + tests, and share the `talos-scaffold` workflow (run-from-root, option inference, module registration, lint/format, conventions).

## Custom commands
```bash
talos command:create --name <Name> --module <name>  # Scaffold a custom ICommand class
talos command:run <command-name> [args...]           # Run a custom command (matched by its getName()) across modules
```

`command:run` matches the `getName()` of every command in `modules/*/src/commands` and executes it via the module's `bin/command/run.ts`, forwarding extra args.

## Workflows
```bash
talos workflow:create --name <Name> --module <name>             # Scaffold a workflow (from @talosjs/workflow)
talos workflow:transition:create --name <Name> --module <name>  # Scaffold a workflow transition (one step)
```

A workflow orchestrates an ordered list of conditional, reversible transitions with automatic rollback on failure. Generate each step with `workflow:transition:create`, then list the transition classes in the workflow's `getTransitions()`. The `/workflow-create` and `/workflow-transition-create` skills wrap these.

## Database
```bash
talos migration:create --module <name>   # Generate a timestamped migration
talos migration:up [--drop]              # Run pending migrations (--drop: drop DB first)
talos migration:down [--version <v>]     # Roll back the latest migration (or the one matching --version)
talos seed:create --module <name>        # Generate a seed YAML file
talos seed:run [--drop]                  # Run all seeds (--drop: drop data first)
```

## Monorepo tasks
```bash
talos monorepo:run --commands=build,lint,test                # Run scripts across every package and module, with caching
talos monorepo:run --commands=build --modules=billing,user   # Only the named modules (also --packages=a,b)
talos monorepo:run --commands=test --logs                    # Stream plain logs (use in CI/non-interactive runs)
talos monorepo:run --commands=build --no-cache               # Ignore the task cache and re-run everything
talos e2e:run [--modules=a,b] [--logs] [--no-cache]          # Alias for monorepo:run --commands=e2e — run the Playwright e2e suite
talos monorepo:check                                         # Install, build, fmt, lint and test — the full gate
talos monorepo:check --modules=billing,user --logs           # Scope the gate to the named modules (also --packages=a,b)
```

`monorepo:run` runs each command as a group (all `build`, then all `lint`, …) in workspace dependency order. Targets whose package.json lacks the script are skipped silently; the first failure stops the run and prints its output. Results are cached in `var/cache/monorepo/`, keyed by target file content, transitive workspace deps, script text, and root configs — a cache hit replays logs and restores output artifacts (`dist/` by default). Always pass `--logs` as an agent.

`monorepo:check` is shorthand for `monorepo:run --commands=install,build,fmt,lint,test` — the full verification gate in that order, with the same caching, filtering (`--packages`/`--modules`), `--logs`, and `--no-cache` flags.

## Release
```bash
talos release:create   # Detect unreleased commits, bump versions, update changelogs, tag, push
```

## Publish
```bash
talos npm:publish                                  # Publish every package and module to npm (skips versions already on the registry)
talos npm:publish --packages=cli,command           # Only the named packages (also --modules=a,b)
talos npm:publish --access=restricted              # Publish with restricted registry access (default: public)
talos docker:publish                               # Build and push a Docker image for every package/module that has a Dockerfile
talos docker:publish --modules=billing,user        # Only the named modules (also --packages=a,b)
talos docker:publish --tag=edge                    # Override the image tag (default: package.json version, else latest)
```

`npm:publish` packs each target with `bun pm pack` (so workspace deps resolve to real version ranges), then publishes the extracted copy with `npm`, reading the token from `~/.talos/credentials/npm.yml`. `docker:publish` logs in once with `~/.talos/credentials/docker.yml`, then for each target shipping a `Dockerfile` runs `docker build`/`docker push`, tagging `<username>/<name>:<tag>` (non-`docker.io` registries are prefixed). Both accept `--packages`/`--modules` (comma-separated; default all) and `--silent`. Run the matching `*:credentials:create` first.

## Credentials
```bash
talos npm:credentials:create [--token <token>]                                             # Save an npm Granular Access Token to ~/.talos/credentials/npm.yml
talos github:credentials:create [--token <token>]                                          # Save a GitHub Personal Access Token to ~/.talos/credentials/github.yml
talos gitlab:credentials:create [--token <token>]                                          # Save a GitLab Personal Access Token to ~/.talos/credentials/gitlab.yml
talos bitbucket:credentials:create [--username <user>] [--token <token>]                   # Save a Bitbucket app password to ~/.talos/credentials/bitbucket.yml
talos linear:credentials:create [--token <token>]                                          # Save a Linear Personal API key to ~/.talos/credentials/linear.yml
talos jira:credentials:create [--base-url <url>] [--email <email>] [--token <token>]       # Save a Jira API token to ~/.talos/credentials/jira.yml
talos docker:credentials:create [--registry <host>] [--username <user>] [--token <token>]  # Save a Docker registry access token to ~/.talos/credentials/docker.yml
```

Credentials are stored per-user under `~/.talos/credentials/*.yml` in a `profiles.default` block. Each command prompts (masked) for anything not passed as a flag and prints the URL where the token can be created.

The `*:secret:push` commands create/update a CI secret on the repository resolved from the `origin` remote in the current directory's `.git/config`. Each prompts (masked) for name/value when not passed as a flag, then prints the settings URL:
```bash
talos github:secret:push [--name <name>] [--value <value>]                                 # GitHub Actions secret; reads github.yml, encrypts via `gh secret set`
talos gitlab:secret:push [--name <name>] [--value <value>]                                 # GitLab masked CI/CD variable; reads gitlab.yml, uses the GitLab API
talos bitbucket:secret:push [--name <name>] [--value <value>]                              # Bitbucket secured Pipelines variable; reads bitbucket.yml, uses the Bitbucket API
```

`github:secret:push` requires the `gh` CLI (it performs the local encryption GitHub mandates); `gitlab:secret:push` and `bitbucket:secret:push` call the provider REST APIs directly. Run the matching `*:credentials:create` first.

## Assistant & Shell setup
```bash
talos agent:skills:create  # Write AGENTS.md + skills/agents for the selected assistants (.claude, .codex, ...)
talos completion:zsh       # Install Zsh tab-completion for the talos commands (~/.zsh)
```

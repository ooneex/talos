# AGENTS.md

Guidance for AI coding agents in this repository.

A lean index. Coding conventions, reference, and task workflows live in conditionally-activated **skills** (below) so this file stays small and avoids loading unused context. Reach for a skill when you need the detail behind a task.

## Project Overview

{{NAME}} is a modular, enterprise-grade TypeScript/Bun backend powered by the **@talosjs** ecosystem. Code lives in independent modules under `modules/`, each owning its controllers, services, repositories, entities, migrations, and seeds.

## Skills

Skills load on demand — invoke or let them activate when relevant; don't duplicate their content here.

**Reference**
- `talos-packages` — full @talosjs package catalog (pick the right package for a feature).
- `talos-architecture` — choosing/combining execution architectures (event-driven, queue, workflow, cron, real-time).
- `talos-commands` — the `talos` CLI commands (app lifecycle, generators, database, monorepo tasks, release, issues).
- `talos-module` — backend module directory structure plus DI, exception, and TypeScript patterns with examples.
- `talos-design` — design-system (front-end design module) directory structure, per-folder guidance.
- `talos-spa` — single-page-app module directory structure, per-folder guidance.
- `talos-env` — reading environment variables via the injected `AppEnv`.
- `talos-scaffold` — shared workflow behind every `<artifact>-create` generator (run-from-root, `--name`/`--module` inference, registration, lint/format, test baseline).

**Generators**
- `/module-create` — scaffold a whole module and complete its first vertical slice.
- `/<artifact>-create` scaffolds a single artefact and completes its code + tests: `ai-chat`, `ai-middleware`, `ai-tool`, `analytics`, `cache`, `command`, `controller`, `cron`, `database`, `e2e`, `entity`, `event`, `flag`, `logger`, `mailer`, `middleware`, `migration`, `permission`, `queue`, `rate-limit`, `repository`, `seed`, `service`, `spa-feature`, `storage`, `translation`, `vector-database`.
- `/sdk-create` — generate a typed browser SDK from an app or microservice's controllers.
- `/workflow-create` + `/workflow-transition-create` — scaffold a transition-based workflow (from `@talosjs/workflow`) and its conditional, reversible steps.

**Workflow**
- `/commit` — group changes by module into scoped conventional commits.
- `/pr` — push the current branch and open a pull request with a conventional title and structured body.
- `/review` — review the working diff against @talosjs conventions + Clean Architecture, then fix.
- `/debug` — diagnose and fix a failing test, exception, or startup error.
- `/database-migrate` — apply/roll back migrations, run seeds, verify the schema.
- `/e2e-run` — run the Playwright e2e suite across packages and modules, then triage failures.
- `/optimize` — enforce coding conventions across a module.
- `/translation-translate` — translate/complete a module's `translations.json`/`translations.yml` dictionaries (optionally extracting hardcoded text) into the target locales.
- `/issue-found`, `/issue-plan`, `/issue-fix` — audit, plan, and implement issues.

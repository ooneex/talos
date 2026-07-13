# AGENTS.md

Guidance for AI coding agents working in this repository.

This file is a lean index. Coding conventions, reference, and task workflows
all live in conditionally-activated **skills** (see the index below) so this
file stays small and avoids loading unused context. Reach for a skill when you
need the detail behind a task.

## Project Overview

{{NAME}} is a modular, enterprise-grade TypeScript/Bun backend powered by the **@talosjs** ecosystem. Code lives in independent modules under `modules/`, each owning its controllers, services, repositories, entities, migrations, and seeds.

## Skills

Skills load on demand based on the task — invoke or let them activate when relevant; do not duplicate their content here.

**Reference**
- `talos-packages` — the full @talosjs package catalog (choosing the right package for a feature).
- `talos-architecture` — choosing and combining execution architectures (event-driven, queue, workflow, cron, real-time).
- `talos-commands` — the `talos` CLI commands (app lifecycle, generators, database, monorepo tasks, release, issues).
- `talos-module` — backend module directory structure and the DI, exception, and TypeScript patterns with examples.
- `talos-design` — design-system (front-end design module) directory structure with per-folder guidance.
- `talos-spa` — single-page-app module directory structure with per-folder guidance.
- `talos-env` — reading environment variables via the injected `AppEnv`.
- `talos-scaffold` — shared workflow behind every `<artifact>-create` generator (run-from-root, `--name`/`--module` inference, registration, lint/format, test baseline).

**Generators**
- `/module-create` — scaffold a whole module and complete its first vertical slice.
- `/<artifact>-create` scaffolds a single artefact and completes its code + tests: `ai-chat`, `ai-middleware`, `ai-tool`, `analytics`, `cache`, `command`, `controller`, `cron`, `database`, `entity`, `event`, `flag`, `logger`, `mailer`, `middleware`, `migration`, `permission`, `queue`, `rate-limit`, `repository`, `seed`, `service`, `spa-feature`, `storage`, `translation`, `vector-database`.
- `/sdk-create` — generate a typed browser SDK from an app or microservice's controllers.
- `/workflow-create` + `/workflow-transition-create` — scaffold a transition-based workflow (from `@talosjs/workflow`) and its conditional, reversible steps.

**Workflow**
- `/commit` — group changes by module into scoped conventional commits.
- `/pr` — push the current branch and open a pull request with a conventional title and structured body.
- `/review` — review the working diff against @talosjs conventions + Clean Architecture, then fix.
- `/debug` — diagnose and fix a failing test, exception, or startup error.
- `/database-migrate` — apply/roll back migrations, run seeds, and verify the schema.
- `/optimize` — enforce coding conventions across a module.
- `/translation-translate` — translate/complete a module's `translations.json`/`translations.yml` dictionaries (and optionally extract hardcoded text) into the target locales.
- `/issue-found`, `/issue-plan`, `/issue-fix` — audit, plan, and implement issues.

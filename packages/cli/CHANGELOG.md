# Changelog

## [0.1.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.1.0) - 2026-08-09

### Added

- Rewrite docker-compose container names on app:init| — Franck ([c3f8dde0](https///github.com/ooneex/talos/commit/c3f8dde0))
- Add update and add commands with shell completions| — Franck ([310545ff](https///github.com/ooneex/talos/commit/310545ff))
- Enhance LLM assistant templates and security check for skills| — Franck ([c9f6e61a](https///github.com/ooneex/talos/commit/c9f6e61a))
- Add ai:skill:create command and port management utilities|- Add ai:skill:create command for scaffolding new AI skill classes — Franck ([e10b922c](https///github.com/ooneex/talos/commit/e10b922c))
- Add OpenRouter credentials provider| — Franck ([f23f7df9](https///github.com/ooneex/talos/commit/f23f7df9))
- Publish a complete specification and lift JSDoc off the controllers|render_openapi emitted an operationId, a summary and a bare 200. It now emits — Julien ([4d97eafc](https///github.com/ooneex/talos/commit/4d97eafc))
- Add storage:pull and storage:push commands with S3/R2/Bunny support| — Franck ([c5c63862](https///github.com/ooneex/talos/commit/c5c63862))
- Parse nested object literals into nested route fields| — Julien ([c78ee267](https///github.com/ooneex/talos/commit/c78ee267))
- Regenerate route metas from the registered controllers on every run| — Julien ([db739ab9](https///github.com/ooneex/talos/commit/db739ab9))
- Extract the response shape and stop writing empty keys| — Julien ([0e5bc727](https///github.com/ooneex/talos/commit/0e5bc727))
- Detect RequestFile payloads and mark the route multipart| — Julien ([b4c2b7ad](https///github.com/ooneex/talos/commit/b4c2b7ad))
- Adopt tracker-assigned issue ids and repoint dependencies| — Franck ([a9831fef](https///github.com/ooneex/talos/commit/a9831fef))
- Write routes and spec only when regenerating an existing swagger| — Julien ([be9e68be](https///github.com/ooneex/talos/commit/be9e68be))
- Fold coverage measurement into project:check workspace gate| — Franck ([905ac899](https///github.com/ooneex/talos/commit/905ac899))
- Run monorepo:check tests through coverage_check with thresholds| — Franck ([9b7c9602](https///github.com/ooneex/talos/commit/9b7c9602))
- Measure Rust crates in coverage:check with cargo llvm-cov| — Franck ([e571eba2](https///github.com/ooneex/talos/commit/e571eba2))
- Add caching and --strict gating to coverage:check| — Franck ([12329cd9](https///github.com/ooneex/talos/commit/12329cd9))
- Add coverage:check command and bunfig.toml to module scaffolding| — Franck ([7f7c1ae9](https///github.com/ooneex/talos/commit/7f7c1ae9))
- Register swagger commands in CLI and update help| — Julien ([0740c1fc](https///github.com/ooneex/talos/commit/0740c1fc))
- Add swagger:create and swagger:remove commands with frontend module utilities| — Julien ([2ce849cb](https///github.com/ooneex/talos/commit/2ce849cb))
- Add duplication check to project:check| — Franck ([77420a66](https///github.com/ooneex/talos/commit/77420a66))
- Add marketing:create command for social media posts| — Franck ([34ea3a84](https///github.com/ooneex/talos/commit/34ea3a84))
- Add unified credentials:create command for more providers| — Franck ([b65baeba](https///github.com/ooneex/talos/commit/b65baeba))
- Add dragonfly docker service to docker:create| — Franck ([57e66e26](https///github.com/ooneex/talos/commit/57e66e26))
- Add health check probe validation and refactor translation scanning| — Franck ([b9e79cab](https///github.com/ooneex/talos/commit/b9e79cab))
- Add description field and stricter name validation to routes|- Add description field to Route struct for OpenAPI documentation — Franck ([a4925110](https///github.com/ooneex/talos/commit/a4925110))
- Skip undeclared scripts in monorepo run and make script discovery explicit|- Add direct_scripts field to MonorepoTarget to track targets without package.json — Franck ([124d1f48](https///github.com/ooneex/talos/commit/124d1f48))
- Expand project:check with modularized health check implementations| — Franck ([3fb3f3b2](https///github.com/ooneex/talos/commit/3fb3f3b2))
- Add link-cloaking and untrusted-link detection to LLM security audit| — Franck ([67875a3c](https///github.com/ooneex/talos/commit/67875a3c))
- Expand project:check with project health checks and modularize check implementations| — Franck ([0d23d37c](https///github.com/ooneex/talos/commit/0d23d37c))
- Add thirteen new project:check implementations|Adds bundle, complexity, entities, imports, lockfile, orphans, outdated, — Franck ([6dd30b9f](https///github.com/ooneex/talos/commit/6dd30b9f))
- Make every project check Rust and Python aware| — Franck ([a24a7bd2](https///github.com/ooneex/talos/commit/a24a7bd2))
- Add an LLM configuration security audit to security:check|Scan every supported assistant's agents, skills, rules, commands and MCP — Franck ([722014a6](https///github.com/ooneex/talos/commit/722014a6))
- Expand project:check with eleven new health checks|Add structure, conventions, env, dependencies, docker, migrations, — Franck ([fa184dad](https///github.com/ooneex/talos/commit/fa184dad))
- Add project:check as the whole-project health gate|Run six checks — workspace (monorepo:run install/build/fmt/lint/test), — Franck ([70125d11](https///github.com/ooneex/talos/commit/70125d11))
- Add issue:check command to validate issue YAML conventions|Strictly validate every issues/*.yml file across modules and packages: — Franck ([544d68cf](https///github.com/ooneex/talos/commit/544d68cf))
- Add issue:convert command to bundle issues into issues.json|Convert each destination module/package's issues/*.yml files into a single — Franck ([0672b533](https///github.com/ooneex/talos/commit/0672b533))
- Auto-refresh the stale skeleton template cache after 24h|Add is_cache_stale() to utils::skeleton so clone_skeleton() re-downloads — Franck ([15aac548](https///github.com/ooneex/talos/commit/15aac548))
- Support GitHub as an issue:pull/issue:push provider|Add a --provider flag (linear, default | github) to issue:pull and — Franck ([4a1db547](https///github.com/ooneex/talos/commit/4a1db547))
- Support pushing multiple issues and a Testing section|Let issue:push accept a comma-separated --id list, resolving each id's — Franck ([49a14c44](https///github.com/ooneex/talos/commit/49a14c44))
- Support pulling multiple Linear issues and updating in place|Extract the Linear GraphQL client and issue-description parsing out of — Franck ([2daf3ec8](https///github.com/ooneex/talos/commit/2daf3ec8))
- Add --target flag to admin:create and spa:create|Let admin:create/spa:create link the scaffolded frontend to an existing — Franck ([5fcf2ac8](https///github.com/ooneex/talos/commit/5fcf2ac8))
- Add admin:create and admin:remove commands|Scaffold and remove an admin module the same way spa:create/spa:remove and — Franck ([1616e8ee](https///github.com/ooneex/talos/commit/1616e8ee))
- Add security:check command to audit modules for vulnerabilities|Discover bun, rust and python modules by their lockfiles and run — Franck ([1ebd39bf](https///github.com/ooneex/talos/commit/1ebd39bf))
- Add storybook:create and storybook:remove commands|Scaffold and remove a storybook module the same way spa:create/spa:remove — Franck ([a794e3de](https///github.com/ooneex/talos/commit/a794e3de))
- Stream and label per-module logs in app:start|Piping every module's stdout/stderr straight to the parent process made — Franck ([81e4b27d](https///github.com/ooneex/talos/commit/81e4b27d))
- Gate release:create on a full build/fmt/lint/test pass|Run monorepo:run build,fmt,lint,test across the affected packages/modules — Franck ([0c76218a](https///github.com/ooneex/talos/commit/0c76218a))
- Skip monorepo:run test tasks for targets with no test files|A target with a test script but an empty or missing tests/ directory — Franck ([7015fadd](https///github.com/ooneex/talos/commit/7015fadd))
- Switch the 'oo' alias to a symlink and add uninstall scripts|Shell-profile aliases required restarting the shell and could drift from — Franck ([7d7528cb](https///github.com/ooneex/talos/commit/7d7528cb))
- Add --no-cache to the remaining scaffolding commands|Extend skeleton_templates_dir to accept a use_cache flag and wire a — Franck ([d4bd095d](https///github.com/ooneex/talos/commit/d4bd095d))
- Add an 'oo' alias and shell completions to the installers|The install scripts now register an 'oo' shell alias/function for the — Franck ([c533ec36](https///github.com/ooneex/talos/commit/c533ec36))
- Bump Cargo.toml version during release:create for Rust packages|Detect a Cargo.toml alongside package.json, patch its [package] version to — Franck ([92f93db9](https///github.com/ooneex/talos/commit/92f93db9))
- Allow agent skills scaffolding to reuse an existing source dir| — Franck ([540a3d35](https///github.com/ooneex/talos/commit/540a3d35))
- Load agent templates from skeleton repo instead of bundled files| — Franck ([1369a4fd](https///github.com/ooneex/talos/commit/1369a4fd))
- Add storybook skill templates for story creation and architecture reference| — Franck ([8ad82f86](https///github.com/ooneex/talos/commit/8ad82f86))
- Add persisted file-hash cache to monorepo fingerprinting| — Franck ([f17b9fa4](https///github.com/ooneex/talos/commit/f17b9fa4))
- Add selectRunnableModules for module filtering| — Franck ([b3c92ea4](https///github.com/ooneex/talos/commit/b3c92ea4))
- Support storybook and swagger runnable modules| — Franck ([122132b3](https///github.com/ooneex/talos/commit/122132b3))
- Add project.update skill template and update templates| — Franck ([5c579a63](https///github.com/ooneex/talos/commit/5c579a63))
- Add React component test scaffolding and completions| — Franck ([e6ef5f25](https///github.com/ooneex/talos/commit/e6ef5f25))
- Add ReactComponentCreate command| — Franck ([7b18cea7](https///github.com/ooneex/talos/commit/7b18cea7))
- Add prompt wrapper with clean cancel handling| — Franck ([3105a3f8](https///github.com/ooneex/talos/commit/3105a3f8))
- Add agent.skills.update skill template| — Franck ([864429a7](https///github.com/ooneex/talos/commit/864429a7))
- Add design.update skill template| — Franck ([01ef2b7b](https///github.com/ooneex/talos/commit/01ef2b7b))
- Add e2e:run command aliasing monorepo:run --commands=e2e| — Franck ([e7352a94](https///github.com/ooneex/talos/commit/e7352a94))
- Add e2e:create command with Playwright scaffolding| — Franck ([c454d9ee](https///github.com/ooneex/talos/commit/c454d9ee))
- Add per-assistant adapters for scaffolding agent config (Claude, Codex)| — Franck ([f032a069](https///github.com/ooneex/talos/commit/f032a069))
- Scan existing issues for cross-batch dependencies in issue-plan| — Franck ([30ae6de8](https///github.com/ooneex/talos/commit/30ae6de8))
- Record PR link back into the issue YAML after opening it| — Franck ([e674eee7](https///github.com/ooneex/talos/commit/e674eee7))
- Add auto commit, push, and PR creation to issue-fix workflow| — Franck ([7a0bc43e](https///github.com/ooneex/talos/commit/7a0bc43e))
- Add branch derivation workflow and change-type label taxonomy to issue skills| — Franck ([143812ac](https///github.com/ooneex/talos/commit/143812ac))
- Add agent and context fork settings to LLM skill templates| — Franck ([5c2a289c](https///github.com/ooneex/talos/commit/5c2a289c))
- Add model and effort frontmatter to LLM agent and skill templates| — Franck ([76a394b1](https///github.com/ooneex/talos/commit/76a394b1))
- Add deslop skill for removing AI-generated code slop| — Franck ([2158ccc8](https///github.com/ooneex/talos/commit/2158ccc8))
- Add AI-slop avoidance guidance to design agents and skills| — Franck ([6bb86faf](https///github.com/ooneex/talos/commit/6bb86faf))
- Split optimize-ui skill into UI craft and React pattern references|Splits the renamed optimize-ui skill's content into focused reference docs — Franck ([1e033c3a](https///github.com/ooneex/talos/commit/1e033c3a))
- Add UI craft rules to design skill and agent templates| — Franck ([3e941f6f](https///github.com/ooneex/talos/commit/3e941f6f))
- Enhance agent/skill templates with best-practice frontmatter| — Franck ([606c5af3](https///github.com/ooneex/talos/commit/606c5af3))
- Add humanize skill template for rewriting AI-sounding prose| — Franck ([e3139b64](https///github.com/ooneex/talos/commit/e3139b64))
- Persist selected language in a zustand store with a setter in useLang| — Franck ([206cb27f](https///github.com/ooneex/talos/commit/206cb27f))
- Add design module alias to the SPA vite config on scaffold| — Franck ([a8f50457](https///github.com/ooneex/talos/commit/a8f50457))
- Parse JSONC tsconfig files when adding and removing path aliases| — Franck ([49354a94](https///github.com/ooneex/talos/commit/49354a94))
- Rewrite @/ alias imports to @module scope when scaffolding design and SPA modules| — Franck ([90c4853b](https///github.com/ooneex/talos/commit/90c4853b))
- Structure issue descriptions into module, context, goal, DoD and dependencies| — Franck ([2cc0b292](https///github.com/ooneex/talos/commit/2cc0b292))
- Create missing Linear issues on the General team when pushing| — Franck ([46d0f41c](https///github.com/ooneex/talos/commit/46d0f41c))
- Remove microservice declaration from app.yml on module removal| — Franck ([5a173e05](https///github.com/ooneex/talos/commit/5a173e05))
- Create public folder for scaffolded SPA modules| — Franck ([70c990f2](https///github.com/ooneex/talos/commit/70c990f2))
- Populate queue redis url in microservice env config| — Franck ([07a9e276](https///github.com/ooneex/talos/commit/07a9e276))
- Copy vite config and mark SPA module as ES module| — Franck ([c62ec232](https///github.com/ooneex/talos/commit/c62ec232))
- Explain permission failures when pushing GitHub secrets and add secret command tests| — Franck ([8582ef35](https///github.com/ooneex/talos/commit/8582ef35))
- Add gitlab and bitbucket credentials and secret:push commands| — Franck ([ced5143d](https///github.com/ooneex/talos/commit/ced5143d))
- Add github:secret:push command| — Franck ([7436fdad](https///github.com/ooneex/talos/commit/7436fdad))
- Add bash and fish shell completion commands| — Franck ([f25115de](https///github.com/ooneex/talos/commit/f25115de))
- Add build, fmt, lint, and test script alias commands| — Franck ([c620c3ca](https///github.com/ooneex/talos/commit/c620c3ca))
- Add check command| — Franck ([b428df21](https///github.com/ooneex/talos/commit/b428df21))
- Add run command| — Franck ([599930c9](https///github.com/ooneex/talos/commit/599930c9))
- Add ensureBin guard to fail fast when required binaries are missing| — Franck ([05c7bb9b](https///github.com/ooneex/talos/commit/05c7bb9b))
- Suggest only Dockerfile targets for docker:publish completions| — Franck ([df0f679d](https///github.com/ooneex/talos/commit/df0f679d))
- Add docker:publish command to build and push images to Docker Hub| — Franck ([3d24f305](https///github.com/ooneex/talos/commit/3d24f305))
- Pass per-module seed cache directory to seed:run| — Franck ([4c839f6d](https///github.com/ooneex/talos/commit/4c839f6d))
- Pass per-module cache directory to migration scripts| — Franck ([59cf20d9](https///github.com/ooneex/talos/commit/59cf20d9))
- Cache module script runs to skip unchanged modules on migration:up| — Franck ([4661b054](https///github.com/ooneex/talos/commit/4661b054))
- Add shell completion for agent:skills:create flags| — Franck ([d7af0b4c](https///github.com/ooneex/talos/commit/d7af0b4c))
- Add agent:skills:create command replacing claude and codex init| — Franck ([31126e5b](https///github.com/ooneex/talos/commit/31126e5b))
- Add multiselect assistant skills prompt to app:init| — Franck ([d4dcef9b](https///github.com/ooneex/talos/commit/d4dcef9b))
- Prompt before installing commit-msg hook in app:init| — Franck ([af0bd816](https///github.com/ooneex/talos/commit/af0bd816))
- Add fmt step to monorepo:check pipeline| — Franck ([1948de03](https///github.com/ooneex/talos/commit/1948de03))
- Add commitlint:init and commitlint:check commands| — Franck ([f12b4b88](https///github.com/ooneex/talos/commit/f12b4b88))
- Wire monorepo:check into completions, docs, and app template| — Franck ([f4832f25](https///github.com/ooneex/talos/commit/f4832f25))
- Add monorepo:check command| — Franck ([ad3591b1](https///github.com/ooneex/talos/commit/ad3591b1))
- Show trimmed failure excerpt instead of streaming monorepo:run output| — Franck ([676bfd24](https///github.com/ooneex/talos/commit/676bfd24))
- Support install command and dynamic script completion in monorepo:run| — Franck ([b8a94130](https///github.com/ooneex/talos/commit/b8a94130))
- Fingerprint monorepo targets via git to skip ignored files| — Franck ([17ab85ea](https///github.com/ooneex/talos/commit/17ab85ea))
- Add monorepo:run command with task engine and caching| — Franck ([5565d43d](https///github.com/ooneex/talos/commit/5565d43d))
- Add jira:credentials:create command| — Franck ([53fcf273](https///github.com/ooneex/talos/commit/53fcf273))
- Support pulling issues from Jira in issue:pull| — Franck ([a29e8315](https///github.com/ooneex/talos/commit/a29e8315))
- Include module field in generated issue YAML| — Franck ([2131b74f](https///github.com/ooneex/talos/commit/2131b74f))
- Add linear:credentials:create command| — Franck ([ad5d90d8](https///github.com/ooneex/talos/commit/ad5d90d8))
- Scaffold var directory placeholder for new apps| — Franck ([13c250e1](https///github.com/ooneex/talos/commit/13c250e1))
- Add version and upgrade commands| — Franck ([56f7dca5](https///github.com/ooneex/talos/commit/56f7dca5))
- Add --publish flag to release:create for npm publishing| — Franck ([f292e029](https///github.com/ooneex/talos/commit/f292e029))
- Rename publish and release flags to plural with multi-value support| — Franck ([312238ca](https///github.com/ooneex/talos/commit/312238ca))
- Require a clean working tree before releasing| — Franck ([de8e3543](https///github.com/ooneex/talos/commit/de8e3543))
- Log skipped already-published versions| — Franck ([c55c72a8](https///github.com/ooneex/talos/commit/c55c72a8))
- Support package filter in release create command| — Franck ([5285aede](https///github.com/ooneex/talos/commit/5285aede))
- Skip already-published versions and report a publish summary| — Franck ([4b5d6372](https///github.com/ooneex/talos/commit/4b5d6372))
- Complete comma-separated package and module names for npm publish| — Franck ([ee966464](https///github.com/ooneex/talos/commit/ee966464))
- Publish multiple or all packages and modules to npm| — Franck ([9a381227](https///github.com/ooneex/talos/commit/9a381227))
- Add npm publish command| — Franck ([9f24761c](https///github.com/ooneex/talos/commit/9f24761c))
- Add GitHub credentials create command| — Franck ([99446335](https///github.com/ooneex/talos/commit/99446335))
- Add shell completions for credentials commands| — Franck ([9a297821](https///github.com/ooneex/talos/commit/9a297821))
- Add Docker and npm credentials create commands| — Franck ([6ca5eea2](https///github.com/ooneex/talos/commit/6ca5eea2))
- Generate CI/CD pipeline for new microservices| — Franck ([c5935c43](https///github.com/ooneex/talos/commit/c5935c43))
- Add cli package| — Franck ([4f70f57c](https///github.com/ooneex/talos/commit/4f70f57c))

### Changed

- Route release checks through check and fix https push auth| — Franck ([89ec23ed](https///github.com/ooneex/talos/commit/89ec23ed))
- Format code and label lint report rows by script name| — Franck ([4bfb28d1](https///github.com/ooneex/talos/commit/4bfb28d1))
- Rename coverage_check module to coverage| — Franck ([3dc377a4](https///github.com/ooneex/talos/commit/3dc377a4))
- Update dependency versions| — Franck ([6e763d93](https///github.com/ooneex/talos/commit/6e763d93))
- Cover loader-based build, scheduler and biome batch reports| — Franck ([224746c8](https///github.com/ooneex/talos/commit/224746c8))
- Replace footer with a multi-group loader and unify reports| — Franck ([387fed0c](https///github.com/ooneex/talos/commit/387fed0c))
- Merge workspace check report and add plain footer mode| — Franck ([d0047caa](https///github.com/ooneex/talos/commit/d0047caa))
- Run cargo test in project:check and skip Rust coverage| — Franck ([9a6dca0b](https///github.com/ooneex/talos/commit/9a6dca0b))
- Dedupe module helpers and use hashmap target lookups| — Franck ([045752cd](https///github.com/ooneex/talos/commit/045752cd))
- Enhance build with parallel workspace loading and improve install progress tracking| — Franck ([517a8969](https///github.com/ooneex/talos/commit/517a8969))
- Enhance build, lint, and add install command with caching| — Franck ([9613fc87](https///github.com/ooneex/talos/commit/9613fc87))
- Rename monorepo modules to workspace terminology| — Franck ([080a6c9f](https///github.com/ooneex/talos/commit/080a6c9f))
- Consolidate project checks and remove language-specific implementations|- Remove Python and Rust dependency checks — Franck ([4babd5b1](https///github.com/ooneex/talos/commit/4babd5b1))
- Extract shell command helper and fix parallel test execution|- Extract sh() helper function to reduce duplication in concurrent command tests — Franck ([f4978ff7](https///github.com/ooneex/talos/commit/f4978ff7))
- Rename package to talos-cli and add metadata| — Franck ([167f875a](https///github.com/ooneex/talos/commit/167f875a))
- Add coverage tests for create commands and coverage helpers|Add targeted unit tests for admin_create, cache_create, command_run, — Franck ([bf1fbc91](https///github.com/ooneex/talos/commit/bf1fbc91))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https///github.com/ooneex/talos/commit/4d33ff04))
- Remove bitbucket:credentials:create and bitbucket:secret:push commands| — Franck ([e5f38b9d](https///github.com/ooneex/talos/commit/e5f38b9d))
- Reach 90% line and function coverage|Add and expand Rust tests across module_remove, npm_publish, — Franck ([3d1aa2f3](https///github.com/ooneex/talos/commit/3d1aa2f3))
- Stub HTTP calls to test Linear, npm, Bitbucket and OSV commands| — Franck ([f590a5f1](https///github.com/ooneex/talos/commit/f590a5f1))
- Add specs for module scaffolding, dispatch and security checks| — Franck ([257a2c5d](https///github.com/ooneex/talos/commit/257a2c5d))
- Expand unit test coverage across commands and utils| — Franck ([0aefd8bf](https///github.com/ooneex/talos/commit/0aefd8bf))
- Update shell completions and storybook template| — Julien ([dddccba2](https///github.com/ooneex/talos/commit/dddccba2))
- Add swagger module type classification to project_check| — Julien ([4b09d4d9](https///github.com/ooneex/talos/commit/4b09d4d9))
- Remove github and gitlab credential and secret commands| — Franck ([a72883be](https///github.com/ooneex/talos/commit/a72883be))
- Add coverage for the loader and monorepo footer bars| — Franck ([1b8f1c9f](https///github.com/ooneex/talos/commit/1b8f1c9f))
- Relax bundle, git and tests checks to their core signal| — Franck ([994515f2](https///github.com/ooneex/talos/commit/994515f2))
- Restructure progress loader to support category-grouped display|Refactor Progress and Loader to track and display checks grouped by category — Franck ([4eaac10d](https///github.com/ooneex/talos/commit/4eaac10d))
- Extract Loader from project-check progress into shared utils| — Franck ([e816cef1](https///github.com/ooneex/talos/commit/e816cef1))
- Query OSV.dev instead of shelling out to per-ecosystem audit tools|Parse lockfiles directly (bun.lock, package-lock.json, Cargo.lock, — Franck ([1ffe0e13](https///github.com/ooneex/talos/commit/1ffe0e13))
- Extract app:start's process runner into a concurrently util|Generalize the ad-hoc log-streaming/kill-on-failure logic added for — Franck ([9b117712](https///github.com/ooneex/talos/commit/9b117712))
- Batch same-tool monorepo tasks into one biome invocation|Add a Phase 1 batching pass to run_group: cache-miss targets whose fmt/lint — Franck ([6e4eb1fb](https///github.com/ooneex/talos/commit/6e4eb1fb))
- Store monorepo cache entries as flat <id>.json files|Replace the per-entry cache directory (a folder holding meta.json plus a — Franck ([c92106bd](https///github.com/ooneex/talos/commit/c92106bd))
- Drop build-output caching from monorepo:run|Copying package outputs (dist/) into the cache and restoring them on a — Franck ([d5b280f8](https///github.com/ooneex/talos/commit/d5b280f8))
- Switch monorepo file hashing from sha2 to blake3|blake3 with mmap support hashes files without a read() copy and is — Franck ([08b0626a](https///github.com/ooneex/talos/commit/08b0626a))
- Unify fmt/lint/test scheduling into build_group|fmt, lint, and test all end up running the same 'bun run <command>' — Franck ([e35610f2](https///github.com/ooneex/talos/commit/e35610f2))
- Align release tag format with package version scheme|Reset the crate/package version to 0.0.1 and switch the release workflow's — Franck ([3a2db362](https///github.com/ooneex/talos/commit/3a2db362))
- Rename the talosrs binary to talos|Update the Cargo bin name, clap command name/about, release workflow — Franck ([f71897ec](https///github.com/ooneex/talos/commit/f71897ec))
- Rename the rust_cli crate to cli|Update the Cargo package/lib name, package.json name, and every — Franck ([3d99292d](https///github.com/ooneex/talos/commit/3d99292d))
- Rename packages/rust-cli to packages/cli|Now that the legacy TypeScript CLI is gone, the Rust port takes over the — Franck ([7fdf8486](https///github.com/ooneex/talos/commit/7fdf8486))
- Remove the legacy TypeScript CLI package|The Rust port under packages/rust-cli is now feature-complete and no — Franck ([1c473b6e](https///github.com/ooneex/talos/commit/1c473b6e))
- Add missing LOG_OPTIONS to mocked utils in CommandCreateCommand spec| — Franck ([68e8e26c](https///github.com/ooneex/talos/commit/68e8e26c))
- @talosjs/cli@1.32.1| — Franck ([c033b0b3](https///github.com/ooneex/talos/commit/c033b0b3))
- @talosjs/cli@1.32.0| — Franck ([5fecd95d](https///github.com/ooneex/talos/commit/5fecd95d))
- Remove stale agent skills and assistants test specs| — Franck ([07d976a6](https///github.com/ooneex/talos/commit/07d976a6))
- Fix mocked utils and spa clone fixtures| — Franck ([669d92e6](https///github.com/ooneex/talos/commit/669d92e6))
- Remove unused generic database template| — Franck ([5274ccc4](https///github.com/ooneex/talos/commit/5274ccc4))
- Fix mocked microservice clone to include .env.example.yml| — Franck ([d93c9ad5](https///github.com/ooneex/talos/commit/d93c9ad5))
- Pull microservice bootstrap files from skeleton repo| — Franck ([81774d33](https///github.com/ooneex/talos/commit/81774d33))
- Add specs for AppCreateCommand and AppInitCommand| — Franck ([4bb7a736](https///github.com/ooneex/talos/commit/4bb7a736))
- Delegate app create scaffolding to AppInitCommand skeleton copy| — Franck ([758e252b](https///github.com/ooneex/talos/commit/758e252b))
- Scaffold app init by copying full skeleton repo tree| — Franck ([feb031c3](https///github.com/ooneex/talos/commit/feb031c3))
- @talosjs/cli@1.31.1| — Franck ([b14b492e](https///github.com/ooneex/talos/commit/b14b492e))
- @talosjs/cli@1.31.0| — Franck ([cb85e77f](https///github.com/ooneex/talos/commit/cb85e77f))
- Simplify and clarify storybook story creation skill template| — Franck ([7973c97c](https///github.com/ooneex/talos/commit/7973c97c))
- Update commit skill template| — Franck ([e664466f](https///github.com/ooneex/talos/commit/e664466f))
- @talosjs/cli@1.30.1| — Franck ([51c534ab](https///github.com/ooneex/talos/commit/51c534ab))
- @talosjs/cli@1.30.0| — Franck ([ecb8a423](https///github.com/ooneex/talos/commit/ecb8a423))
- Add include and exclude to module tsconfig template| — Franck ([ee0941cd](https///github.com/ooneex/talos/commit/ee0941cd))
- @talosjs/cli@1.29.0| — Franck ([791b1b1a](https///github.com/ooneex/talos/commit/791b1b1a))
- Simplify and trim sdk-create skill template for better token efficiency| — Franck ([e5a303f6](https///github.com/ooneex/talos/commit/e5a303f6))
- Update LLM agent and skill templates| — Franck ([9f4d46d1](https///github.com/ooneex/talos/commit/9f4d46d1))
- Update agent and skill templates| — Franck ([ffbf9b68](https///github.com/ooneex/talos/commit/ffbf9b68))
- Update react.component.create skill template| — Franck ([0e36f51b](https///github.com/ooneex/talos/commit/0e36f51b))
- Update agent.skills.update skill template| — Franck ([62ce94c4](https///github.com/ooneex/talos/commit/62ce94c4))
- Update agent and skill templates| — Franck ([dec25c03](https///github.com/ooneex/talos/commit/dec25c03))
- Update issue.plan skill template| — Franck ([dbbbda06](https///github.com/ooneex/talos/commit/dbbbda06))
- Update review skill template| — Franck ([afe28a5d](https///github.com/ooneex/talos/commit/afe28a5d))
- Update LLM agent and skill templates| — Franck ([47ecbce9](https///github.com/ooneex/talos/commit/47ecbce9))
- Update issue.fix skill template| — Franck ([5bc8cba1](https///github.com/ooneex/talos/commit/5bc8cba1))
- Split when_to_use guidance out of description in LLM templates| — Franck ([c82bfeed](https///github.com/ooneex/talos/commit/c82bfeed))
- Adjust model and effort settings for LLM agent and skill templates| — Franck ([7bc9b913](https///github.com/ooneex/talos/commit/7bc9b913))
- Clarify push step and restrict commit skill tool access| — Franck ([4eba0d14](https///github.com/ooneex/talos/commit/4eba0d14))
- Clarify remote operations step in commit skill template| — Franck ([7838577a](https///github.com/ooneex/talos/commit/7838577a))
- Simplify commit skill push instructions| — Franck ([3184256d](https///github.com/ooneex/talos/commit/3184256d))
- Add metadata frontmatter to commit skill| — Franck ([adbffac1](https///github.com/ooneex/talos/commit/adbffac1))
- Simplify commit skill push instructions in templates| — Franck ([2594d940](https///github.com/ooneex/talos/commit/2594d940))
- Default design name instead of prompting when not provided| — Franck ([fb687d18](https///github.com/ooneex/talos/commit/fb687d18))
- @talosjs/cli@1.28.0| — Franck ([6b2634d1](https///github.com/ooneex/talos/commit/6b2634d1))
- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https///github.com/ooneex/talos/commit/b490c580))
- Remove typescript native-preview from init dependency list| — Franck ([16070771](https///github.com/ooneex/talos/commit/16070771))
- Rename optimize-react skill to optimize-ui and split references| — Franck ([fea7e47c](https///github.com/ooneex/talos/commit/fea7e47c))
- Note module/package dual location across LLM templates| — Franck ([2d62106a](https///github.com/ooneex/talos/commit/2d62106a))
- Add gh CLI push strategy with SSH fallback to commit skill| — Franck ([174c43f4](https///github.com/ooneex/talos/commit/174c43f4))
- Rename colon-separated skill names to hyphenated| — Franck ([0abf1f99](https///github.com/ooneex/talos/commit/0abf1f99))
- @talosjs/cli@1.27.0| — Franck ([09657163](https///github.com/ooneex/talos/commit/09657163))
- @talosjs/cli@1.26.2| — Franck ([5f3a4cf8](https///github.com/ooneex/talos/commit/5f3a4cf8))
- Run fmt and lint tasks concurrently without dependency ordering| — Franck ([34df8302](https///github.com/ooneex/talos/commit/34df8302))
- @talosjs/cli@1.26.1| — Franck ([35d72a74](https///github.com/ooneex/talos/commit/35d72a74))
- Restore push step in the commit skill template| — Franck ([ffded0c5](https///github.com/ooneex/talos/commit/ffded0c5))
- @talosjs/cli@1.26.0| — Franck ([e4ed0574](https///github.com/ooneex/talos/commit/e4ed0574))
- Update missing-dictionary guidance in translation:translate skill template| — Franck ([f323d15f](https///github.com/ooneex/talos/commit/f323d15f))
- Add spacing and layout gap guidance to the optimize:react skill template| — Franck ([7dcade39](https///github.com/ooneex/talos/commit/7dcade39))
- Fix path alias key assertion in DesignRemoveCommand spec| — Franck ([8193eeef](https///github.com/ooneex/talos/commit/8193eeef))
- @talosjs/cli@1.25.1| — Franck ([c5652f90](https///github.com/ooneex/talos/commit/c5652f90))
- Drop Astro and Svelte and ignore unknown CSS at-rules in Zed settings template| — Franck ([5c838176](https///github.com/ooneex/talos/commit/5c838176))
- @talosjs/cli@1.25.0| — Franck ([d8263c82](https///github.com/ooneex/talos/commit/d8263c82))
- Ignore .env in the app gitignore template| — Franck ([b5cb3fc5](https///github.com/ooneex/talos/commit/b5cb3fc5))
- @talosjs/cli@1.24.1| — Franck ([ea50f99a](https///github.com/ooneex/talos/commit/ea50f99a))
- Ignore routeTree.gen.ts and use rule preset in biome template| — Franck ([6290e2d9](https///github.com/ooneex/talos/commit/6290e2d9))
- @talosjs/cli@1.24.0| — Franck ([c3f9a07d](https///github.com/ooneex/talos/commit/c3f9a07d))
- @talosjs/cli@1.23.1| — Franck ([1d23f7c3](https///github.com/ooneex/talos/commit/1d23f7c3))
- Add design system guidance to the optimize:react skill template| — Franck ([a315d5b1](https///github.com/ooneex/talos/commit/a315d5b1))
- @talosjs/cli@1.23.0| — Franck ([9760e58c](https///github.com/ooneex/talos/commit/9760e58c))
- Parallelize module discovery and file hashing in monorepo tasks| — Franck ([7dcab7c5](https///github.com/ooneex/talos/commit/7dcab7c5))
- @talosjs/cli@1.22.1| — Franck ([779fd579](https///github.com/ooneex/talos/commit/779fd579))
- Document the translations layer in SPA and design skill templates| — Franck ([a642831d](https///github.com/ooneex/talos/commit/a642831d))
- Stop pre-creating shared sub-folders in SPA scaffold| — Franck ([f534dc17](https///github.com/ooneex/talos/commit/f534dc17))
- @talosjs/cli@1.22.0| — Franck ([26ab8b17](https///github.com/ooneex/talos/commit/26ab8b17))
- Drop Jira provider and make issue pull Linear-only| — Franck ([d13d921b](https///github.com/ooneex/talos/commit/d13d921b))
- Restrict issue push to updating existing Linear issues| — Franck ([bef11f8c](https///github.com/ooneex/talos/commit/bef11f8c))
- Always prompt for target team and drop teamId credential| — Franck ([1ccbd4e6](https///github.com/ooneex/talos/commit/1ccbd4e6))
- Read Linear and Jira credentials from credential files instead of env vars| — Franck ([d1a3e2d5](https///github.com/ooneex/talos/commit/d1a3e2d5))
- @talosjs/cli@1.21.2| — Franck ([9bf3cf6b](https///github.com/ooneex/talos/commit/9bf3cf6b))
- Drop logger injection from OnAppStart template| — Franck ([890cc0fe](https///github.com/ooneex/talos/commit/890cc0fe))
- @talosjs/cli@1.21.1| — Franck ([cedfd4d2](https///github.com/ooneex/talos/commit/cedfd4d2))
- Remove server url logging from OnAppStart template| — Franck ([e9710092](https///github.com/ooneex/talos/commit/e9710092))
- @talosjs/cli@1.21.0| — Franck ([939c6ad0](https///github.com/ooneex/talos/commit/939c6ad0))
- @talosjs/cli@1.20.0| — Franck ([fa358a1c](https///github.com/ooneex/talos/commit/fa358a1c))
- Update default port ranges for scaffolded modules| — Franck ([97c24b8d](https///github.com/ooneex/talos/commit/97c24b8d))
- @talosjs/cli@1.19.0| — Franck ([ab354ee2](https///github.com/ooneex/talos/commit/ab354ee2))
- @talosjs/cli@1.18.0| — Franck ([b8013ea7](https///github.com/ooneex/talos/commit/b8013ea7))
- @talosjs/cli@1.17.1| — Franck ([ba6b7e23](https///github.com/ooneex/talos/commit/ba6b7e23))
- @talosjs/cli@1.17.0| — Franck ([f8d3b901](https///github.com/ooneex/talos/commit/f8d3b901))
- Stop generating redundant modules/app/var/.gitkeep| — Franck ([9f54708a](https///github.com/ooneex/talos/commit/9f54708a))
- @talosjs/cli@1.16.0| — Franck ([395bc59c](https///github.com/ooneex/talos/commit/395bc59c))
- Simplify GitLab and Bitbucket pipeline templates| — Franck ([cdaaa538](https///github.com/ooneex/talos/commit/cdaaa538))
- Simplify GitHub production deployment workflow templates| — Franck ([250f65f1](https///github.com/ooneex/talos/commit/250f65f1))
- Update GitHub workflow templates| — Franck ([296f8e0f](https///github.com/ooneex/talos/commit/296f8e0f))
- Consolidate CI templates to install talos globally and run monorepo:check| — Franck ([d34dacf0](https///github.com/ooneex/talos/commit/d34dacf0))
- @talosjs/cli@1.15.0| — Franck ([dd19119d](https///github.com/ooneex/talos/commit/dd19119d))
- @talosjs/cli@1.14.0| — Franck ([cfac68f1](https///github.com/ooneex/talos/commit/cfac68f1))
- @talosjs/cli@1.13.0| — Franck ([7bbb662c](https///github.com/ooneex/talos/commit/7bbb662c))
- Update LLM agent and skill templates| — Franck ([9222050d](https///github.com/ooneex/talos/commit/9222050d))
- @talosjs/cli@1.12.0| — Franck ([72408742](https///github.com/ooneex/talos/commit/72408742))
- Strip malformed ANSI escapes up to terminating m byte| — Franck ([db6ddfcc](https///github.com/ooneex/talos/commit/db6ddfcc))
- Import MIGRATIONS_CACHE_DIR from @talosjs/migrations| — Franck ([ceb6c4ff](https///github.com/ooneex/talos/commit/ceb6c4ff))
- Import SEEDS_CACHE_DIR from @talosjs/seeds| — Franck ([e975d5fc](https///github.com/ooneex/talos/commit/e975d5fc))
- Cover per-module cache directory for seed:run| — Franck ([340f24dc](https///github.com/ooneex/talos/commit/340f24dc))
- Cover per-module cache directory for migration scripts| — Franck ([110c460a](https///github.com/ooneex/talos/commit/110c460a))
- Update migration runner tests for relocated cache| — Franck ([e1a4a5b3](https///github.com/ooneex/talos/commit/e1a4a5b3))
- Move migration caching into the migrations package| — Franck ([bd11c1ac](https///github.com/ooneex/talos/commit/bd11c1ac))
- Document utils folder in module scaffold skill template| — Franck ([6e03717e](https///github.com/ooneex/talos/commit/6e03717e))
- Cover module script cache in migration:up and runModuleScripts| — Franck ([febf8710](https///github.com/ooneex/talos/commit/febf8710))
- Use monorepo:check in LLM scaffold templates| — Franck ([7770ebac](https///github.com/ooneex/talos/commit/7770ebac))
- Read tsconfig via Bun.file().json() in moduleRegistry| — Franck ([b1e529c7](https///github.com/ooneex/talos/commit/b1e529c7))
- @talosjs/cli@1.11.2| — Franck ([7e7105ac](https///github.com/ooneex/talos/commit/7e7105ac))
- Run monorepo task groups in parallel bounded by CPU count| — Franck ([21cbc117](https///github.com/ooneex/talos/commit/21cbc117))
- Filter passing-test noise from failure excerpts| — Franck ([439816c0](https///github.com/ooneex/talos/commit/439816c0))
- Log successful tasks in monorepo:run output| — Franck ([31bf5dd2](https///github.com/ooneex/talos/commit/31bf5dd2))
- @talosjs/cli@1.11.1| — Franck ([436c06e4](https///github.com/ooneex/talos/commit/436c06e4))
- Log only failed tasks in monorepo:run output| — Franck ([10819ee5](https///github.com/ooneex/talos/commit/10819ee5))
- @talosjs/cli@1.11.0| — Franck ([3ab1a3d5](https///github.com/ooneex/talos/commit/3ab1a3d5))
- Run monorepo task groups sequentially| — Franck ([86f9c379](https///github.com/ooneex/talos/commit/86f9c379))
- Rename askAgentSkills config field to name| — Franck ([5961e06b](https///github.com/ooneex/talos/commit/5961e06b))
- Document fmt step in monorepo:check skill template| — Franck ([3307be77](https///github.com/ooneex/talos/commit/3307be77))
- Use monorepo:check in talos.commands skill template| — Franck ([a0e0936c](https///github.com/ooneex/talos/commit/a0e0936c))
- Drop claude/codex init tests and update for agent:skills:create| — Franck ([facb57b8](https///github.com/ooneex/talos/commit/facb57b8))
- Update templates for agent:skills:create command| — Franck ([054e9c93](https///github.com/ooneex/talos/commit/054e9c93))
- Remove ClaudeInitCommand and CodexInitCommand| — Franck ([86cfc329](https///github.com/ooneex/talos/commit/86cfc329))
- Cover agent:skills:create command| — Franck ([0f010877](https///github.com/ooneex/talos/commit/0f010877))
- Cover multiselect assistant skills prompt in app:init| — Franck ([c70c778e](https///github.com/ooneex/talos/commit/c70c778e))
- @talosjs/cli@1.10.0| — Franck ([3b89817b](https///github.com/ooneex/talos/commit/3b89817b))
- Parallelize workspace probes in monorepo:run| — Franck ([0bfbe62c](https///github.com/ooneex/talos/commit/0bfbe62c))
- @talosjs/cli@1.9.1| — Franck ([43c9a914](https///github.com/ooneex/talos/commit/43c9a914))
- Apply biome formatting across packages| — Franck ([5da156c4](https///github.com/ooneex/talos/commit/5da156c4))
- Analyze release targets concurrently and use Bun.spawn over shell| — Franck ([0c900b57](https///github.com/ooneex/talos/commit/0c900b57))
- @talosjs/cli@1.9.0| — Franck ([163d4e41](https///github.com/ooneex/talos/commit/163d4e41))
- Update monorepo:check tests for fmt step| — Franck ([1861a7c7](https///github.com/ooneex/talos/commit/1861a7c7))
- Use talos monorepo:check in LLM scaffold templates| — Franck ([f3753943](https///github.com/ooneex/talos/commit/f3753943))
- Revise package READMEs| — Franck ([1b72f01f](https///github.com/ooneex/talos/commit/1b72f01f))
- Update app scaffold tests for removed root scripts block| — Franck ([f15d5279](https///github.com/ooneex/talos/commit/f15d5279))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https///github.com/ooneex/talos/commit/04ad0400))
- Update scaffold templates for bun commands and workflow| — Franck ([c50fcf1d](https///github.com/ooneex/talos/commit/c50fcf1d))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https///github.com/ooneex/talos/commit/11513a2f))
- Update scaffold templates for fmt script and drop app scripts block| — Franck ([1a8fd30e](https///github.com/ooneex/talos/commit/1a8fd30e))
- Shell out to talos CLI in commit-msg hook instead of baked path| — Franck ([d68775ba](https///github.com/ooneex/talos/commit/d68775ba))
- Remove Husky ENV from app Dockerfile template| — Franck ([358906f6](https///github.com/ooneex/talos/commit/358906f6))
- Update docs for native commitlint workflow| — Franck ([abfdb668](https///github.com/ooneex/talos/commit/abfdb668))
- Drop commitlint scope-enum editing and scaffolding for native commitlint| — Franck ([f70faae0](https///github.com/ooneex/talos/commit/f70faae0))
- Remove per-package npm:publish scripts| — Franck ([90149112](https///github.com/ooneex/talos/commit/90149112))
- Update check script assertions for monorepo:check| — Franck ([57deff70](https///github.com/ooneex/talos/commit/57deff70))
- Remove Nx from generated apps and task engine| — Franck ([f6d22d09](https///github.com/ooneex/talos/commit/f6d22d09))
- @talosjs/cli@1.8.0| — Franck ([c9e1df49](https///github.com/ooneex/talos/commit/c9e1df49))
- Extract monorepo:run presentation into monorepoRunLogger| — Franck ([93cd0442](https///github.com/ooneex/talos/commit/93cd0442))
- @talosjs/cli@1.7.0| — Franck ([eb370e4e](https///github.com/ooneex/talos/commit/eb370e4e))
- Remove app:build command| — Franck ([22bac334](https///github.com/ooneex/talos/commit/22bac334))
- Remove interactive mode from issue:create| — Franck ([fb2a4c31](https///github.com/ooneex/talos/commit/fb2a4c31))
- Assert non-null fetch call in IssuePullCommand spec| — Franck ([a8069460](https///github.com/ooneex/talos/commit/a8069460))
- Document module field in issue skill templates| — Franck ([91b6384b](https///github.com/ooneex/talos/commit/91b6384b))
- Remove bunfig.toml from app scaffolding| — Franck ([b3a2856b](https///github.com/ooneex/talos/commit/b3a2856b))
- Move app env config to project root .env.yml| — Franck ([8d7b7feb](https///github.com/ooneex/talos/commit/8d7b7feb))
- Print plain version to stdout| — Franck ([0a93b92a](https///github.com/ooneex/talos/commit/0a93b92a))
- @talosjs/cli@1.6.1| — Franck ([80bf3d72](https///github.com/ooneex/talos/commit/80bf3d72))
- @talosjs/cli@1.6.0| — Franck ([304b32e5](https///github.com/ooneex/talos/commit/304b32e5))
- Route command spawning through spawnStep with spinner and captured output| — Franck ([9e017b8f](https///github.com/ooneex/talos/commit/9e017b8f))
- @talosjs/cli@1.5.0| — Franck ([f9a7bdda](https///github.com/ooneex/talos/commit/f9a7bdda))
- @talosjs/cli@1.4.0| — Franck ([d298134e](https///github.com/ooneex/talos/commit/d298134e))
- Cover skip logging and clean-tree release guard| — Franck ([cb569ba4](https///github.com/ooneex/talos/commit/cb569ba4))
- Cover pack-and-publish tarball flow| — Franck ([df2f4d78](https///github.com/ooneex/talos/commit/df2f4d78))
- @talosjs/cli@1.3.0| — Franck ([5fab0de1](https///github.com/ooneex/talos/commit/5fab0de1))
- Cover npm publish tooling and release package filter| — Franck ([b983caa7](https///github.com/ooneex/talos/commit/b983caa7))
- @talosjs/cli@1.2.0| — Franck ([4488f978](https///github.com/ooneex/talos/commit/4488f978))
- Cover version-skipping and publish summary| — Franck ([ca2001d5](https///github.com/ooneex/talos/commit/ca2001d5))
- @talosjs/cli@1.1.0| — Franck ([c441bd64](https///github.com/ooneex/talos/commit/c441bd64))
- Write generated files concurrently| — Franck ([dc7949e8](https///github.com/ooneex/talos/commit/dc7949e8))
- Extract spawnStep and loadAppModuleName helpers| — Franck ([58f4edd7](https///github.com/ooneex/talos/commit/58f4edd7))
- Extract scaffoldAgentConfig helper| — Franck ([4106c597](https///github.com/ooneex/talos/commit/4106c597))
- Extract saveCredentials helper| — Franck ([93d6c356](https///github.com/ooneex/talos/commit/93d6c356))
- Register NpmPublishCommand in index export test| — Franck ([25bf6e41](https///github.com/ooneex/talos/commit/25bf6e41))
- Update npm publish and completion tests| — Franck ([495bc9bc](https///github.com/ooneex/talos/commit/495bc9bc))
- Simplify npm publish logging and spinner handling| — Franck ([130e4634](https///github.com/ooneex/talos/commit/130e4634))
- Cover multi-target npm publish| — Franck ([29875318](https///github.com/ooneex/talos/commit/29875318))
- Add tests for npm publish command| — Franck ([cf898920](https///github.com/ooneex/talos/commit/cf898920))
- Add tests for GitHub credentials command| — Franck ([30e1c16a](https///github.com/ooneex/talos/commit/30e1c16a))
- Document GitHub credentials command| — Franck ([98d0c6b8](https///github.com/ooneex/talos/commit/98d0c6b8))
- Cover credentials commands in zsh completion test| — Franck ([960e69b5](https///github.com/ooneex/talos/commit/960e69b5))
- Document Docker and npm credentials commands| — Franck ([3159856f](https///github.com/ooneex/talos/commit/3159856f))
- Add tests for Docker and npm credentials commands| — Franck ([d3fe248c](https///github.com/ooneex/talos/commit/d3fe248c))
- Add Nx cache to CI pipeline templates| — Franck ([6e21ebc5](https///github.com/ooneex/talos/commit/6e21ebc5))
- Remove redundant CommandRun and SdkCreate command tests| — Franck ([503c5d1e](https///github.com/ooneex/talos/commit/503c5d1e))
- Update validation package description in packages skill template| — Franck ([3705639f](https///github.com/ooneex/talos/commit/3705639f))
- Update entity template to use random.id with 20-char primary key| — Franck ([8331049b](https///github.com/ooneex/talos/commit/8331049b))
- Update template references to @talosjs| — Franck ([4efa4778](https///github.com/ooneex/talos/commit/4efa4778))

### Removed

- Restore commit-msg hook prompt regardless of silent mode| — Franck ([8d40a4f8](https///github.com/ooneex/talos/commit/8d40a4f8))

### Fixed

- Fix app:init module scope and template path fixtures| — Franck ([263973b1](https///github.com/ooneex/talos/commit/263973b1))
- Fix templates path and set scaffolded package.json name| — Franck ([2a88a8cb](https///github.com/ooneex/talos/commit/2a88a8cb))
- Error when build finds no packages or modules to run| — Franck ([77e26ca1](https///github.com/ooneex/talos/commit/77e26ca1))
- Ensure lcov directory is created before writing report|- Add explicit directory creation in prepare_lcov() before cargo llvm-cov writes its report — Franck ([4b2412f0](https///github.com/ooneex/talos/commit/4b2412f0))
- Split oversized files and fix todos, hygiene and translations checks|Splits several oversized command modules into smaller files to satisfy — Franck ([4be07a17](https///github.com/ooneex/talos/commit/4be07a17))
- Walk a block from its byte offset so a multi-byte character cannot shift it| — Julien ([a53123d2](https///github.com/ooneex/talos/commit/a53123d2))
- Stop flagging bun.lock as stale from manifest mtime alone| — Franck ([2e6940d2](https///github.com/ooneex/talos/commit/2e6940d2))
- Invalidate cache on rebuild and drop false-positive role warning| — Franck ([d12ca6a8](https///github.com/ooneex/talos/commit/d12ca6a8))
- Derive security:check module names from the folder, not the path|Report and filter (--modules/--packages) by the module's directory name — Franck ([5c765d6c](https///github.com/ooneex/talos/commit/5c765d6c))
- Make install/uninstall PATH and profile edits idempotent|Compare exact PATH segments (case-insensitive, trailing-slash normalized) — Franck ([9c994e7f](https///github.com/ooneex/talos/commit/9c994e7f))
- Read and write .env.yml under modules/app, not the project root|App configuration now lives alongside the app module like every other — Franck ([deee52cf](https///github.com/ooneex/talos/commit/deee52cf))
- Strip inline YAML comments when reading a module's type|read_module_type took the whole 'type: ...' line verbatim, so a module.yml — Franck ([bcdc59ba](https///github.com/ooneex/talos/commit/bcdc59ba))
- Upgrade via the GitHub release installer instead of npm|The binary is no longer published to npm, so 'bun add -g @talosjs/cli' — Franck ([06fed16f](https///github.com/ooneex/talos/commit/06fed16f))
- Avoid tmp directory clashes on concurrent scaffold invocations| — Franck ([4df0b058](https///github.com/ooneex/talos/commit/4df0b058))
- Resolve enquirer's prompt export reliably under Bun| — Franck ([f8c7618c](https///github.com/ooneex/talos/commit/f8c7618c))
- Always show spawnStep spinner even in silent mode| — Franck ([2713decc](https///github.com/ooneex/talos/commit/2713decc))
- Skip commit-msg hook prompt in silent app init| — Franck ([96f24ea8](https///github.com/ooneex/talos/commit/96f24ea8))
- Register path alias and preserve yml fields for design and spa modules| — Franck ([31b59654](https///github.com/ooneex/talos/commit/31b59654))
- Copy full design and spa templates instead of scaffolding a module| — Franck ([cdf588f9](https///github.com/ooneex/talos/commit/cdf588f9))
- Point design and spa scaffolding at unified skeleton repo| — Franck ([003422ec](https///github.com/ooneex/talos/commit/003422ec))
- Clean up temp skeleton clone after app init| — Franck ([6b11c1e0](https///github.com/ooneex/talos/commit/6b11c1e0))
- Generate package.json from skeleton repo content| — Franck ([60514445](https///github.com/ooneex/talos/commit/60514445))
- Add missing talosStorybook skill template export|Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> — Franck ([a74f1182](https///github.com/ooneex/talos/commit/a74f1182))
- Only count bun test files when detecting testable targets| — Franck ([08036f86](https///github.com/ooneex/talos/commit/08036f86))
- Skip test targets with no test files in monorepo run| — Franck ([3a6b0c7b](https///github.com/ooneex/talos/commit/3a6b0c7b))
- Remove state option from issue:create, always default to Todo| — Franck ([321cd0c2](https///github.com/ooneex/talos/commit/321cd0c2))
- Correct design skeleton repository URL to ooneex org| — Franck ([7332761a](https///github.com/ooneex/talos/commit/7332761a))
- Correct SPA skeleton repository URL to ooneex org| — Franck ([9c23c9f5](https///github.com/ooneex/talos/commit/9c23c9f5))
- Surface git command failures during release with captured output| — Franck ([92472f2c](https///github.com/ooneex/talos/commit/92472f2c))
- Pack with bun and publish resolved tarball via npm| — Franck ([6a47ac90](https///github.com/ooneex/talos/commit/6a47ac90))
- Publish with npm instead of bun| — Franck ([0544c925](https///github.com/ooneex/talos/commit/0544c925))

## [0.1.1](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.1.1) - 2026-08-09

### Fixed

- Sync Cargo.lock talos-cli version with Cargo.toml (0.1.0)|The chore(release) commit bumped Cargo.toml to 0.1.0 without updating — Franck ([de1f9a78](https///github.com/ooneex/talos/commit/de1f9a78))

## [0.1.2](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.1.2) - 2026-08-09

### Fixed

- Skip npm publish when a release has no publishable targets| — Franck ([ef1226b8](https///github.com/ooneex/talos/commit/ef1226b8))

## [0.1.3](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.1.3) - 2026-08-10

### Changed

- Unblock the CLI release so install scripts find a published build|The darwin-x64 job targeted macos-13, a retired runner image, so it queued — Franck ([c3d5747e](https///github.com/ooneex/talos/commit/c3d5747e))

### Fixed

- Gate unix permission handling behind cfg(unix) for Windows builds| — Franck ([ec2c71ac](https///github.com/ooneex/talos/commit/ec2c71ac))

## [0.1.4](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.1.4) - 2026-08-10

### Changed

- Add timing columns and script labels to the coverage report| — Franck ([5c5d8c00](https///github.com/ooneex/talos/commit/5c5d8c00))
- Sync Cargo.lock to 0.1.3|Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com> — Franck ([332702b7](https///github.com/ooneex/talos/commit/332702b7))

## [0.2.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.2.0) - 2026-08-10

### Added

- Add inline talos-ignore suppressions to performance:check| — Franck ([df9a993c](https///github.com/ooneex/talos/commit/df9a993c))
- Add performance checks to project:check| — Franck ([aa6b279f](https///github.com/ooneex/talos/commit/aa6b279f))
- Add performance:check command and sync completions| — Franck ([5c5c64df](https///github.com/ooneex/talos/commit/5c5c64df))

## [0.2.1](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.2.1) - 2026-08-10

### Changed

- Sync Cargo.lock with talos-cli 0.2.0| — Franck ([9bb834e5](https///github.com/ooneex/talos/commit/9bb834e5))

## [0.3.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.3.0) - 2026-08-10

### Added

- Close app:create and app:init on a next-steps onboarding panel| — Franck ([ef7e5333](https///github.com/ooneex/talos/commit/ef7e5333))

### Changed

- Summarize agent skill writes per config dir instead of per file| — Franck ([0a134a44](https///github.com/ooneex/talos/commit/0a134a44))
- Sync Cargo.lock with talos-cli 0.2.1| — Franck ([98d63850](https///github.com/ooneex/talos/commit/98d63850))

## [0.4.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.4.0) - 2026-08-10

### Added

- Drop the skeleton's remotion.config.ts from scaffolded apps| — Franck ([99fd6355](https///github.com/ooneex/talos/commit/99fd6355))

### Changed

- Sync Cargo.lock with talos-cli 0.3.0| — Franck ([d633cd7f](https///github.com/ooneex/talos/commit/d633cd7f))

## [0.5.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.5.0) - 2026-08-11

### Added

- Rename app module and rewrite tsconfig paths on app init| — Franck ([d0ef90b6](https///github.com/ooneex/talos/commit/d0ef90b6))

### Changed

- Update Cargo.lock| — Franck ([b1f865fa](https///github.com/ooneex/talos/commit/b1f865fa))

## [0.6.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.6.0) - 2026-08-11

### Added

- Resolve the app module dynamically instead of hardcoding "app"| — Franck ([a3b59be9](https///github.com/ooneex/talos/commit/a3b59be9))
- Rename app module directory to project name on app init| — Franck ([e1d4e894](https///github.com/ooneex/talos/commit/e1d4e894))

### Changed

- Clarify cache help text does not update installed CLI binary| — Franck ([f1e22aec](https///github.com/ooneex/talos/commit/f1e22aec))

## [0.6.2](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.6.2) - 2026-08-11

### Changed

- Bump talos-cli version| — Franck ([b132fb51](https///github.com/ooneex/talos/commit/b132fb51))

## [0.7.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.7.0) - 2026-08-13

### Added

- Allow exceptions and types folders in backend modules| — Franck ([8b2a6e93](https///github.com/ooneex/talos/commit/8b2a6e93))
- Make database:create --type a validated enum| — Franck ([6b51f6c4](https///github.com/ooneex/talos/commit/6b51f6c4))

### Changed

- Update Cargo.lock| — Franck ([6bac9b61](https///github.com/ooneex/talos/commit/6bac9b61))
- Remove testing-steps checklist validation from issue_check| — Franck ([f6647dde](https///github.com/ooneex/talos/commit/f6647dde))

## [0.8.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.8.0) - 2026-08-13

### Added

- Add plain LLM-ready report output for project:check --logs| — Franck ([87abb053](https///github.com/ooneex/talos/commit/87abb053))

### Changed

- Update Cargo.lock| — Franck ([cd975173](https///github.com/ooneex/talos/commit/cd975173))

### Fixed

- Exclude backend modules from e2e coverage check| — Franck ([5aa01759](https///github.com/ooneex/talos/commit/5aa01759))

## [0.9.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.9.0) - 2026-08-14

### Added

- Allow bin/ folder in module root layout checks| — Franck ([33e376d8](https///github.com/ooneex/talos/commit/33e376d8))

## [0.10.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.10.0) - 2026-08-16

### Added

- Check the migration index and bin/migration runners in project:check| — Franck ([4454ec46](https///github.com/ooneex/talos/commit/4454ec46))

### Changed

- Sync Cargo.lock with talos-cli 0.9.0| — Franck ([28316052](https///github.com/ooneex/talos/commit/28316052))

### Fixed

- Stop security:check from walking into nested checkouts and worktrees| — Franck ([ebbea06f](https///github.com/ooneex/talos/commit/ebbea06f))
- Make app:stop best effort so one failing step does not skip the rest| — Franck ([e9a5b3ab](https///github.com/ooneex/talos/commit/e9a5b3ab))

## [0.10.1](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.10.1) - 2026-08-17

### Changed

- Stop renaming the app module during app init| — Franck ([f07a2848](https///github.com/ooneex/talos/commit/f07a2848))

## [0.11.0](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.11.0) - 2026-08-17

### Added

- Allow inspirations folder in design src check| — Franck ([7016f530](https///github.com/ooneex/talos/commit/7016f530))

## [0.11.1](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.11.1) - 2026-08-17

### Changed

- Update Cargo.lock| — Franck ([5c054717](https///github.com/ooneex/talos/commit/5c054717))

### Fixed

- Skip reference folders in asset collection and stop flagging extra SDK methods| — Franck ([7ddca73c](https///github.com/ooneex/talos/commit/7ddca73c))

## [0.11.2](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.11.2) - 2026-08-17

### Fixed

- Stop reading a do-while tail as a loop nested in the do it closes| — Franck ([e36b5ef3](https///github.com/ooneex/talos/commit/e36b5ef3))

## [0.11.3](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.11.3) - 2026-08-17

### Changed

- Update Cargo.lock| — Franck ([66f6a453](https///github.com/ooneex/talos/commit/66f6a453))

### Fixed

- Refresh and commit Cargo.lock during release create| — Franck ([c29b6ef6](https///github.com/ooneex/talos/commit/c29b6ef6))

## [0.11.5](https///github.com/ooneex/talos/releases/tag/@talos/cli@0.11.5) - 2026-08-17

### Changed

- Bump version to 0.11.4| — Franck ([b78e76d0](https///github.com/ooneex/talos/commit/b78e76d0))


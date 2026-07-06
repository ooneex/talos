# Changelog

## [1.19.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.19.0) - 2026-07-06

### Added

- Populate queue redis url in microservice env config| — Franck ([07a9e276](https://github.com/ooneex/talos/commit/07a9e276))

## [1.18.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.18.0) - 2026-07-06

### Added

- Copy vite config and mark SPA module as ES module| — Franck ([c62ec232](https://github.com/ooneex/talos/commit/c62ec232))

## [1.17.1](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.17.1) - 2026-07-06

### Fixed

- Correct design skeleton repository URL to ooneex org| — Franck ([7332761a](https://github.com/ooneex/talos/commit/7332761a))

## [1.17.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.17.0) - 2026-07-06

### Added

- Explain permission failures when pushing GitHub secrets and add secret command tests| — Franck ([8582ef35](https://github.com/ooneex/talos/commit/8582ef35))
- Add gitlab and bitbucket credentials and secret:push commands| — Franck ([ced5143d](https://github.com/ooneex/talos/commit/ced5143d))

### Changed

- Stop generating redundant modules/app/var/.gitkeep| — Franck ([9f54708a](https://github.com/ooneex/talos/commit/9f54708a))

### Fixed

- Correct SPA skeleton repository URL to ooneex org| — Franck ([9c23c9f5](https://github.com/ooneex/talos/commit/9c23c9f5))

## [1.16.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.16.0) - 2026-07-06

### Added

- Add github:secret:push command| — Franck ([7436fdad](https://github.com/ooneex/talos/commit/7436fdad))

### Changed

- Simplify GitLab and Bitbucket pipeline templates| — Franck ([cdaaa538](https://github.com/ooneex/talos/commit/cdaaa538))
- Simplify GitHub production deployment workflow templates| — Franck ([250f65f1](https://github.com/ooneex/talos/commit/250f65f1))
- Update GitHub workflow templates| — Franck ([296f8e0f](https://github.com/ooneex/talos/commit/296f8e0f))
- Consolidate CI templates to install talos globally and run monorepo:check| — Franck ([d34dacf0](https://github.com/ooneex/talos/commit/d34dacf0))

## [1.15.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.15.0) - 2026-07-06

### Added

- Add bash and fish shell completion commands| — Franck ([f25115de](https://github.com/ooneex/talos/commit/f25115de))

## [1.14.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.14.0) - 2026-07-06

### Added

- Add build, fmt, lint, and test script alias commands| — Franck ([c620c3ca](https://github.com/ooneex/talos/commit/c620c3ca))

## [1.13.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.13.0) - 2026-07-06

### Added

- Add check command| — Franck ([b428df21](https://github.com/ooneex/talos/commit/b428df21))
- Add run command| — Franck ([599930c9](https://github.com/ooneex/talos/commit/599930c9))
- Add ensureBin guard to fail fast when required binaries are missing| — Franck ([05c7bb9b](https://github.com/ooneex/talos/commit/05c7bb9b))

### Changed

- Update LLM agent and skill templates| — Franck ([9222050d](https://github.com/ooneex/talos/commit/9222050d))

## [1.12.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.12.0) - 2026-07-06

### Added

- Suggest only Dockerfile targets for docker:publish completions| — Franck ([df0f679d](https://github.com/ooneex/talos/commit/df0f679d))
- Add docker:publish command to build and push images to Docker Hub| — Franck ([3d24f305](https://github.com/ooneex/talos/commit/3d24f305))
- Pass per-module seed cache directory to seed:run| — Franck ([4c839f6d](https://github.com/ooneex/talos/commit/4c839f6d))
- Pass per-module cache directory to migration scripts| — Franck ([59cf20d9](https://github.com/ooneex/talos/commit/59cf20d9))
- Cache module script runs to skip unchanged modules on migration:up| — Franck ([4661b054](https://github.com/ooneex/talos/commit/4661b054))

### Changed

- Strip malformed ANSI escapes up to terminating m byte| — Franck ([db6ddfcc](https://github.com/ooneex/talos/commit/db6ddfcc))
- Import MIGRATIONS_CACHE_DIR from @talosjs/migrations| — Franck ([ceb6c4ff](https://github.com/ooneex/talos/commit/ceb6c4ff))
- Import SEEDS_CACHE_DIR from @talosjs/seeds| — Franck ([e975d5fc](https://github.com/ooneex/talos/commit/e975d5fc))
- Cover per-module cache directory for seed:run| — Franck ([340f24dc](https://github.com/ooneex/talos/commit/340f24dc))
- Cover per-module cache directory for migration scripts| — Franck ([110c460a](https://github.com/ooneex/talos/commit/110c460a))
- Update migration runner tests for relocated cache| — Franck ([e1a4a5b3](https://github.com/ooneex/talos/commit/e1a4a5b3))
- Move migration caching into the migrations package| — Franck ([bd11c1ac](https://github.com/ooneex/talos/commit/bd11c1ac))
- Document utils folder in module scaffold skill template| — Franck ([6e03717e](https://github.com/ooneex/talos/commit/6e03717e))
- Cover module script cache in migration:up and runModuleScripts| — Franck ([febf8710](https://github.com/ooneex/talos/commit/febf8710))
- Use monorepo:check in LLM scaffold templates| — Franck ([7770ebac](https://github.com/ooneex/talos/commit/7770ebac))
- Read tsconfig via Bun.file().json() in moduleRegistry| — Franck ([b1e529c7](https://github.com/ooneex/talos/commit/b1e529c7))

## [1.11.2](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.11.2) - 2026-07-05

### Changed

- Run monorepo task groups in parallel bounded by CPU count| — Franck ([21cbc117](https://github.com/ooneex/talos/commit/21cbc117))
- Filter passing-test noise from failure excerpts| — Franck ([439816c0](https://github.com/ooneex/talos/commit/439816c0))
- Log successful tasks in monorepo:run output| — Franck ([31bf5dd2](https://github.com/ooneex/talos/commit/31bf5dd2))

## [1.11.1](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.11.1) - 2026-07-05

### Changed

- Log only failed tasks in monorepo:run output| — Franck ([10819ee5](https://github.com/ooneex/talos/commit/10819ee5))

## [1.11.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.11.0) - 2026-07-05

### Added

- Add shell completion for agent:skills:create flags| — Franck ([d7af0b4c](https://github.com/ooneex/talos/commit/d7af0b4c))
- Add agent:skills:create command replacing claude and codex init| — Franck ([31126e5b](https://github.com/ooneex/talos/commit/31126e5b))
- Add multiselect assistant skills prompt to app:init| — Franck ([d4dcef9b](https://github.com/ooneex/talos/commit/d4dcef9b))

### Changed

- Run monorepo task groups sequentially| — Franck ([86f9c379](https://github.com/ooneex/talos/commit/86f9c379))
- Rename askAgentSkills config field to name| — Franck ([5961e06b](https://github.com/ooneex/talos/commit/5961e06b))
- Document fmt step in monorepo:check skill template| — Franck ([3307be77](https://github.com/ooneex/talos/commit/3307be77))
- Use monorepo:check in talos.commands skill template| — Franck ([a0e0936c](https://github.com/ooneex/talos/commit/a0e0936c))
- Drop claude/codex init tests and update for agent:skills:create| — Franck ([facb57b8](https://github.com/ooneex/talos/commit/facb57b8))
- Update templates for agent:skills:create command| — Franck ([054e9c93](https://github.com/ooneex/talos/commit/054e9c93))
- Remove ClaudeInitCommand and CodexInitCommand| — Franck ([86cfc329](https://github.com/ooneex/talos/commit/86cfc329))
- Cover agent:skills:create command| — Franck ([0f010877](https://github.com/ooneex/talos/commit/0f010877))
- Cover multiselect assistant skills prompt in app:init| — Franck ([c70c778e](https://github.com/ooneex/talos/commit/c70c778e))

## [1.10.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.10.0) - 2026-07-05

### Added

- Prompt before installing commit-msg hook in app:init| — Franck ([af0bd816](https://github.com/ooneex/talos/commit/af0bd816))

### Changed

- Parallelize workspace probes in monorepo:run| — Franck ([0bfbe62c](https://github.com/ooneex/talos/commit/0bfbe62c))

## [1.9.1](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.9.1) - 2026-07-05

### Changed

- Apply biome formatting across packages| — Franck ([5da156c4](https://github.com/ooneex/talos/commit/5da156c4))
- Analyze release targets concurrently and use Bun.spawn over shell| — Franck ([0c900b57](https://github.com/ooneex/talos/commit/0c900b57))

## [1.9.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.9.0) - 2026-07-05

### Added

- Add fmt step to monorepo:check pipeline| — Franck ([1948de03](https://github.com/ooneex/talos/commit/1948de03))
- Add commitlint:init and commitlint:check commands| — Franck ([f12b4b88](https://github.com/ooneex/talos/commit/f12b4b88))
- Wire monorepo:check into completions, docs, and app template| — Franck ([f4832f25](https://github.com/ooneex/talos/commit/f4832f25))
- Add monorepo:check command| — Franck ([ad3591b1](https://github.com/ooneex/talos/commit/ad3591b1))
- Show trimmed failure excerpt instead of streaming monorepo:run output| — Franck ([676bfd24](https://github.com/ooneex/talos/commit/676bfd24))

### Changed

- Update monorepo:check tests for fmt step| — Franck ([1861a7c7](https://github.com/ooneex/talos/commit/1861a7c7))
- Use talos monorepo:check in LLM scaffold templates| — Franck ([f3753943](https://github.com/ooneex/talos/commit/f3753943))
- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update app scaffold tests for removed root scripts block| — Franck ([f15d5279](https://github.com/ooneex/talos/commit/f15d5279))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Update scaffold templates for bun commands and workflow| — Franck ([c50fcf1d](https://github.com/ooneex/talos/commit/c50fcf1d))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Update scaffold templates for fmt script and drop app scripts block| — Franck ([1a8fd30e](https://github.com/ooneex/talos/commit/1a8fd30e))
- Shell out to talos CLI in commit-msg hook instead of baked path| — Franck ([d68775ba](https://github.com/ooneex/talos/commit/d68775ba))
- Remove Husky ENV from app Dockerfile template| — Franck ([358906f6](https://github.com/ooneex/talos/commit/358906f6))
- Update docs for native commitlint workflow| — Franck ([abfdb668](https://github.com/ooneex/talos/commit/abfdb668))
- Drop commitlint scope-enum editing and scaffolding for native commitlint| — Franck ([f70faae0](https://github.com/ooneex/talos/commit/f70faae0))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))
- Update check script assertions for monorepo:check| — Franck ([57deff70](https://github.com/ooneex/talos/commit/57deff70))
- Remove Nx from generated apps and task engine| — Franck ([f6d22d09](https://github.com/ooneex/talos/commit/f6d22d09))

## [1.8.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.8.0) - 2026-07-04

### Added

- Support install command and dynamic script completion in monorepo:run| — Franck ([b8a94130](https://github.com/ooneex/talos/commit/b8a94130))
- Fingerprint monorepo targets via git to skip ignored files| — Franck ([17ab85ea](https://github.com/ooneex/talos/commit/17ab85ea))

### Changed

- Extract monorepo:run presentation into monorepoRunLogger| — Franck ([93cd0442](https://github.com/ooneex/talos/commit/93cd0442))

## [1.7.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.7.0) - 2026-07-04

### Added

- Add monorepo:run command with task engine and caching| — Franck ([5565d43d](https://github.com/ooneex/talos/commit/5565d43d))
- Add jira:credentials:create command| — Franck ([53fcf273](https://github.com/ooneex/talos/commit/53fcf273))
- Support pulling issues from Jira in issue:pull| — Franck ([a29e8315](https://github.com/ooneex/talos/commit/a29e8315))
- Include module field in generated issue YAML| — Franck ([2131b74f](https://github.com/ooneex/talos/commit/2131b74f))
- Add linear:credentials:create command| — Franck ([ad5d90d8](https://github.com/ooneex/talos/commit/ad5d90d8))
- Scaffold var directory placeholder for new apps| — Franck ([13c250e1](https://github.com/ooneex/talos/commit/13c250e1))

### Changed

- Remove app:build command| — Franck ([22bac334](https://github.com/ooneex/talos/commit/22bac334))
- Remove interactive mode from issue:create| — Franck ([fb2a4c31](https://github.com/ooneex/talos/commit/fb2a4c31))
- Assert non-null fetch call in IssuePullCommand spec| — Franck ([a8069460](https://github.com/ooneex/talos/commit/a8069460))
- Document module field in issue skill templates| — Franck ([91b6384b](https://github.com/ooneex/talos/commit/91b6384b))
- Remove bunfig.toml from app scaffolding| — Franck ([b3a2856b](https://github.com/ooneex/talos/commit/b3a2856b))
- Move app env config to project root .env.yml| — Franck ([8d7b7feb](https://github.com/ooneex/talos/commit/8d7b7feb))
- Print plain version to stdout| — Franck ([0a93b92a](https://github.com/ooneex/talos/commit/0a93b92a))

## [1.6.1](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.6.1) - 2026-07-02

### Fixed

- Surface git command failures during release with captured output| — Franck ([92472f2c](https://github.com/ooneex/talos/commit/92472f2c))

## [1.6.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.6.0) - 2026-07-02

### Added

- Add version and upgrade commands| — Franck ([56f7dca5](https://github.com/ooneex/talos/commit/56f7dca5))

### Changed

- Route command spawning through spawnStep with spinner and captured output| — Franck ([9e017b8f](https://github.com/ooneex/talos/commit/9e017b8f))

## [1.5.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.5.0) - 2026-07-02

### Added

- Add --publish flag to release:create for npm publishing| — Franck ([f292e029](https://github.com/ooneex/talos/commit/f292e029))
- Rename publish and release flags to plural with multi-value support| — Franck ([312238ca](https://github.com/ooneex/talos/commit/312238ca))

## [1.4.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.4.0) - 2026-07-02

### Added

- Require a clean working tree before releasing| — Franck ([de8e3543](https://github.com/ooneex/talos/commit/de8e3543))
- Log skipped already-published versions| — Franck ([c55c72a8](https://github.com/ooneex/talos/commit/c55c72a8))

### Changed

- Cover skip logging and clean-tree release guard| — Franck ([cb569ba4](https://github.com/ooneex/talos/commit/cb569ba4))
- Cover pack-and-publish tarball flow| — Franck ([df2f4d78](https://github.com/ooneex/talos/commit/df2f4d78))

### Fixed

- Pack with bun and publish resolved tarball via npm| — Franck ([6a47ac90](https://github.com/ooneex/talos/commit/6a47ac90))

## [1.3.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.3.0) - 2026-07-02

### Added

- Support package filter in release create command| — Franck ([5285aede](https://github.com/ooneex/talos/commit/5285aede))

### Changed

- Cover npm publish tooling and release package filter| — Franck ([b983caa7](https://github.com/ooneex/talos/commit/b983caa7))

### Fixed

- Publish with npm instead of bun| — Franck ([0544c925](https://github.com/ooneex/talos/commit/0544c925))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.2.0) - 2026-07-02

### Added

- Skip already-published versions and report a publish summary| — Franck ([4b5d6372](https://github.com/ooneex/talos/commit/4b5d6372))

### Changed

- Cover version-skipping and publish summary| — Franck ([ca2001d5](https://github.com/ooneex/talos/commit/ca2001d5))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cli@1.1.0) - 2026-07-02

### Added

- Complete comma-separated package and module names for npm publish| — Franck ([ee966464](https://github.com/ooneex/talos/commit/ee966464))
- Publish multiple or all packages and modules to npm| — Franck ([9a381227](https://github.com/ooneex/talos/commit/9a381227))
- Add npm publish command| — Franck ([9f24761c](https://github.com/ooneex/talos/commit/9f24761c))
- Add GitHub credentials create command| — Franck ([99446335](https://github.com/ooneex/talos/commit/99446335))
- Add shell completions for credentials commands| — Franck ([9a297821](https://github.com/ooneex/talos/commit/9a297821))
- Add Docker and npm credentials create commands| — Franck ([6ca5eea2](https://github.com/ooneex/talos/commit/6ca5eea2))
- Generate CI/CD pipeline for new microservices| — Franck ([c5935c43](https://github.com/ooneex/talos/commit/c5935c43))
- Add cli package| — Franck ([4f70f57c](https://github.com/ooneex/talos/commit/4f70f57c))

### Changed

- Write generated files concurrently| — Franck ([dc7949e8](https://github.com/ooneex/talos/commit/dc7949e8))
- Extract spawnStep and loadAppModuleName helpers| — Franck ([58f4edd7](https://github.com/ooneex/talos/commit/58f4edd7))
- Extract scaffoldAgentConfig helper| — Franck ([4106c597](https://github.com/ooneex/talos/commit/4106c597))
- Extract saveCredentials helper| — Franck ([93d6c356](https://github.com/ooneex/talos/commit/93d6c356))
- Register NpmPublishCommand in index export test| — Franck ([25bf6e41](https://github.com/ooneex/talos/commit/25bf6e41))
- Update npm publish and completion tests| — Franck ([495bc9bc](https://github.com/ooneex/talos/commit/495bc9bc))
- Simplify npm publish logging and spinner handling| — Franck ([130e4634](https://github.com/ooneex/talos/commit/130e4634))
- Cover multi-target npm publish| — Franck ([29875318](https://github.com/ooneex/talos/commit/29875318))
- Add tests for npm publish command| — Franck ([cf898920](https://github.com/ooneex/talos/commit/cf898920))
- Add tests for GitHub credentials command| — Franck ([30e1c16a](https://github.com/ooneex/talos/commit/30e1c16a))
- Document GitHub credentials command| — Franck ([98d0c6b8](https://github.com/ooneex/talos/commit/98d0c6b8))
- Cover credentials commands in zsh completion test| — Franck ([960e69b5](https://github.com/ooneex/talos/commit/960e69b5))
- Document Docker and npm credentials commands| — Franck ([3159856f](https://github.com/ooneex/talos/commit/3159856f))
- Add tests for Docker and npm credentials commands| — Franck ([d3fe248c](https://github.com/ooneex/talos/commit/d3fe248c))
- Add Nx cache to CI pipeline templates| — Franck ([6e21ebc5](https://github.com/ooneex/talos/commit/6e21ebc5))
- Remove redundant CommandRun and SdkCreate command tests| — Franck ([503c5d1e](https://github.com/ooneex/talos/commit/503c5d1e))
- Update validation package description in packages skill template| — Franck ([3705639f](https://github.com/ooneex/talos/commit/3705639f))
- Update entity template to use random.id with 20-char primary key| — Franck ([8331049b](https://github.com/ooneex/talos/commit/8331049b))
- Update template references to @talosjs| — Franck ([4efa4778](https://github.com/ooneex/talos/commit/4efa4778))


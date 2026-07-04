# Changelog

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


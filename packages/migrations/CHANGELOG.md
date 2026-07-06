# Changelog

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/migrations@1.2.0) - 2026-07-06

### Added

- Add runLogger for styled migration:up output| — Franck ([0b4bf3e9](https://github.com/ooneex/talos/commit/0b4bf3e9))
- Accept --cache-dir to locate the migration run cache| — Franck ([43009f39](https://github.com/ooneex/talos/commit/43009f39))
- Add per-version migration run cache| — Franck ([c38f53c1](https://github.com/ooneex/talos/commit/c38f53c1))

### Changed

- Harden visibleWidth to strip malformed ANSI escapes| — Franck ([370689d9](https://github.com/ooneex/talos/commit/370689d9))
- Simplify colorize back to auto-depth ANSI| — Franck ([5fec613c](https://github.com/ooneex/talos/commit/5fec613c))
- Extract MIGRATIONS_CACHE_DIR into constants module| — Franck ([aecad987](https://github.com/ooneex/talos/commit/aecad987))
- Cover runLogger and update migration cache tests| — Franck ([f562c7b5](https://github.com/ooneex/talos/commit/f562c7b5))
- Cover per-version migration cache| — Franck ([dbd6fc55](https://github.com/ooneex/talos/commit/dbd6fc55))

### Fixed

- Emit truecolor ANSI to avoid malformed escapes in 16-color terminals| — Franck ([fc127c93](https://github.com/ooneex/talos/commit/fc127c93))

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/migrations@1.1.2) - 2026-07-05

### Changed

- Apply biome formatting across packages| — Franck ([5da156c4](https://github.com/ooneex/talos/commit/5da156c4))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/migrations@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/migrations@1.1.0) - 2026-07-02

### Added

- Add migrations package| — Franck ([8bcc266f](https://github.com/ooneex/talos/commit/8bcc266f))


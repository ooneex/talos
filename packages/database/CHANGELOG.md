# Changelog

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.1.2) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.1.0) - 2026-07-02

### Added

- Add database package| — Franck ([f087d0d1](https://github.com/ooneex/talos/commit/f087d0d1))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.1.3) - 2026-08-09

### Changed

- Fix Redis connection URL database parameter in test| — Franck ([2d5e701f](https://github.com/ooneex/talos/commit/2d5e701f))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https://github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https://github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https://github.com/ooneex/talos/commit/e19e3785))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.2.0) - 2026-08-17

### Added

- Add DragonflyDatabase adapter with ping and FLUSHDB drop| — Franck ([bf1e1cdc](https://github.com/ooneex/talos/commit/bf1e1cdc))

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.2.1) - 2026-08-19

### Changed

- Extract AbstractRedisDatabase shared by Redis and Dragonfly| — Franck ([0c8f7b9c](https://github.com/ooneex/talos/commit/0c8f7b9c))

## [1.2.2](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.2.2) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https://github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https://github.com/ooneex/talos/commit/aee22840))

## [1.2.3](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.2.3) - 2026-09-01

### Changed

- Add PostgreSQL test driver| — Franck ([abbcecc2](https://github.com/ooneex/talos/commit/abbcecc2))

## [1.3.0](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.3.0) - 2026-09-20

### Added

- Add Turso database driver support| — Franck ([53b7c5be](https://github.com/ooneex/talos/commit/53b7c5be))
- Add MongoDB driver support| — Franck ([03079445](https://github.com/ooneex/talos/commit/03079445))
- Add Cloudflare D1 driver support| — Franck ([d1f34263](https://github.com/ooneex/talos/commit/d1f34263))
- Add native Redis driver| — Franck ([6b4b336e](https://github.com/ooneex/talos/commit/6b4b336e))
- Add ClickHouse driver support| — Franck ([2924c7ee](https://github.com/ooneex/talos/commit/2924c7ee))
- Replace TypeORM with Bun-native SQL ORM| — Franck ([5341b781](https://github.com/ooneex/talos/commit/5341b781))

### Changed

- Remove PostgresDatabase and SqliteDatabase wrappers| — Franck ([4a4f1db2](https://github.com/ooneex/talos/commit/4a4f1db2))
- Fix changelog links| — Franck ([aea98e6c](https://github.com/ooneex/talos/commit/aea98e6c))

### Fixed

- Normalize Bun SQL arrays and expose driver error codes| — Franck ([5491158e](https://github.com/ooneex/talos/commit/5491158e))

## [1.3.1](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.3.1) - 2026-09-20

### Changed

- @talosjs/database@1.3.0| — Franck ([a46242e6](https://github.com/ooneex/talos/commit/a46242e6))

## [1.4.0](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.4.0) - 2026-09-20

### Added

- Export decorator types and enhance generic typing|Exports DateColumnDecoratorType and RelationDecoratorType for decorator factories; — Franck ([89c4cadc](https://github.com/ooneex/talos/commit/89c4cadc))

## [1.4.1](https://github.com/ooneex/talos/releases/tag/@talosjs/database@1.4.1) - 2026-09-20

### Fixed

- Bind raw query parameters through the driver|Bun serialises an array parameter as `a,b,c`, which Postgres rejects as a — Franck ([220dec31](https://github.com/ooneex/talos/commit/220dec31))


# Changelog

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/cache@1.1.2) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/cache@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/cache@1.1.0) - 2026-07-02

### Added

- Add cache package| — Franck ([5a38da1d](https://github.com/ooneex/talos/commit/5a38da1d))

## [1.2.0](https///github.com/ooneex/talos/releases/tag/@talosjs/cache@1.2.0) - 2026-08-09

### Added

- Add Cache key helpers for routes and socket routes| — Franck ([ffe6ce73](https///github.com/ooneex/talos/commit/ffe6ce73))

### Changed

- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https///github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https///github.com/ooneex/talos/commit/14db3019))
- Improve function coverage in AbstractCache and Cache|Add explicit constructor to AbstractCache and convert the static-only — Franck ([d4a0ba7b](https///github.com/ooneex/talos/commit/d4a0ba7b))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https///github.com/ooneex/talos/commit/e19e3785))

## [1.2.1](https///github.com/ooneex/talos/releases/tag/@talosjs/cache@1.2.1) - 2026-08-17

### Changed

- Share one SCAN loop and delete key pages in a single round trip| — Franck ([999bde67](https///github.com/ooneex/talos/commit/999bde67))

## [1.3.0](https///github.com/ooneex/talos/releases/tag/@talosjs/cache@1.3.0) - 2026-08-17

### Added

- Add DragonflyCache adapter with atomic TTL and unlink based eviction| — Franck ([6281b9ec](https///github.com/ooneex/talos/commit/6281b9ec))

## [1.3.1](https///github.com/ooneex/talos/releases/tag/@talosjs/cache@1.3.1) - 2026-08-19

### Changed

- Extract AbstractRedisCache shared by the Redis and Dragonfly caches| — Franck ([c3043d85](https///github.com/ooneex/talos/commit/c3043d85))

## [1.3.2](https///github.com/ooneex/talos/releases/tag/@talosjs/cache@1.3.2) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https///github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https///github.com/ooneex/talos/commit/aee22840))


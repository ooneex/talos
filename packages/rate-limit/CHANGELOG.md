# Changelog

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.2) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.0) - 2026-07-02

### Added

- Add rate limit package| — Franck ([8d3ed35b](https://github.com/ooneex/talos/commit/8d3ed35b))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.3) - 2026-08-09

### Changed

- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https://github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https://github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https://github.com/ooneex/talos/commit/e19e3785))

## [1.1.4](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.4) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https://github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https://github.com/ooneex/talos/commit/aee22840))

## [1.1.5](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.5) - 2026-09-20

### Changed

- Fix changelog links| — Franck ([4f00ec96](https://github.com/ooneex/talos/commit/4f00ec96))

## [1.1.6](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.6) - 2026-09-20

### Changed

- @talosjs/rate-limit@1.1.5| — Franck ([ebc58266](https://github.com/ooneex/talos/commit/ebc58266))

## [1.1.7](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.7) - 2026-09-25

## [1.1.8](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.8) - 2026-09-26

## [1.1.9](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.9) - 2026-10-13

### Changed

- Run package lint through bun check|Co-authored-by: Cursor <cursoragent@cursor.com> — Franck ([de3ee05c](https://github.com/ooneex/talos/commit/de3ee05c))

## [1.1.10](https://github.com/ooneex/talos/releases/tag/@talosjs/rate-limit@1.1.10) - 2026-10-18

### Fixed

- Reconnect RedisRateLimiter after Redis comes back from an outage|Bun's RedisClient stops trying after maxRetries reconnect attempts and stays closed for good, so — Julien ([5c031a49](https://github.com/ooneex/talos/commit/5c031a49))


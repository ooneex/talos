# Changelog

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.1) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.0) - 2026-07-06

### Added

- Add per-seed run cache and styled runLogger output| — Franck ([cc96432f](https://github.com/ooneex/talos/commit/cc96432f))

### Changed

- Harden visibleWidth to strip malformed ANSI escapes| — Franck ([8d175504](https://github.com/ooneex/talos/commit/8d175504))
- Extract SEEDS_CACHE_DIR into constants module| — Franck ([9cdc66e6](https://github.com/ooneex/talos/commit/9cdc66e6))
- Remove @talosjs/logger dependency| — Franck ([47bb05ed](https://github.com/ooneex/talos/commit/47bb05ed))
- Cover seed cache and runLogger| — Franck ([3357ab9a](https://github.com/ooneex/talos/commit/3357ab9a))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.1.0) - 2026-07-02

### Added

- Add seeds package| — Franck ([397b7c7f](https://github.com/ooneex/talos/commit/397b7c7f))

## [1.2.2](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.2) - 2026-08-09

### Changed

- Reduce complexity and clean up conventions| — Franck ([8b18478d](https://github.com/ooneex/talos/commit/8b18478d))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https://github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https://github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https://github.com/ooneex/talos/commit/e19e3785))

## [1.2.3](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.3) - 2026-08-17

### Changed

- Document the ordered and parallel awaits the seed runner relies on| — Franck ([e772edf3](https://github.com/ooneex/talos/commit/e772edf3))

## [1.2.4](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.4) - 2026-08-17

### Fixed

- Order seeds by dependency and run each one only once| — Franck ([98b0057d](https://github.com/ooneex/talos/commit/98b0057d))

## [1.2.5](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.5) - 2026-08-19

### Changed

- Drop the seed cache and rely on the database state| — Franck ([a86cf16b](https://github.com/ooneex/talos/commit/a86cf16b))

### Removed

- Restore the seed cache| — Franck ([029bd9a5](https://github.com/ooneex/talos/commit/029bd9a5))

### Fixed

- Make --drop re-run every seed instead of dropping the database| — Franck ([94a159c6](https://github.com/ooneex/talos/commit/94a159c6))

## [1.2.6](https://github.com/ooneex/talos/releases/tag/@talosjs/seeds@1.2.6) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https://github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https://github.com/ooneex/talos/commit/aee22840))


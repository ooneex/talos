# Changelog

## [1.2.3](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.2.3) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.2.2](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.2.2) - 2026-07-07

### Changed

- Fix PORT default comment to match configured value| — Franck ([1949a280](https://github.com/ooneex/talos/commit/1949a280))

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.2.1) - 2026-07-06

### Changed

- Change default app port to 8030| — Franck ([6cf7dd08](https://github.com/ooneex/talos/commit/6cf7dd08))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.2.0) - 2026-07-06

### Added

- Layer env candidates so later files override earlier keys| — Franck ([d16bb1be](https://github.com/ooneex/talos/commit/d16bb1be))

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.1.2) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.1.1) - 2026-07-04

### Changed

- Drop modules/shared fallback from default env candidates| — Franck ([a75932a9](https://github.com/ooneex/talos/commit/a75932a9))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.1.0) - 2026-07-02

### Added

- Add app env package| — Franck ([1c4d8f4b](https://github.com/ooneex/talos/commit/1c4d8f4b))

### Changed

- Update AppEnv tests| — Franck ([46021ccc](https://github.com/ooneex/talos/commit/46021ccc))

## [1.3.0](https///github.com/ooneex/talos/releases/tag/@talosjs/app-env@1.3.0) - 2026-08-09

### Added

- Add Stripe environment variable configuration|Extends AppEnv to support Stripe configuration with STRIPE_SECRET_KEY, STRIPE_API_VERSION, and STRIPE_WEBHOOK_SECRET variables. Updates environment schema and adds corresponding test coverage. — Julien ([373eaf49](https///github.com/ooneex/talos/commit/373eaf49))

### Changed

- Consolidate AI provider keys into OPENROUTER_API_KEY| — Franck ([8d40cd7c](https///github.com/ooneex/talos/commit/8d40cd7c))
- Reduce complexity and clean up conventions| — Franck ([d0970535](https///github.com/ooneex/talos/commit/d0970535))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https///github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https///github.com/ooneex/talos/commit/e19e3785))
- Rename the loadEnv fallback fixture from shared to app|Keep the test module name aligned with the app module (not a special — Franck ([57240445](https///github.com/ooneex/talos/commit/57240445))

### Fixed

- Ignore literal undefined values when reading env vars| — Franck ([495cd387](https///github.com/ooneex/talos/commit/495cd387))


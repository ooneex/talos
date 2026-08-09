# Changelog

## [1.2.4](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.2.4) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.2.3](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.2.3) - 2026-07-07

### Changed

- Skip formData parsing for body-less requests and use one-shot hashing| — Franck ([3099525c](https://github.com/ooneex/talos/commit/3099525c))

## [1.2.2](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.2.2) - 2026-07-06

### Changed

- Always log server start regardless of onStart handler| — Franck ([35017f33](https://github.com/ooneex/talos/commit/35017f33))

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.2.1) - 2026-07-06

### Changed

- Decouple onStart from banner and drop brand title line| — Franck ([c430a461](https://github.com/ooneex/talos/commit/c430a461))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.2.0) - 2026-07-06

### Added

- Add styled server start banner on startup| — Franck ([a17e264a](https://github.com/ooneex/talos/commit/a17e264a))

### Changed

- Style server banner exclusively via Bun.color| — Franck ([c7b9d5b6](https://github.com/ooneex/talos/commit/c7b9d5b6))

## [1.1.4](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.1.4) - 2026-07-06

### Changed

- Clarify env loading overlays module config over project root| — Franck ([d972a21e](https://github.com/ooneex/talos/commit/d972a21e))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.1.3) - 2026-07-05

### Changed

- Apply biome formatting across packages| — Franck ([5da156c4](https://github.com/ooneex/talos/commit/5da156c4))

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.1.2) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.1.1) - 2026-07-04

### Changed

- Load env from project root instead of modules/shared| — Franck ([18be7ad9](https://github.com/ooneex/talos/commit/18be7ad9))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/app@1.1.0) - 2026-07-02

### Added

- Add app package| — Franck ([b5c26905](https://github.com/ooneex/talos/commit/b5c26905))

### Changed

- Update validation constraint imports to per-file entry points| — Franck ([879b91b1](https://github.com/ooneex/talos/commit/879b91b1))

## [1.3.0](https///github.com/ooneex/talos/releases/tag/@talosjs/app@1.3.0) - 2026-08-09

### Added

- Add configurable websocket options to App| — Franck ([9e9fb16b](https///github.com/ooneex/talos/commit/9e9fb16b))

### Changed

- Update logging test to handle 16-color fallback in output| — Franck ([04abddeb](https///github.com/ooneex/talos/commit/04abddeb))
- Reduce complexity and clean up conventions| — Franck ([e5c9c529](https///github.com/ooneex/talos/commit/e5c9c529))
- Use validateAssert guard for route constraint validation|Replace the inline constraint-shape detection in validateConstraint — Franck ([68d5f642](https///github.com/ooneex/talos/commit/68d5f642))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https///github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https///github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https///github.com/ooneex/talos/commit/e19e3785))
- Use Cache helpers from @talosjs/cache for route keys| — Franck ([1e492faa](https///github.com/ooneex/talos/commit/1e492faa))

### Fixed

- Resolve roles.yml fallback from the running module, not shared|The fallback path was hardcoded to modules/shared/src/roles.yml, so any — Franck ([6e84dbf1](https///github.com/ooneex/talos/commit/6e84dbf1))


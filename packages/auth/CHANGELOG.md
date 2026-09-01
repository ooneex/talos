# Changelog

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.1.2) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.1.0) - 2026-07-02

### Added

- Add auth package| — Franck ([186c12a8](https://github.com/ooneex/talos/commit/186c12a8))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.1.3) - 2026-08-09

### Changed

- Reduce complexity and clean up conventions| — Franck ([81be7c8e](https://github.com/ooneex/talos/commit/81be7c8e))
- Cast delegated Clerk user result to satisfy stricter typing| — Franck ([8c2908f6](https://github.com/ooneex/talos/commit/8c2908f6))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https://github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https://github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https://github.com/ooneex/talos/commit/e19e3785))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.2.0) - 2026-08-11

### Added

- Use RoleType instead of Uppercase<string> for roles| — Franck ([acb72f8d](https://github.com/ooneex/talos/commit/acb72f8d))

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.2.1) - 2026-08-11

### Changed

- Use GUEST_ROLE constant instead of string literal| — Franck ([caa43772](https://github.com/ooneex/talos/commit/caa43772))

## [1.3.0](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.3.0) - 2026-08-20

### Added

- Add getUserByEmail lookup to ClerkAuth| — Franck ([a779eed6](https://github.com/ooneex/talos/commit/a779eed6))

## [1.3.1](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.3.1) - 2026-08-20

### Fixed

- Return 401 for invalid credentials via AuthException status option| — Franck ([a03a2ff3](https://github.com/ooneex/talos/commit/a03a2ff3))

## [1.3.2](https://github.com/ooneex/talos/releases/tag/@talosjs/auth@1.3.2) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https://github.com/ooneex/talos/commit/8677a826))


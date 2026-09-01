# Changelog

## [1.1.4](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.1.4) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.1.3) - 2026-07-05

### Changed

- Expect defined adapter for known provider| — Franck ([d1313064](https://github.com/ooneex/talos/commit/d1313064))
- Expect undefined adapter for unknown provider| — Franck ([ec210d87](https://github.com/ooneex/talos/commit/ec210d87))

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.1.2) - 2026-07-05

### Changed

- Apply biome formatting across packages| — Franck ([5da156c4](https://github.com/ooneex/talos/commit/5da156c4))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.1.0) - 2026-07-02

### Added

- Add ai package| — Franck ([44ccd2de](https://github.com/ooneex/talos/commit/44ccd2de))

## [1.2.0](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.2.0) - 2026-08-09

### Added

- Add judge method to IChat interface and expand skills support| — Franck ([5209c732](https://github.com/ooneex/talos/commit/5209c732))
- Add ISkill interface, SkillsDiscoverTool, and skills support in Chat|- Add AiSkillClassType and ISkill interface for skill packages — Franck ([0e477ce8](https://github.com/ooneex/talos/commit/0e477ce8))

### Changed

- Update Chat module and test helpers|Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com> — Franck ([d15e4d6c](https://github.com/ooneex/talos/commit/d15e4d6c))
- Remove SkillsDiscoverTool and update Chat| — Franck ([63adb6ae](https://github.com/ooneex/talos/commit/63adb6ae))
- Reduce complexity and clean up conventions| — Franck ([3a8e6619](https://github.com/ooneex/talos/commit/3a8e6619))
- Use AssertSchemaType after validation package split|The validation package now distinguishes AssertSchemaType (single — Franck ([2e0729ae](https://github.com/ooneex/talos/commit/2e0729ae))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https://github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https://github.com/ooneex/talos/commit/14db3019))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https://github.com/ooneex/talos/commit/e19e3785))

## [1.2.1](https://github.com/ooneex/talos/releases/tag/@talosjs/ai@1.2.1) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https://github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https://github.com/ooneex/talos/commit/aee22840))


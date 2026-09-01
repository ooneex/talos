# Changelog

## [1.1.4](https://github.com/ooneex/talos/releases/tag/@talosjs/rag@1.1.4) - 2026-07-13

### Changed

- Replace tsgo with tsc in lint scripts across packages| — Franck ([b490c580](https://github.com/ooneex/talos/commit/b490c580))

## [1.1.3](https://github.com/ooneex/talos/releases/tag/@talosjs/rag@1.1.3) - 2026-07-06

### Changed

- Increase Convertor test timeouts for slow JVM cold start| — Franck ([fcc61d7c](https://github.com/ooneex/talos/commit/fcc61d7c))

## [1.1.2](https://github.com/ooneex/talos/releases/tag/@talosjs/rag@1.1.2) - 2026-07-05

### Changed

- Apply biome formatting across packages| — Franck ([5da156c4](https://github.com/ooneex/talos/commit/5da156c4))

## [1.1.1](https://github.com/ooneex/talos/releases/tag/@talosjs/rag@1.1.1) - 2026-07-05

### Changed

- Revise package READMEs| — Franck ([1b72f01f](https://github.com/ooneex/talos/commit/1b72f01f))
- Update READMEs and skill docs for bun commands and workflow| — Franck ([04ad0400](https://github.com/ooneex/talos/commit/04ad0400))
- Add fmt script to package.json across packages| — Franck ([11513a2f](https://github.com/ooneex/talos/commit/11513a2f))
- Remove per-package npm:publish scripts| — Franck ([90149112](https://github.com/ooneex/talos/commit/90149112))

## [1.1.0](https://github.com/ooneex/talos/releases/tag/@talosjs/rag@1.1.0) - 2026-07-02

### Added

- Add rag package| — Franck ([8cae6b44](https://github.com/ooneex/talos/commit/8cae6b44))

## [1.2.0](https///github.com/ooneex/talos/releases/tag/@talosjs/rag@1.2.0) - 2026-08-09

### Added

- Add RAG PDF extraction with OCR fallback via OpenRouter| — Franck ([0f330c80](https///github.com/ooneex/talos/commit/0f330c80))
- Add OpenAI embedding function| — Franck ([2e0c60df](https///github.com/ooneex/talos/commit/2e0c60df))
- Add Qwen embedding function via OpenRouter| — Franck ([f0ee0864](https///github.com/ooneex/talos/commit/f0ee0864))
- Switch default embedding model to qwen3 and rename VectorDatabaseType| — Franck ([b2ad2ea9](https///github.com/ooneex/talos/commit/b2ad2ea9))

### Changed

- Drop unused deps and adopt pdf's renamed types| — Franck ([d848bbb5](https///github.com/ooneex/talos/commit/d848bbb5))
- Remove Convertor in favor of RAG| — Franck ([e69b6432](https///github.com/ooneex/talos/commit/e69b6432))
- Unify embedding functions into OpenrouterEmbeddingFunction| — Franck ([1736ecec](https///github.com/ooneex/talos/commit/1736ecec))
- Reduce complexity and clean up conventions| — Franck ([b931578f](https///github.com/ooneex/talos/commit/b931578f))
- Add explicit constructors and biome-ignore comments for Bun's coverage tool|This commit adds explicit constructors to abstract classes and utility functions — Franck ([4d33ff04](https///github.com/ooneex/talos/commit/4d33ff04))
- Raise coverage thresholds to 99% across all packages| — Franck ([14db3019](https///github.com/ooneex/talos/commit/14db3019))
- Add VectorDatabase spec| — Franck ([74053ba8](https///github.com/ooneex/talos/commit/74053ba8))
- Enable coverage thresholds in every package's bunfig.toml| — Franck ([e19e3785](https///github.com/ooneex/talos/commit/e19e3785))
- Clean up temp output directory after conversion test| — Franck ([89f6e46c](https///github.com/ooneex/talos/commit/89f6e46c))

## [1.2.1](https///github.com/ooneex/talos/releases/tag/@talosjs/rag@1.2.1) - 2026-08-30

### Changed

- Disable test coverage by default in bunfig| — Franck ([8677a826](https///github.com/ooneex/talos/commit/8677a826))
- Run package tests with parallel isolated workers| — Franck ([aee22840](https///github.com/ooneex/talos/commit/aee22840))

## [1.2.2](https///github.com/ooneex/talos/releases/tag/@talosjs/rag@1.2.2) - 2026-09-01

### Changed

- Complete LanceDB embedding mock| — Franck ([7f22ba23](https///github.com/ooneex/talos/commit/7f22ba23))


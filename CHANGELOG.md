# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-15

### Added

- `luau-web-checker/expressive-code`: an Expressive Code plugin that type-checks every Luau code block at build
  time and makes its identifiers hoverable (Twoslash for Luau). `-- error` marks an expected error, `-- ---cut---`
  hides a prelude, and any other error fails the build. Built-in tooltips, optional links per identifier, and
  `checkSnippet` for checking a block yourself. `@expressive-code/core` is an optional peer dependency.

### Changed

- The test fixtures and examples use a neutral UI API instead of a game client's.

## [0.1.1] - 2026-11-15

### Changed

- Hover, `typeAt` and completion types name their function parameters, as editors show them:
  `(width: number, height: number) -> ()` instead of `(number, number) -> ()`. Diagnostics are unchanged.

## [0.1.0] - 2026-11-15

### Added

- Luau 0.740's Analysis, the release luau-lsp 1.70.1 uses, compiled to WebAssembly with Emscripten 6.0.13. It runs
  with the new type solver and with luau-lsp's default flags.
- `Checker` with `check` (type errors, syntax errors and lints), `hovers` (every identifier's type), `typeAt` and
  `complete`.
- Definitions files, `disabledGlobals` (luau-lsp's `types.disabledGlobals`) and a `strict` default mode.
- Agreement tests: every fixture's diagnostics must equal `luau-lsp analyze`'s.

[Unreleased]: https://github.com/Braden1996/luau-web-checker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Braden1996/luau-web-checker/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Braden1996/luau-web-checker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Braden1996/luau-web-checker/releases/tag/v0.1.0

# Contributing

## Setup

1. Install [mise](https://mise.jdx.dev/), then run `mise install`. It installs every pinned tool, with checksums
   from `mise.lock`.
2. Run `mise exec -- lefthook install` to install the git hooks.
3. Run `mise exec -- moon run :check`. The first run builds the WebAssembly: emsdk installs its Emscripten release
   (about 1 GB, once), then Luau's Analysis compiles, which takes a few minutes.

`moon run :check` is the gate. CI runs it in full from a cold cache on every pull request.

## Layout

| Path                    | What                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `wasm/checker.cpp`      | The C++ wrapper over Luau's `Frontend`. It sets up the solver as luau-lsp does and returns JSON.       |
| `wasm/CMakeLists.txt`   | The Emscripten build (`-fwasm-exceptions`, embind, ES module output).                                  |
| `scripts/build-wasm.ts` | Finds the pinned emsdk and Luau through `mise where`, installs Emscripten, runs CMake into `dist/`.    |
| `src/index.ts`          | The typed TypeScript API over the embind class. It uses 1-based positions and checks every JSON entry. |
| `tests/fixtures/`       | The agreement fixtures (see `tests/agreement.test.ts`).                                                |

## Changing the checker

- **Fixtures, not snapshots.** Add a folder to `tests/fixtures/`. The tests compare its diagnostics with
  `luau-lsp analyze`, so nothing needs recording. Mark each line that must fail with `-- expect-error: <why>`.
- **Bumping Luau.** Change `http:luau-source` in `mise.toml` and `LUAU_VERSION` in `src/index.ts` to the release the
  pinned luau-lsp uses (its `luau` submodule), bump luau-lsp with them, then run `mise lock`. The agreement tests
  catch a mismatch.
- **Bumping Emscripten.** Change `http:emsdk`, then run `mise lock`.

## Pull requests

- Title: `type(scope): summary` (Conventional Commits; the `pr-title` check lists the types and scopes).
- Add a line under "Unreleased" in `CHANGELOG.md` when users will notice the change.

## Releasing

1. Move the "Unreleased" notes under a new version heading.
2. Set `version` in `package.json` to that version.
3. Tag `vX.Y.Z` and push the tag. The release workflow re-runs the gate cold, then attaches the npm tarball,
   the `.wasm` and its glue, and `SHA256SUMS`.

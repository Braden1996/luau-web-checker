# Contributing

## Setup

Install [mise](https://mise.jdx.dev/) and run `mise install`. The pinned Sergeant 0.15.0 config tarballs
must be available in the sibling `../sergeant/dist/npm/` directory. CI populates that directory from npm.

Run these commands from the repository root:

```sh
mise exec -- bun run wasm:prepare
mise exec -- sgt install
mise exec -- sgt doctor
mise exec -- sgt check
mise exec -- sgt test
mise exec -- sgt build
```

The WASM preparation step uses the pinned Emscripten release to compile Luau and stores the result in
`.build/wasm-artifacts/`. The first run downloads Emscripten and can take several minutes. Later runs reuse
the matching artifacts. Sergeant caches the WASM assets and package assembly separately from the docs build.

See the [Sergeant playbook](https://github.com/Braden1996/sergeant#readme) for workspace commands.

## Layout

- `packages/libraries/ts/dom/luau-web-checker/` contains the npm package, C++ wrapper, build scripts, and agreement tests.
- `packages/runtimes/docs/` contains the Astro and Starlight site. The site checks its Luau examples with the workspace
  package while building. Its playground uses CodeMirror and a Web Worker.
- `mise.toml` and `mise.lock` pin Luau, luau-lsp, and the build toolchain.

## Working on the checker and docs

Add agreement fixtures under the library's `tests/fixtures/`. The tests compare diagnostics with `luau-lsp analyze`.
Mark lines that must fail with `-- expect-error: <why>`.

Keep `http:luau-source` and `LUAU_VERSION` in `src/index.ts` aligned with the Luau submodule used by the pinned luau-lsp.
Update `mise.lock` when changing a tool pin, then rerun the WASM preparation step.

Run `mise exec -- sgt run docs:dev` to preview the docs. Examples live under `src/content/docs/examples/` in the docs unit.
Mark expected errors with `-- error` and hide setup above `-- ---cut---`.

## Pull requests and releases

Use a Conventional Commit title such as `fix(api): handle empty input`. Add user-visible changes under
Unreleased in [CHANGELOG.md](CHANGELOG.md).

For a release, move the notes into a version section, update the library's `package.json` version, and push a matching
`vX.Y.Z` tag. The workflow verifies the tag and attaches the npm tarball, WASM binary, JavaScript glue, and checksums.

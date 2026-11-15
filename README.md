# luau-web-checker

Luau's own type checker, compiled to WebAssembly, with the **new type solver** on. It gives you diagnostics, hover
types and completions for Luau code against your definitions files. It runs in the browser, in a Web Worker, in Node
or in Bun, with no server.

It also ships an [Expressive Code](https://expressive-code.com/) plugin that type-checks every Luau example in a docs
site at build time and makes its identifiers hoverable. It is TypeScript's
[Twoslash](https://twoslash.netlify.app/), for Luau.

**Documentation, kitchen-sink examples and a playground:** [braden1996.github.io/luau-web-checker](https://braden1996.github.io/luau-web-checker/)

It is not a reimplementation. The C++ Analysis library is the one inside
[luau-lsp](https://github.com/JohnnyMorganz/luau-lsp) and `luau-analyze`, built with Emscripten, so its answers are
luau-lsp's answers.

- **The same results as luau-lsp.** The tests run every fixture through both this build and the pinned
  `luau-lsp analyze --flag:LuauSolverV2=true`. Both must report the same diagnostics, down to line, column, kind and
  full message.
- **New solver only.** It handles `keyof`/`index` and other type functions, `Base & {}` structures, and definitions
  large enough to make the old solver give up ("Code is too complex to typecheck"). Definitions written for the new
  solver need it.
- **Checked, hoverable docs.** A code example that stops type-checking fails the docs build. Readers hover any
  identifier to see the type the checker inferred.

| Build   | Luau                                                          | Reference       | Emscripten |
| ------- | ------------------------------------------------------------- | --------------- | ---------- |
| `0.2.x` | [0.740](https://github.com/luau-lang/luau/releases/tag/0.740) | luau-lsp 1.70.1 | 6.0.13     |

## Install

Releases are attached to [GitHub releases](https://github.com/Braden1996/luau-web-checker/releases) as an npm
tarball. Install it by URL, and your lockfile records its integrity hash:

```sh
bun add https://github.com/Braden1996/luau-web-checker/releases/download/v0.2.0/luau-web-checker-0.2.0.tgz
```

The package is about 3.3 MB, almost all of it the `.wasm` file (about 1 MB compressed).

## Use

```ts
import { Checker } from "luau-web-checker";

const checker = await Checker.create({
  definitions: { "@api": "declare function greet(name: string): string\n" },
  disabledGlobals: ["os", "debug"], // luau-lsp's `types.disabledGlobals`
});

checker.setSource("main.luau", '--!strict\nlocal message = greet("Ada")\ngreet(42)\n');

checker.check("main.luau");
// [{ file: "main.luau", line: 3, column: 7, endLine: 3, endColumn: 9, kind: "TypeError",
//    message: "Expected this to be 'string', but got 'number'" }]

checker.typeAt("main.luau", { line: 2, column: 7 }); // "string"
checker.hovers("main.luau"); // every identifier: { line, column, endLine, endColumn, kind, name, type }
checker.complete("main.luau", { line: 4, column: 11 }); // completions where the cursor is

checker.dispose();
```

Positions are 1-based. A range ends one past its last column, as luau-lsp prints it.

### In the browser

The module finds `luau-checker.wasm` next to itself through `new URL(..., import.meta.url)`, which Vite and other
bundlers rewrite to the emitted asset. Run the checker in a Web Worker, because loading a large definitions file
takes a few seconds and blocks the thread it runs on. To serve the `.wasm` from somewhere else, pass its URL or its
bytes:

```ts
const checker = await Checker.create({ wasm: new URL("/assets/luau-checker.wasm", location.href), definitions });
```

## Checked, hoverable code blocks (Expressive Code)

Astro, Starlight and other sites that render code with Expressive Code can check every ` ```luau ` block at build
time:

```js
// ec.config.mjs (Starlight)
import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import { Checker } from "luau-web-checker";
import { pluginLuauTypes } from "luau-web-checker/expressive-code";

const checker = Checker.create({ definitions: { "@api": apiDefinitions }, strict: true });

export default defineEcConfig({
  plugins: [pluginLuauTypes({ checker: () => checker })],
});
```

Inside a block:

- **`-- error`** at the end of a line marks an error the example means to show. The line is underlined, and its
  message appears on hover. Any other error fails the build, as does a marked line with no error.
- **`-- ---cut---`** hides the lines above it. They are still checked, so a block can set up the locals it uses
  without showing them.
- **` ```luau nocheck `** skips a block. A block with a top-level `declare` is a definitions file and is shown as
  written.

Hovering an identifier shows its type, and a type function shows what it resolves to: the `Handler` in
`local h: Handler<"resize">` shows `(width: number, height: number) -> ()`. Pass `link` to turn identifiers into
links, such as to an API reference, and `tooltips: false` to render the cards yourself from the `data-luau-type` and
`data-luau-error` attributes.

## API

| Member                                           | What it does                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Checker.create(options?)`                       | Loads the module and the definitions. Throws `DefinitionsError` (with `.diagnostics`) when a definitions file has errors.                                                                            |
| `options.definitions`                            | `{ "@name": source }`, loaded in order: the `--definitions=@name=file` of luau-lsp.                                                                                                                  |
| `options.disabledGlobals`                        | Globals (`os`) or library members (`table.clone`) to remove, as luau-lsp's `types.disabledGlobals` does. Names that match nothing are listed in `checker.unknownGlobals`, where luau-lsp would warn. |
| `options.strict`                                 | Treat modules without a `--!strict` or `--!nonstrict` comment as strict. The default is nonstrict, like luau-lsp.                                                                                    |
| `options.wasm`                                   | The `.wasm` URL or bytes. Without it, every checker shares one instance of the module.                                                                                                               |
| `setSource(name, source)` / `removeSource(name)` | Adds, replaces or removes a module.                                                                                                                                                                  |
| `check(name)`                                    | Type errors, syntax errors and lint warnings, sorted by position.                                                                                                                                    |
| `hovers(name)`                                   | Every identifier with its type, in source order (call after `check`).                                                                                                                                |
| `typeAt(name, position)`                         | The hover type at a position, or `undefined`.                                                                                                                                                        |
| `complete(name, position)`                       | Completions at a position.                                                                                                                                                                           |
| `dispose()`                                      | Frees the checker's memory.                                                                                                                                                                          |
| `LUAU_VERSION`                                   | The Luau release compiled in.                                                                                                                                                                        |
| `loadModule(wasm?)`                              | The raw Emscripten module, for advanced use.                                                                                                                                                         |

`luau-web-checker/expressive-code` exports `pluginLuauTypes`, and also `checkSnippet` for checking a block yourself.

## Limits

- **No `require`.** Modules cannot import each other, because there is no module resolution. Code that shares
  globals and types through a definitions file works.
- **No `.luaurc`.** The mode comes from each module's comment or from `strict`. Lint settings are Luau's defaults.
- **Startup cost.** A 1.7 MB definitions file loads in about 4 seconds. After that, each check takes milliseconds.
- **Types are shown as the solver has them.** Luau 0.740 sometimes leaves a union unsimplified (`(T | T)?`), and the
  checker does not rewrite it.

## Projects using it

- [wow-forever-luau-types](https://github.com/Braden1996/wow-forever-luau-types): strict Luau definitions for a game
  client's API. Its docs check every example against a 1.7 MB definitions file, and link hovered API names to its
  reference.
- [luau-true-myth](https://github.com/Braden1996/luau-true-myth): `Maybe`, `Result` and `Task` for strict Luau. Its
  docs show the inferred types of its examples.

## Why not `@luau-rs/luau`?

[luau-rs](https://github.com/luau-rs/luau) is a Rust port of Luau, and its WebAssembly build is the other way to check
Luau in a browser. Its analysis only ports the new solver. As of 0.739, loading a large new-solver definitions file
(1.7 MB, with `keyof`/`index` and intersections) fails with "Code is too complex to typecheck", which Luau's own C++
does not report at the same version. This package compiles that C++ instead, so its results match luau-lsp exactly.

## Building

Everything is pinned in `mise.toml`: the Luau source, emsdk, Python (which emsdk runs), CMake, Ninja, Bun and the
reference luau-lsp. It builds on Windows, Linux and macOS.

```sh
mise install
mise exec -- moon run :check   # builds the WebAssembly (a few minutes cold), then every check
```

The first build installs the Emscripten release into emsdk's mise folder (about 1 GB). See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). The WebAssembly contains [Luau](https://github.com/luau-lang/luau) (MIT, © Roblox Corporation and
Lua.org, PUC-Rio). Its licence ships with the package as `dist/LICENSE-luau.txt`.

# luau-web-checker

Luau's own type checker, compiled to WebAssembly, with the **new type solver** on. It gives you diagnostics, hover
types and completions for Luau code against your definitions files. It runs in the browser, in a Web Worker, in Node
or in Bun, with no server.

It is not a reimplementation. The C++ Analysis library is the one inside
[luau-lsp](https://github.com/JohnnyMorganz/luau-lsp) and `luau-analyze`, built with Emscripten, so its answers are
luau-lsp's answers.

- **The same results as luau-lsp.** The tests run every fixture through both this build and the pinned
  `luau-lsp analyze --flag:LuauSolverV2=true`. Both must report the same diagnostics, down to line, column, kind and
  full message.
- **New solver only.** It handles `keyof`/`index` and other type functions, `Base & {}` structures, and definitions
  large enough to make the old solver give up ("Code is too complex to typecheck"). Definitions written for the new
  solver need it.
- **Hover data for static sites.** `hovers()` returns every identifier in a module with its type in one call. A docs
  site can bake that into its code samples at build time, the way TypeScript's
  [Twoslash](https://twoslash.netlify.app/) does.

| Build   | Luau                                                          | Reference       | Emscripten |
| ------- | ------------------------------------------------------------- | --------------- | ---------- |
| `0.1.x` | [0.740](https://github.com/luau-lang/luau/releases/tag/0.740) | luau-lsp 1.70.1 | 6.0.13     |

## Install

Releases are attached to [GitHub releases](https://github.com/Braden1996/luau-web-checker/releases) as an npm
tarball. Install it by URL; your lockfile records its integrity hash:

```sh
bun add https://github.com/Braden1996/luau-web-checker/releases/download/v0.1.1/luau-web-checker-0.1.1.tgz
```

The package is about 3.3 MB, almost all of it the `.wasm` file (about 1 MB compressed).

## Use

```ts
import { Checker } from "luau-web-checker";

const checker = await Checker.create({
  definitions: { "@wow": await Bun.file("wow-forever.d.luau").text() },
  disabledGlobals: ["os", "debug", "table.clone"], // luau-lsp's `types.disabledGlobals`
});

checker.setSource("main.luau", '--!strict\nlocal f = CreateFrame("Button")\nf:SetText(1)\n');

checker.check("main.luau");
// [{ file: "main.luau", line: 3, column: 11, endLine: 3, endColumn: 12, kind: "TypeError",
//    message: "Expected this to be 'string?', but got 'number'" }]

checker.typeAt("main.luau", { line: 2, column: 7 }); // "Button"
checker.complete("main.luau", { line: 3, column: 5 }); // [{ label: "SetText", kind: "property", ... }, ...]
checker.hovers("main.luau"); // every identifier: { line, column, endLine, endColumn, kind, name, type }

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

### Build-time hovers (Twoslash for Luau)

```ts
checker.setSource("example.luau", code);
const errors = checker.check("example.luau"); // fail the docs build on an example that does not type-check
for (const hover of checker.hovers("example.luau")) {
  // hover.kind: "local" | "global" | "property" | "type"
  // wrap code[hover.line, hover.column .. hover.endColumn] in a tooltip showing hover.type
}
```

A type name in an annotation shows what it resolves to. For example, with `type EventHandler<E> = index<Events, E>`,
the `EventHandler` in `local h: EventHandler<"PLAYER_LOGIN">` shows the handler's function type.

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

## Limits

- **No `require`.** Modules cannot import each other, because there is no module resolution. A multi-file addon that
  shares state through a definitions file, as WoW addons do, works.
- **No `.luaurc`.** The mode comes from each module's comment or from `strict`. Lint settings are Luau's defaults.
- **Startup cost.** A 1.7 MB definitions file loads in about 4 seconds. After that, each check takes milliseconds.
- **Types are shown as the solver has them.** Luau 0.740 sometimes leaves a union unsimplified (`(T | T)?`), and the
  checker does not rewrite it.

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

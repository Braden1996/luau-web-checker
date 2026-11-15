---
title: Usage
description: Create a checker, give it definitions and modules, and ask for diagnostics, types and completions.
---

```ts
import { Checker } from "luau-web-checker";

const checker = await Checker.create({
  definitions: { "@api": "declare function greet(name: string): string\n" },
  disabledGlobals: ["os", "debug"],
  strict: true,
});

checker.setSource("main.luau", 'local message = greet("Ada")\ngreet(42)\n');

checker.check("main.luau");
// [{ file: "main.luau", line: 2, column: 7, endLine: 2, endColumn: 9, kind: "TypeError",
//    message: "Expected this to be 'string', but got 'number'" }]

checker.typeAt("main.luau", { line: 1, column: 7 }); // "string"
checker.hovers("main.luau"); // [{ kind: "local", name: "message", type: "string", line: 1, column: 7, ... }, ...]

checker.dispose();
```

## Options

- **`definitions`**: definitions files by package name, loaded in order. These are luau-lsp's
  `--definitions=@name=file`. A file with errors throws a `DefinitionsError`, which carries the diagnostics.
- **`disabledGlobals`**: luau-lsp's `types.disabledGlobals`. It removes whole globals (`os`) or library members
  (`table.clone`). Names that match nothing are listed in `checker.unknownGlobals`.
- **`aliases`**: `.luaurc` aliases for `require`, such as `{ "@pkg": "vendor/pkg/src" }`.
- **`strict`**: the mode for modules with no `--!strict` or `--!nonstrict` comment. The default is nonstrict, as in
  luau-lsp.
- **`wasm`**: where the `.wasm` comes from, as a URL or bytes. See [in the browser](/luau-web-checker/guides/browser/).

## Results

Positions are **1-based**, and a range ends one past its last column, as luau-lsp prints them.

- **`check(name)`** returns type errors, syntax errors and lint warnings, sorted by position. `kind` is `TypeError`,
  `SyntaxError`, or a lint name such as `LocalUnused`. `message` is exactly what luau-lsp prints.
- **`hovers(name)`** returns every identifier with the type the solver gave it. `kind` is `local`, `global`,
  `property` or `type`. Function types name their parameters: `(width: number, height: number) -> ()`.
- **`typeAt(name, position)`** returns the hover type at one position.
- **`complete(name, position)`** returns completions: `{ label, kind, type?, deprecated }`.

Call `check` before `hovers` or `typeAt`. Loading definitions is the slow part: a 1.7 MB file takes about four
seconds. So create one checker and reuse it for every module.

## Modules and `require`

A module's name is its path. `require` finds other modules by Luau's require-by-string rules: `./` and `../`
relative to the requiring module, and `@alias/` through `aliases`. Nothing is read from disk, so add every module
the code needs:

```ts
const checker = await Checker.create({ aliases: { "@lib": "vendor/lib" } });
checker.setSource("vendor/lib/Maths.luau", "local M = {}\nfunction M.twice(n: number) return n * 2 end\nreturn M\n");
checker.setSource("src/main.luau", 'local Maths = require("@lib/Maths")\nprint(Maths.twice(21))\n');
checker.check("src/main.luau"); // []
```

`check(name)` reports that module's own errors. Check each module to see all of them.

---
title: Agreement with luau-lsp
description: How the tests keep this checker's answers identical to luau-lsp's.
---

A checker in the browser is only useful if it says what your editor says. luau-web-checker is held to that.

## Same code, same set-up

- **The same Luau.** The WebAssembly is built from the Luau source tag that the pinned luau-lsp uses (0.740 for
  luau-lsp 1.70.1). Both are pinned in the repository's `mise.toml`, side by side.
- **The same configuration.** `luau-lsp analyze` turns on every non-experimental `Luau*` flag, then the new solver
  (`LuauSolverV2`), registers the builtin globals, loads each definitions file, and removes the disabled globals.
  The checker does the same things in the same order.
- **The same messages.** Errors are formatted by Luau's own `toString`, so the text matches luau-lsp's, character for
  character.

## Tested on every change

The repository's tests run each fixture in `tests/fixtures/` through both the WebAssembly build and the real
`luau-lsp analyze`, and compare the diagnostics exactly: line, column, kind and message.

The fixtures cover:

- type errors, syntax errors and lint warnings;
- strict and nonstrict modules;
- disabled globals and library members;
- an API with extern types, `keyof`/`index` type functions and `Base & {}` structures.

A fixture also marks the lines that must fail with `-- expect-error`. So it cannot pass by both tools reporting
nothing.

Projects that use the checker can add the same kind of test for their own definitions.
[wow-forever-luau-types](https://github.com/Braden1996/wow-forever-luau-types) runs the checker over its own sample
code and expected-failure files on every pull request.

## Known differences

There are none in diagnostics. Where the checker and luau-lsp differ, it is in what luau-lsp does around the checker:

- **Module resolution.** `require` is not resolved.
- **`.luaurc`.** Configuration files are not read. The mode comes from each module's comment or the `strict` option.
- **Hover text.** Hover strings come from Luau's `toString`, with parameter names. luau-lsp's hover adds Markdown and
  documentation around the same type.

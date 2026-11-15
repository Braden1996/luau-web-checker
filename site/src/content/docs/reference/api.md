---
title: API
description: Every export of luau-web-checker and luau-web-checker/expressive-code.
---

## `luau-web-checker`

| Export                                           | What it does                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Checker.create(options?)`                       | Loads the module and the definitions. Throws `DefinitionsError` (with `.diagnostics`) when a definitions file has errors. |
| `options.definitions`                            | `{ "@name": source }`, loaded in order.                                                                                   |
| `options.disabledGlobals`                        | Globals or library members to remove. Names that match nothing end up in `checker.unknownGlobals`.                        |
| `options.strict`                                 | Strict mode for modules without a mode comment (default `false`, as in luau-lsp).                                         |
| `options.wasm`                                   | The `.wasm` URL or bytes. Without it, every checker shares one instance of the module.                                    |
| `setSource(name, source)` / `removeSource(name)` | Adds, replaces or removes a module.                                                                                       |
| `check(name)`                                    | `Diagnostic[]`: type errors, syntax errors and lint warnings, sorted by position.                                         |
| `hovers(name)`                                   | `Hover[]`: every identifier with its type, in source order.                                                               |
| `typeAt(name, position)`                         | The hover type at a position, or `undefined`.                                                                             |
| `complete(name, position)`                       | `Completion[]` at a position.                                                                                             |
| `dispose()`                                      | Frees the checker's memory.                                                                                               |
| `LUAU_VERSION`                                   | The Luau release compiled in (`"0.740"`).                                                                                 |
| `loadModule(wasm?)`                              | The raw Emscripten module.                                                                                                |

```ts
interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  kind: string; // "TypeError", "SyntaxError", or a lint name
  message: string;
}

interface Hover {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  kind: "local" | "global" | "property" | "type";
  name: string;
  type: string;
}

interface Completion {
  label: string;
  kind: "property" | "binding" | "keyword" | "string" | "type" | "other";
  type?: string;
  deprecated: boolean;
}
```

## `luau-web-checker/expressive-code`

| Export                              | What it does                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pluginLuauTypes(options)`          | The Expressive Code plugin. See [checked docs](/luau-web-checker/guides/checked-docs/).               |
| `checkSnippet(checker, name, code)` | Checks one block under the same rules. Returns `{ hidden, errors, hovers }` or throws `SnippetError`. |
| `hoverLabel(hover)`                 | The text a hover shows: `local x: number`, `.field: string`, `type Alias = ...`.                      |
| `isTrivialHover(hover)`             | `true` for a builtin type name (`number`), whose hover would only repeat it.                          |
| `isDefinitionsFile(code)`           | `true` when a block has a top-level `declare`.                                                        |
| `CUT`                               | `"-- ---cut---"`.                                                                                     |

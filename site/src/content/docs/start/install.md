---
title: Install
description: Add luau-web-checker to a project from its GitHub release.
---

Each release is attached to [GitHub releases](https://github.com/Braden1996/luau-web-checker/releases) as an npm
tarball. Install it by URL. Your lockfile records the tarball's integrity hash, so the install is pinned:

```sh
bun add https://github.com/Braden1996/luau-web-checker/releases/download/v0.2.0/luau-web-checker-0.2.0.tgz
```

npm, pnpm and Yarn accept the same URL.

## What you get

| Import                               | What it is                                                               |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `luau-web-checker`                   | `Checker`: diagnostics, hover types and completions for Luau source.     |
| `luau-web-checker/expressive-code`   | `pluginLuauTypes`: checked, hoverable ` ```luau ` blocks for docs sites. |
| `luau-web-checker/luau-checker.wasm` | The WebAssembly file, for bundlers that need to copy it explicitly.      |

The package is about 3.3 MB, almost all of it the `.wasm` file, which compresses to about 1 MB. The Expressive Code
plugin needs `@expressive-code/core`, which Astro and Starlight already install.

## Requirements

- **Node 22 or later, or Bun.** Browsers need WebAssembly exception handling, which every current browser supports.
- **Definitions written for the new solver.** The checker always runs Luau's new type solver, as
  `luau-lsp --flag:LuauSolverV2=true` does.

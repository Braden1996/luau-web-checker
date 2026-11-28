---
title: In the browser
description: Run the checker client-side in a Web Worker, as the playground does.
---

The checker is plain WebAssembly with an ES module wrapper, so it runs in any current browser. Load it in a **Web
Worker**: compiling the module and loading definitions take long enough to freeze a page if they run on its main
thread.

```ts
// checker.worker.ts
import { Checker } from "luau-web-checker";

const ready = Checker.create({ definitions: { "@api": await (await fetch("/api.d.luau")).text() } });

self.onmessage = async (event: MessageEvent<{ source: string }>) => {
  const checker = await ready;
  checker.setSource("main.luau", event.data.source);
  self.postMessage({ diagnostics: checker.check("main.luau"), hovers: checker.hovers("main.luau") });
};
```

```ts
// main thread
const worker = new Worker(new URL("./checker.worker.ts", import.meta.url), { type: "module" });
```

The [playground](/luau-web-checker/playground/) is built this way. Its source is in
[`site/src/components/playground/`](https://github.com/Braden1996/luau-web-checker/tree/main/site/src/components/playground).

## Finding the `.wasm`

The module looks for `luau-checker.wasm` next to itself through `new URL("luau-checker.wasm", import.meta.url)`.
Vite, Rollup, webpack 5 and esbuild all recognise that pattern, so they copy the file and rewrite the URL.

With Vite, exclude the package from dependency pre-bundling. Otherwise the dev server moves the module away from its
`.wasm`:

```ts
// vite.config.ts (or astro.config.ts under `vite`)
export default { optimizeDeps: { exclude: ["luau-web-checker"] }, worker: { format: "es" } };
```

To serve the file yourself, pass its URL or bytes:

```ts
const checker = await Checker.create({ wasm: new URL("/static/luau-checker.wasm", location.href) });
```

## Cost

- The `.wasm` is 3.2 MB, and about 1 MB with gzip or Brotli. Browsers cache it like any other asset.
- The module instantiates in a few hundred milliseconds.
- Definitions load in proportion to their size. A small API is instant, and a 1.7 MB file takes about four seconds.
- After that, checking a page of code takes milliseconds.

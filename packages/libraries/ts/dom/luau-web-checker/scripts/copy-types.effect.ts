import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { wasmInputDigest } from "./wasm-inputs.ts";

const unit = resolve(import.meta.dir, "..");
const root = resolve(unit, "../../../../..");
const out = process.env["SGT_OUT"];
if (out === undefined) {
  throw new Error("Run this script through Sergeant.");
}

const wasmAssets = ["luau-checker.mjs", "luau-checker.wasm", "LICENSE-luau.txt"];
mkdirSync(out, { recursive: true });
switch (process.argv[2]) {
  case "wasm": {
    const assets = join(root, ".build", "wasm-artifacts");
    if (readFileSync(join(assets, "inputs.sha256"), "utf8").trim() !== wasmInputDigest(root, unit)) {
      throw new Error("WASM inputs changed. Run bun run wasm:prepare before running Sergeant.");
    }
    for (const file of wasmAssets) {
      copyFileSync(join(assets, file), join(out, file));
    }
    copyFileSync(join(unit, "types", "luau-checker.d.mts"), join(out, "luau-checker.d.mts"));
    break;
  }
  case "dist": {
    const compiler = Bun.resolveSync("@typescript/native/package.json", unit);
    const result = Bun.spawnSync(
      [
        "node",
        resolve(compiler, "..", "bin", "tsc"),
        "-p",
        "tsconfig.src.json",
        "--noEmit",
        "false",
        "--module",
        "ESNext",
        "--allowImportingTsExtensions",
        "false",
        "--rootDir",
        "src",
        "--outDir",
        out,
      ],
      { cwd: unit, stdout: "inherit", stderr: "inherit" },
    );
    if (!result.success) {
      throw new Error(`TypeScript emit exited with ${String(result.exitCode)}`);
    }
    for (const file of [...wasmAssets, "luau-checker.d.mts"]) {
      copyFileSync(join(root, ".sergeant", "out", "wasm-assets", file), join(out, file));
    }
    break;
  }
  case undefined:
  default:
    throw new Error("Expected a wasm or dist task.");
}

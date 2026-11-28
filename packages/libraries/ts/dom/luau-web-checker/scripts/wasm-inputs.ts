import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function wasmInputDigest(root: string, unit: string): string {
  const hash = createHash("sha256");
  for (const input of [
    join(unit, "wasm", "checker.cpp"),
    join(unit, "wasm", "CMakeLists.txt"),
    join(root, "mise.toml"),
    join(root, "mise.lock"),
    join(unit, "scripts", "build-wasm.effect.ts"),
    join(unit, "scripts", "wasm-inputs.ts"),
  ]) {
    hash.update(createHash("sha256").update(readFileSync(input)).digest());
  }
  return hash.digest("hex");
}

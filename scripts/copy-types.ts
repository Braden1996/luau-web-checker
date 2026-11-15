// tsc does not copy hand-written declaration files: put the WebAssembly module's types next to the module in dist/.
import { copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
copyFileSync(join(root, "src", "luau-checker.d.mts"), join(root, "dist", "luau-checker.d.mts"));

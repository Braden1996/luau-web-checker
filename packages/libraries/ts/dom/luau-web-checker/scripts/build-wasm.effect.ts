import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, join, resolve } from "node:path";

import { wasmInputDigest } from "./wasm-inputs.ts";

const unit = resolve(import.meta.dir, "..");
const root = resolve(unit, "../../../../..");
const buildDir = join(root, ".build", "wasm");
const artifacts = join(root, ".build", "wasm-artifacts");
const stamp = join(artifacts, "inputs.sha256");
const files = ["luau-checker.mjs", "luau-checker.wasm", "LICENSE-luau.txt"];
const key = wasmInputDigest(root, unit);

function run(command: string[], env: NodeJS.ProcessEnv = process.env, capture = false): string {
  const result = Bun.spawnSync(command, {
    cwd: root,
    env,
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  if (!result.success) {
    throw new Error(`${command.join(" ")} exited with ${String(result.exitCode)}`);
  }
  return result.stdout?.toString().trim() ?? "";
}

function compile(): void {
  const where = (tool: string): string => run(["mise", "where", tool], process.env, true);
  const emsdk = where("http:emsdk");
  const luau = where("http:luau-source");
  const python = Bun.which("python3") ?? Bun.which("python");
  if (python === null) {
    throw new Error("Python is missing. Run mise install first.");
  }

  const emsdkVersion = basename(emsdk);
  const sdkEnv = { ...process.env, EMSDK_PYTHON: python };
  const sdkScript = join(emsdk, "emsdk.py");
  run([python, sdkScript, "install", emsdkVersion], sdkEnv);
  run([python, sdkScript, "activate", emsdkVersion], sdkEnv);

  const emscripten = join(emsdk, "upstream", "emscripten");
  const env = {
    ...sdkEnv,
    EMSDK: emsdk,
    EM_CONFIG: join(emsdk, ".emscripten"),
    PATH: [emscripten, process.env["PATH"] ?? ""].join(delimiter),
  };
  const output = join(buildDir, `luau-${basename(luau)}-emsdk-${emsdkVersion}`);
  run(
    [
      python,
      join(emscripten, "emcmake.py"),
      "cmake",
      "-S",
      join(unit, "wasm"),
      "-B",
      output,
      "-G",
      "Ninja",
      "-DCMAKE_BUILD_TYPE=Release",
      `-DLUAU_SOURCE_DIR=${luau}`,
    ],
    env,
  );
  run(["cmake", "--build", output, "--target", "luau-checker"], env);

  mkdirSync(artifacts, { recursive: true });
  copyFileSync(join(output, "luau-checker.mjs"), join(artifacts, "luau-checker.mjs"));
  copyFileSync(join(output, "luau-checker.wasm"), join(artifacts, "luau-checker.wasm"));
  copyFileSync(join(luau, "LICENSE.txt"), join(artifacts, "LICENSE-luau.txt"));
}

if (
  existsSync(stamp) &&
  readFileSync(stamp, "utf8").trim() === key &&
  files.every((file) => existsSync(join(artifacts, file)))
) {
  console.log("Reused the Luau WASM build.");
} else {
  rmSync(stamp, { force: true });
  compile();
  writeFileSync(stamp, `${key}\n`);
}

// Builds dist/luau-checker.{mjs,wasm}: Luau's Analysis (mise's http:luau-source) plus wasm/checker.cpp, compiled by
// the Emscripten release that mise pins (http:emsdk). Every tool comes from mise.toml, so this runs the same on
// Windows, Linux and macOS. The first run installs that Emscripten release into emsdk's folder (about 1 GB).

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, delimiter, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const buildDir = join(root, ".build", "wasm");
const distDir = join(root, "dist");

function run(command: string[], env?: Record<string, string | undefined>): string {
  const result = Bun.spawnSync(command, { cwd: root, env: env ?? process.env, stdout: "pipe", stderr: "inherit" });
  const out = result.stdout.toString();
  if (!result.success) {
    process.stdout.write(out);
    throw new Error(`${command.join(" ")} exited with ${String(result.exitCode)}`);
  }
  return out;
}

function stream(command: string[], env: Record<string, string | undefined>): void {
  const result = Bun.spawnSync(command, { cwd: root, env, stdout: "inherit", stderr: "inherit" });
  if (!result.success) {
    throw new Error(`${command.join(" ")} exited with ${String(result.exitCode)}`);
  }
}

const where = (tool: string): string => run(["mise", "where", tool]).trim();

const python = Bun.which("python3") ?? Bun.which("python");
if (python === null) {
  throw new Error("python is not on PATH: run through mise (`mise exec -- bun run build:wasm`)");
}
const emsdk = where("http:emsdk");
const luau = where("http:luau-source");
const emsdkVersion = basename(emsdk);

// `emsdk install` is a no-op once the release is present; `activate` writes emsdk's .emscripten config.
const emsdkEnv = { ...process.env, EMSDK_PYTHON: python };
stream([python, join(emsdk, "emsdk.py"), "install", emsdkVersion], emsdkEnv);
stream([python, join(emsdk, "emsdk.py"), "activate", emsdkVersion], emsdkEnv);

const emscripten = join(emsdk, "upstream", "emscripten");
const env = {
  ...process.env,
  EMSDK: emsdk,
  EMSDK_PYTHON: python,
  EM_CONFIG: join(emsdk, ".emscripten"),
  PATH: [emscripten, process.env["PATH"] ?? ""].join(delimiter),
};

stream(
  [
    python,
    join(emscripten, "emcmake.py"),
    "cmake",
    "-S",
    join(root, "wasm"),
    "-B",
    buildDir,
    "-G",
    "Ninja",
    "-DCMAKE_BUILD_TYPE=Release",
    `-DLUAU_SOURCE_DIR=${luau}`,
  ],
  env,
);
stream(["cmake", "--build", buildDir, "--target", "luau-checker"], env);

mkdirSync(distDir, { recursive: true });
for (const file of ["luau-checker.mjs", "luau-checker.wasm"]) {
  copyFileSync(join(buildDir, file), join(distDir, file));
}
// The WebAssembly contains Luau, so its licence travels with it.
const luauLicence = join(luau, "LICENSE.txt");
if (!existsSync(luauLicence)) {
  throw new Error(`Luau's licence is missing: ${luauLicence}`);
}
copyFileSync(luauLicence, join(distDir, "LICENSE-luau.txt"));
console.log(`built dist/luau-checker.wasm with Luau ${basename(luau)} and Emscripten ${emsdkVersion}`);

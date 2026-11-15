// Checks the npm tarball (what the release attaches and consumers install) against the files the package needs:
// the JavaScript and its declarations (the checker and the Expressive Code plugin), the WebAssembly and its glue, the
// readme and both licences.

const expected = [
  "LICENSE",
  "README.md",
  "package.json",
  "dist/LICENSE-luau.txt",
  "dist/expressive-code.d.ts",
  "dist/expressive-code.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/pretty.d.ts",
  "dist/pretty.js",
  "dist/snippets.d.ts",
  "dist/snippets.js",
  "dist/styles.d.ts",
  "dist/styles.js",
  "dist/tooltips.d.ts",
  "dist/tooltips.js",
  "dist/luau-checker.d.mts",
  "dist/luau-checker.mjs",
  "dist/luau-checker.wasm",
].toSorted();

const result = Bun.spawnSync(["bun", "pm", "pack", "--dry-run", "--ignore-scripts"], {
  stdout: "pipe",
  stderr: "pipe",
});
if (!result.success) {
  throw new Error(`bun pm pack failed: ${result.stderr.toString()}`);
}
const output = result.stdout.toString().replaceAll(String.fromCodePoint(13), "");
const packed = [...output.matchAll(/^packed\s+\S+\s+(\S+)$/gmu)].map((match) => match[1] ?? "").toSorted();
const missing = expected.filter((file) => !packed.includes(file));
const extra = packed.filter((file) => !expected.includes(file));
if (missing.length > 0 || extra.length > 0) {
  console.error(output);
  throw new Error(`tarball contents differ. Missing: [${missing.join(", ")}]. Unexpected: [${extra.join(", ")}]`);
}
console.log(`ok: the tarball holds the ${String(packed.length)} expected files`);

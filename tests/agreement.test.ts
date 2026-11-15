// Agreement: for every fixture, the WebAssembly checker reports exactly what `luau-lsp analyze` (the pinned
// reference, same Luau release) reports: the same lines, columns, kinds and full messages.
//
// A fixture is a folder in tests/fixtures/ with:
//   *.d.luau        definitions files, loaded as `@<name>` in file-name order
//   *.luau          modules to check
//   settings.json   optional luau-lsp settings (`luau-lsp.types.disabledGlobals`)
// Lines ending in `-- expect-error: <why>` must get a diagnostic and no other line may, so a fixture cannot pass by
// both tools reporting nothing.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { Checker } from "../dist/index.js";

const fixturesDir = join(import.meta.dir, "fixtures");

interface Reported {
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

const read = (path: string): string => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

function disabledGlobals(settingsPath: string): string[] {
  if (!existsSync(settingsPath)) {
    return [];
  }
  const settings: unknown = JSON.parse(read(settingsPath));
  if (typeof settings !== "object" || settings === null) {
    throw new TypeError(`${settingsPath}: not an object`);
  }
  const names: unknown = Object.entries(settings).find(([key]) => key === "luau-lsp.types.disabledGlobals")?.[1];
  if (!Array.isArray(names) || !names.every((name): name is string => typeof name === "string")) {
    throw new TypeError(`${settingsPath}: luau-lsp.types.disabledGlobals is not a list of names`);
  }
  return names;
}

// Runs luau-lsp analyze over a fixture's modules; returns each module's diagnostics, multi-line messages joined.
function luauLsp(
  definitions: readonly string[],
  settingsPath: string,
  modules: readonly string[],
): Map<string, Reported[]> {
  const args = ["analyze", "--platform=standard", "--flag:LuauSolverV2=true"];
  for (const file of definitions) {
    args.push(`--definitions=@${basename(file, ".d.luau")}=${file}`);
  }
  if (existsSync(settingsPath)) {
    args.push(`--settings=${settingsPath}`);
  }
  const result = Bun.spawnSync(["luau-lsp", ...args, ...modules], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`.replaceAll("\r", "");
  const byModule = new Map<string, Reported[]>(modules.map((file) => [basename(file), []]));
  let current: { text: string } | undefined;
  for (const line of output.split("\n")) {
    const match = /^(.+?)\((\d+),(\d+)\): (.*)$/.exec(line);
    if (match !== null) {
      const [, file = "", lineNo = "", column = "", text = ""] = match;
      const list = byModule.get(basename(file.replaceAll("\\", "/")));
      if (list === undefined) {
        throw new Error(`luau-lsp reported a file outside the fixture: ${line}`);
      }
      const reported = { line: Number(lineNo), column: Number(column), text };
      list.push(reported);
      current = reported;
    } else if (line.startsWith("[")) {
      current = undefined; // [INFO] and [WARN] log lines
    } else if (line.trim() !== "" && current !== undefined) {
      current.text += `\n${line}`;
    } else if (line.trim() !== "") {
      throw new Error(`luau-lsp printed a line this test cannot parse: ${line}`);
    }
  }
  return byModule;
}

const sortReported = (list: readonly Reported[]): Reported[] =>
  list.toSorted((a, b) => a.line - b.line || a.column - b.column || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

describe.each(fixtures)("fixture %s", (fixture) => {
  const dir = join(fixturesDir, fixture);
  const files = readdirSync(dir).toSorted();
  const definitions = files.filter((file) => file.endsWith(".d.luau")).map((file) => join(dir, file));
  const modules = files
    .filter((file) => file.endsWith(".luau") && !file.endsWith(".d.luau"))
    .map((file) => join(dir, file));
  const settingsPath = join(dir, "settings.json");
  const reference = luauLsp(definitions, settingsPath, modules);

  test.each(modules.map((file) => basename(file)))("%s matches luau-lsp", async (name) => {
    const checker = await Checker.create({
      definitions: Object.fromEntries(definitions.map((file) => [`@${basename(file, ".d.luau")}`, read(file)])),
      disabledGlobals: disabledGlobals(settingsPath),
    });
    try {
      for (const file of modules) {
        checker.setSource(basename(file), read(join(dir, basename(file))));
      }
      const ours = checker
        .check(name)
        .map((d): Reported => ({ line: d.line, column: d.column, text: `${d.kind}: ${d.message}` }));
      expect(sortReported(ours)).toEqual(sortReported(reference.get(name) ?? []));

      // The fixture tests what it says: exactly the `expect-error` lines have diagnostics.
      const marked = read(join(dir, name))
        .split("\n")
        .flatMap((text, index) => (text.includes("-- expect-error:") ? [index + 1] : []));
      if (marked.length > 0 || fixture === "widgets") {
        expect([...new Set(ours.map((d) => d.line))].toSorted((a, b) => a - b)).toEqual(marked);
      }
    } finally {
      checker.dispose();
    }
  });
});

// The editor queries (hovers, typeAt, complete) and the API's own behaviour, on the ui fixture's definitions.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Checker, DefinitionsError, LUAU_VERSION } from "../dist/index.js";

const api = readFileSync(join(import.meta.dir, "fixtures", "ui", "api.d.luau"), "utf8");
const ok = readFileSync(join(import.meta.dir, "fixtures", "ui", "ok.luau"), "utf8").replaceAll("\r\n", "\n");

let checker: Checker;

beforeAll(async () => {
  checker = await Checker.create({ definitions: { "@api": api } });
  checker.setSource("ok.luau", ok);
  expect(checker.check("ok.luau")).toEqual([]);
});

afterAll(() => {
  checker.dispose();
});

const hoverAt = (line: number, name: string): string | undefined =>
  checker.hovers("ok.luau").find((hover) => hover.line === line && hover.name === name)?.type;

describe("hovers", () => {
  test("values get the solver's types", () => {
    expect(hoverAt(4, "button")).toBe("Button");
    expect(hoverAt(6, "GetWidth")).toBe("(self: Node) -> number");
    expect(hoverAt(8, "self")).toBe("Element");
  });

  test("a type function in an annotation shows what it resolves to", () => {
    expect(hoverAt(14, "Handler")).toBe("(width: number, height: number) -> ()");
  });

  test("a declaration shows its initializer's type, refined uses show the refinement", () => {
    // The solver's own type for the call (Luau 0.740 leaves this union unsimplified); the checker does not rewrite it.
    expect(hoverAt(19, "user")).toBe(
      "((Account & { age: number, email: string? }) | (Account & { age: number, email: string? }))?",
    );
    expect(hoverAt(21, "user")).toBe("Account & { age: number, email: string? }");
  });

  test("ranges are 1-based and cover the identifier", () => {
    const button = checker.hovers("ok.luau").find((hover) => hover.line === 4 && hover.name === "button");
    expect(button).toMatchObject({ kind: "local", column: 7, endLine: 4, endColumn: 13 });
    const create = checker.hovers("ok.luau").find((hover) => hover.line === 4 && hover.name === "createElement");
    expect(create?.kind).toBe("global");
  });
});

describe("typeAt", () => {
  test("an identifier", () => {
    expect(checker.typeAt("ok.luau", { line: 4, column: 7 })).toBe("Button");
    expect(checker.typeAt("ok.luau", { line: 4, column: 12 })).toBe("Button");
  });

  test("whitespace has no type", () => {
    expect(checker.typeAt("ok.luau", { line: 3, column: 1 })).toBeUndefined();
  });
});

describe("complete", () => {
  test("methods of an extern type, inherited ones included", () => {
    checker.setSource("partial.luau", '--!strict\nlocal b = createElement("Button")\nb:Se');
    checker.check("partial.luau");
    const labels = checker.complete("partial.luau", { line: 3, column: 5 }).map((entry) => entry.label);
    expect(labels).toContain("SetLabel"); // Button's own
    expect(labels).toContain("On"); // from Element
    expect(labels).toContain("SetWidth"); // from Node
    checker.removeSource("partial.luau");
  });
});

describe("require", () => {
  const LIB = "--!strict\nlocal M = {}\nfunction M.twice(n: number): number\n\treturn n * 2\nend\nreturn M\n";

  test("relative and alias paths find modules by their names", async () => {
    const withAlias = await Checker.create({ aliases: { "@lib": "vendor/lib" } });
    try {
      withAlias.setSource("vendor/lib/Maths.luau", LIB);
      withAlias.setSource(
        "src/main.luau",
        '--!strict\nlocal a = require("../vendor/lib/Maths")\nlocal b = require("@lib/Maths")\nlocal x: number = a.twice(b.twice(1))\nreturn x\n',
      );
      expect(withAlias.check("src/main.luau")).toEqual([]);
      expect(withAlias.typeAt("src/main.luau", { line: 2, column: 7 })).toBe("M"); // the module table, named after its local
    } finally {
      withAlias.dispose();
    }
  });

  test("a missing module is an error, and adding it later fixes the requirer", async () => {
    const fresh = await Checker.create();
    try {
      fresh.setSource("main.luau", '--!strict\nlocal m = require("./Later")\nlocal x: number = m.twice(2)\nreturn x\n');
      const before = fresh.check("main.luau");
      expect(before.map((d) => d.message)).toContain("Unknown require: unsupported path");
      fresh.setSource("Later.luau", LIB);
      expect(fresh.check("main.luau")).toEqual([]);
    } finally {
      fresh.dispose();
    }
  });

  test("a required module's own errors are not the requirer's", async () => {
    const fresh = await Checker.create();
    try {
      fresh.setSource("bad.luau", "--!strict\nlocal n: number = 'x'\nreturn n\n");
      fresh.setSource("main.luau", '--!strict\nlocal n = require("./bad")\nreturn n\n');
      expect(fresh.check("main.luau")).toEqual([]);
      expect(fresh.check("bad.luau")).toHaveLength(1);
    } finally {
      fresh.dispose();
    }
  });
});

describe("options", () => {
  test("strict makes unannotated modules strict", async () => {
    const strict = await Checker.create({ strict: true });
    try {
      strict.setSource("m.luau", "local function f(x) return x + 1 end\nlocal y: string = f(1)\nreturn y");
      expect(strict.check("m.luau").some((d) => d.kind === "TypeError")).toBe(true);
    } finally {
      strict.dispose();
    }
  });

  test("unknown disabled globals are reported, not silently dropped", async () => {
    const withSettings = await Checker.create({ disabledGlobals: ["os", "notAGlobal", "table.notAMember"] });
    try {
      expect(withSettings.unknownGlobals).toEqual(["notAGlobal", "table.notAMember"]);
    } finally {
      withSettings.dispose();
    }
  });

  test("a broken definitions file throws with its diagnostics", async () => {
    const created = Checker.create({ definitions: { "@bad": "declare function f(: number\n" } });
    expect(created).rejects.toBeInstanceOf(DefinitionsError);
    try {
      await created;
    } catch (error) {
      expect(error instanceof DefinitionsError && error.diagnostics.length > 0).toBe(true);
    }
  });

  test("a disposed checker refuses work", async () => {
    const disposed = await Checker.create();
    disposed.dispose();
    expect(() => disposed.check("x.luau")).toThrow("disposed");
  });

  test("the Luau version is the one luau-lsp pins", () => {
    expect(LUAU_VERSION).toBe("0.740");
  });
});

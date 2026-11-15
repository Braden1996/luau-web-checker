// The editor queries (hovers, typeAt, complete) and the API's own behaviour, on the widgets fixture's definitions.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Checker, DefinitionsError, LUAU_VERSION } from "../dist/index.js";

const api = readFileSync(join(import.meta.dir, "fixtures", "widgets", "api.d.luau"), "utf8");
const ok = readFileSync(join(import.meta.dir, "fixtures", "widgets", "ok.luau"), "utf8").replaceAll("\r\n", "\n");

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
    expect(hoverAt(6, "GetWidth")).toBe("(Region) -> number");
    expect(hoverAt(8, "self")).toBe("Frame");
  });

  test("a type function in an annotation shows what it resolves to", () => {
    expect(hoverAt(14, "EventHandler")).toBe("(number, number) -> ()");
  });

  test("a declaration shows its initializer's type, refined uses show the refinement", () => {
    // The solver's own type for the call (Luau 0.740 leaves this union unsimplified); the checker does not rewrite it.
    expect(hoverAt(19, "info")).toBe(
      "((ItemBase & { quality: number, stackCount: number? }) | (ItemBase & { quality: number, stackCount: number? }))?",
    );
    expect(hoverAt(21, "info")).toBe("ItemBase & { quality: number, stackCount: number? }");
  });

  test("ranges are 1-based and cover the identifier", () => {
    const button = checker.hovers("ok.luau").find((hover) => hover.line === 4 && hover.name === "button");
    expect(button).toMatchObject({ kind: "local", column: 7, endLine: 4, endColumn: 13 });
    const createFrame = checker.hovers("ok.luau").find((hover) => hover.line === 4 && hover.name === "CreateFrame");
    expect(createFrame?.kind).toBe("global");
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
  test("methods of a widget, inherited ones included", () => {
    checker.setSource("partial.luau", '--!strict\nlocal b = CreateFrame("Button")\nb:Se');
    checker.check("partial.luau");
    const labels = checker.complete("partial.luau", { line: 3, column: 5 }).map((entry) => entry.label);
    expect(labels).toContain("SetText");
    expect(labels).toContain("SetWidth");
    expect(labels).toContain("SetScript");
    checker.removeSource("partial.luau");
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

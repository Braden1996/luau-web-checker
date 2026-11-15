// The code-block conventions (checkSnippet) and the Expressive Code plugin, rendering real blocks.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ExpressiveCodeEngine } from "@expressive-code/core";
import { toHtml } from "@expressive-code/core/hast";

import {
  checkSnippet,
  hoverLabel,
  isDefinitionsFile,
  isTrivialHover,
  pluginLuauTypes,
  SnippetError,
} from "../dist/expressive-code.js";
import { Checker } from "../dist/index.js";

const DEFINITIONS = [
  "declare function getMoney(): number",
  "declare function setName(name: string): ()",
  "declare Shop: { open: (id: number) -> boolean }",
].join("\n");

let checker: Checker;

beforeAll(async () => {
  checker = await Checker.create({ definitions: { "@test": DEFINITIONS }, strict: true });
});

afterAll(() => {
  checker.dispose();
});

describe("checkSnippet", () => {
  test("a clean block gives hovers and no errors", () => {
    const checked = checkSnippet(checker, "a.luau", "local money = getMoney()\nlocal doubled = money * 2");
    expect(checked.hidden).toBe(0);
    expect(checked.errors).toEqual([]);
    expect(checked.hovers.find((hover) => hover.name === "doubled")).toMatchObject({ line: 2, type: "number" });
  });

  test("a hidden prelude is checked, and positions count from the first shown line", () => {
    const checked = checkSnippet(checker, "b.luau", "local prefix = 'x'\n-- ---cut---\nsetName(prefix)");
    expect(checked.hidden).toBe(2);
    expect(checked.hovers.map((hover) => [hover.line, hover.name])).toEqual([
      [1, "setName"],
      [1, "prefix"],
    ]);
  });

  test("a marked line must have an error, and keeps it for display", () => {
    const checked = checkSnippet(checker, "c.luau", "setName(1) -- error: a number is not a string");
    expect(checked.errors).toHaveLength(1);
    expect(checked.errors[0]).toMatchObject({ line: 1, kind: "TypeError" });
  });

  test("an unmarked error fails", () => {
    expect(() => checkSnippet(checker, "d.luau", "setName(1)")).toThrow(SnippetError);
  });

  test("a mark without an error fails", () => {
    expect(() => checkSnippet(checker, "e.luau", 'setName("ok") -- error')).toThrow("has no error");
  });

  test("an error in the hidden prelude fails", () => {
    expect(() => checkSnippet(checker, "f.luau", "setName(1)\n-- ---cut---\nlocal _ = 1")).toThrow("hidden prelude");
  });

  test("lint warnings are not errors", () => {
    expect(checkSnippet(checker, "g.luau", "local unused = 1").errors).toEqual([]);
  });

  test("labels and trivial hovers", () => {
    const base = { line: 1, column: 1, endLine: 1, endColumn: 2 };
    expect(hoverLabel({ ...base, kind: "local", name: "x", type: "number" })).toBe("local x: number");
    expect(hoverLabel({ ...base, kind: "property", name: "open", type: "(id: number) -> boolean" })).toBe(
      ".open: (id: number) -> boolean",
    );
    expect(hoverLabel({ ...base, kind: "type", name: "Id", type: "number" })).toBe("type Id = number");
    expect(isTrivialHover({ ...base, kind: "type", name: "number", type: "number" })).toBe(true);
    expect(isTrivialHover({ ...base, kind: "type", name: "Shop", type: "Shop" })).toBe(false);
  });

  test("definitions files are recognised by a top-level declare", () => {
    expect(isDefinitionsFile("export type DB = { n: number }\ndeclare MyDB: DB?")).toBe(true);
    expect(isDefinitionsFile("local declared = 1")).toBe(false);
  });
});

async function render(code: string, options: Partial<Parameters<typeof pluginLuauTypes>[0]> = {}, meta = "") {
  const engine = new ExpressiveCodeEngine({ plugins: [pluginLuauTypes({ checker: () => checker, ...options })] });
  const { renderedGroupAst, styles } = await engine.render({ code, language: "luau", meta });
  return { html: toHtml(renderedGroupAst), styles: [...styles].join("\n"), engine };
}

describe("pluginLuauTypes", () => {
  test("identifiers carry their types, builtin type names do not", async () => {
    const { html } = await render("local money: number = getMoney()");
    expect(html).toContain('data-luau-type="local money: number"');
    expect(html).toContain('data-luau-type="getMoney: () -> number"');
    expect(html).not.toContain('data-luau-type="type number"');
  });

  test("the prelude is not rendered", async () => {
    const { html } = await render("local secretName = 'x'\n-- ---cut---\nsetName(secretName)");
    expect(html).not.toContain("---cut---");
    expect(html.match(/secretName/gu)).toHaveLength(2); // the shown use and its data-luau-type label
  });

  test("a marked error is underlined up to its comment", async () => {
    const { html } = await render("setName(42) -- error: not a string");
    expect(html).toMatch(/<span class="luau-error" data-luau-error="TypeError: [^"]+"[^>]*>.*42/u);
    expect(html).not.toMatch(/luau-error[^>]*>[^<]*-- error/u);
  });

  test("a broken block fails the render", () => {
    expect(render("setName(42)")).rejects.toThrow("does not type-check");
  });

  test("links come from the link option, with the site's own attributes", async () => {
    const { html } = await render("local open = Shop.open(1)", {
      link: (hover, previous) =>
        hover.kind === "property" && previous?.name === "Shop"
          ? { href: `/api/shop/#${hover.name}`, attributes: { "data-sym": `shop:${hover.name}` } }
          : undefined,
    });
    expect(html).toContain('<a class="luau-link" href="/api/shop/#open"');
    expect(html).toContain('data-sym="shop:open"');
  });

  test("nocheck blocks, other languages and definitions files are left alone", async () => {
    expect((await render("setName(42)", {}, "nocheck")).html).not.toContain("luau-error");
    const engine = new ExpressiveCodeEngine({ plugins: [pluginLuauTypes({ checker: () => checker })] });
    const lua = await engine.render({ code: "setName(42)", language: "lua" });
    expect(toHtml(lua.renderedGroupAst)).not.toContain("data-luau");
    expect((await render("declare Thing: number")).html).not.toContain("data-luau");
  });

  test("the tooltip script and styles ship unless turned off", async () => {
    const withTips = await render("local x = 1");
    const scripts = await withTips.engine.getJsModules();
    expect(scripts.some((module) => module.includes("luau-tooltip"))).toBe(true);
    expect(withTips.styles + (await withTips.engine.getBaseStyles())).toContain(".luau-tooltip");

    const without = await render("local x = 1", { tooltips: false });
    expect((await without.engine.getJsModules()).some((module) => module.includes("luau-tooltip"))).toBe(false);
  });
});

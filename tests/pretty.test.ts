// The hover formatter: layout like prettify-ts, tokens for highlighting, and the declared form underneath.

import { describe, expect, test } from "bun:test";

import type { Hover } from "../dist/index.js";
import { formatType, highlightLine, hoverView, linesToText } from "../dist/index.js";

const at = { line: 1, column: 1, endLine: 1, endColumn: 2 };

describe("formatType", () => {
  test("a table puts one field per line, nested tables indented", () => {
    expect(linesToText(formatType("type AB = { a: string, b: { a: string } }"))).toBe(
      ["type AB = {", "  a: string,", "  b: {", "    a: string,", "  },", "}"].join("\n"),
    );
  });

  test("an array, a function and a union stay on one line", () => {
    expect(linesToText(formatType("local f: (items: {string}, n: number?) -> boolean | nil"))).toBe(
      "local f: (items: { string }, n: number?) -> boolean | nil",
    );
  });

  test("an optional table hugs its parentheses", () => {
    expect(linesToText(formatType("local u: ({ id: number })?"))).toBe(
      ["local u: ({", "  id: number,", "})?"].join("\n"),
    );
  });

  test("a long parameter list breaks, one parameter per line", () => {
    const text = linesToText(
      formatType("f: (firstArgument: number, secondArgument: string, thirdArgument: boolean) -> ()", { width: 40 }),
    );
    expect(text).toBe(
      ["f: (", "  firstArgument: number,", "  secondArgument: string,", "  thirdArgument: boolean,", ") -> ()"].join(
        "\n",
      ),
    );
  });
});

describe("highlightLine", () => {
  test("keywords, fields, builtins, types, strings and punctuation", () => {
    const kinds = highlightLine('type T = { kind: "a", n: number, p: Point }')
      .filter((token) => token.kind !== "text")
      .map((token) => `${token.kind}:${token.text}`);
    expect(kinds).toEqual([
      "keyword:type",
      "type:T",
      "punctuation:=",
      "punctuation:{",
      "property:kind",
      "punctuation::",
      'string:"a"',
      "punctuation:,",
      "property:n",
      "punctuation::",
      "builtin:number",
      "punctuation:,",
      "property:p",
      "punctuation::",
      "type:Point",
      "punctuation:}",
    ]);
  });
});

const hover = (kind: Hover["kind"], name: string, type: string, expanded: string): Hover => ({
  ...at,
  kind,
  name,
  type,
  expanded,
});

describe("hoverView", () => {
  test("the expanded form on top, the declared form underneath (the prettify-ts layout)", () => {
    const view = hoverView(hover("type", "AB", "A & B", "{ a: string, b: { a: string } }"));
    expect(linesToText(view.main)).toBe(
      ["type AB = {", "  a: string,", "  b: {", "    a: string,", "  },", "}"].join("\n"),
    );
    expect(view.declared === undefined ? undefined : linesToText(view.declared)).toBe("type AB = A & B");
  });

  test("no declared line when it would only repeat", () => {
    expect(hoverView(hover("local", "n", "number", "number")).declared).toBeUndefined();
    expect(hoverView(hover("type", "Point", "Point", "{ x: number }")).declared).toBeUndefined();
    expect(linesToText(hoverView(hover("type", "Frame", "Frame", "Frame")).main)).toBe("type Frame");
  });

  test("a local keeps its declared alias underneath", () => {
    const view = hoverView(hover("local", "p", "Point", "{ x: number }"));
    expect(linesToText(view.main)).toBe(["local p: {", "  x: number,", "}"].join("\n"));
    expect(view.declared === undefined ? undefined : linesToText(view.declared)).toBe("local p: Point");
  });
});

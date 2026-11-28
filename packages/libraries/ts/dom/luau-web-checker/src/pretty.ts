// Pretty, highlighted hover text, in the manner of prettify-ts: a type is laid out like code (one table field per line,
// indented), split into tokens for syntax highlighting, with the declared form underneath when it differs.
//
//   type AB = {          <- the expanded form (aliases unfolded, intersections of tables merged)
//     a: string,
//     b: {
//       a: string,
//     },
//   }
//   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   type AB = A & B      <- what the code says
//
// Pure functions over the strings Luau prints, with no DOM, so a build step and a browser both use them.

import type { Hover } from "./index.js";

export type TokenKind = "keyword" | "type" | "builtin" | "property" | "string" | "punctuation" | "text";

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

/** Lines of tokens; a line's indentation is a leading `text` token of spaces. */
export type TokenLines = readonly (readonly Token[])[];

export interface HoverView {
  /** The expanded type, laid out and tokenised. */
  readonly main: TokenLines;
  /** The type as the code declares it, when that differs from the expanded form (`type AB = A & B`). */
  readonly declared: TokenLines | undefined;
}

export interface FormatOptions {
  /** Spaces per indentation level (default 2). */
  readonly indent?: number;
  /** Lines longer than this break their parameter lists (default 72). */
  readonly width?: number;
}

const KEYWORDS: ReadonlySet<string> = new Set(["type", "local", "function", "typeof", "read", "write", "export"]);
const BUILTINS: ReadonlySet<string> = new Set([
  "any",
  "boolean",
  "buffer",
  "false",
  "never",
  "nil",
  "number",
  "string",
  "thread",
  "true",
  "unknown",
  "vector",
]);
const OPEN: Readonly<Record<string, string>> = { "{": "}", "(": ")", "<": ">", "[": "]" };

interface RawToken {
  readonly text: string;
  readonly kind: "word" | "string" | "punctuation" | "space";
}

function lex(source: string): RawToken[] {
  const tokens: RawToken[] = [];
  const pattern = /\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|->|\.\.\.|[A-Za-z_][\w.]*|\d+(?:\.\d+)?|[^\s\w]/gu;
  for (const match of source.matchAll(pattern)) {
    const text = match[0];
    if (/^\s/u.test(text)) {
      tokens.push({ text, kind: "space" });
    } else if (text.startsWith('"') || text.startsWith("'")) {
      tokens.push({ text, kind: "string" });
    } else if (/^[A-Za-z_\d]/u.test(text)) {
      tokens.push({ text, kind: "word" });
    } else {
      tokens.push({ text, kind: "punctuation" });
    }
  }
  return tokens;
}

/** The next token that is not a space, from `index` on. */
function nextSolid(tokens: readonly RawToken[], index: number): RawToken | undefined {
  for (let i = index; i < tokens.length; i += 1) {
    if (tokens[i]?.kind !== "space") {
      return tokens[i];
    }
  }
  return undefined;
}

function classify(tokens: readonly RawToken[]): Token[] {
  return tokens.map((token, index): Token => {
    if (token.kind !== "word") {
      return { text: token.text, kind: token.kind === "space" ? "text" : token.kind };
    }
    if (KEYWORDS.has(token.text)) {
      return { text: token.text, kind: "keyword" };
    }
    if (BUILTINS.has(token.text) || /^\d/u.test(token.text)) {
      return { text: token.text, kind: "builtin" };
    }
    // A name before `:` is a field or a parameter; `?:` is an optional one.
    return { text: token.text, kind: nextSolid(tokens, index + 1)?.text === ":" ? "property" : "type" };
  });
}

// A parsed type: plain tokens and bracketed groups whose items are separated by top-level commas.
type Node = { readonly kind: "token"; readonly token: Token } | Group;
interface Group {
  readonly kind: "group";
  readonly open: string;
  readonly close: string;
  readonly items: Node[][];
}

function parse(tokens: readonly Token[]): Node[] {
  let index = 0;
  const sequence = (close: string | undefined): Node[][] => {
    const items: Node[][] = [[]];
    while (index < tokens.length) {
      const token = tokens[index];
      index += 1;
      if (token === undefined) {
        break;
      }
      if (close !== undefined && token.text === close) {
        return items;
      }
      const current = items.at(-1) ?? [];
      const closing = OPEN[token.text];
      // `->` is one token, so `<`/`>` here are generics; `,` splits the items of the enclosing group.
      if (closing !== undefined) {
        current.push({ kind: "group", open: token.text, close: closing, items: sequence(closing) });
      } else if (token.text === "," && close !== undefined) {
        items.push([]);
      } else if (token.kind === "text" && (current.length === 0 || close === undefined) && token.text.trim() === "") {
        if (current.length > 0) {
          current.push({ kind: "token", token: { text: " ", kind: "text" } });
        }
      } else {
        current.push({ kind: "token", token });
      }
    }
    return items;
  };
  return sequence(undefined)[0] ?? [];
}

const isSpace = (node: Node | undefined): boolean => node?.kind === "token" && node.token.kind === "text";

const trimItem = (item: readonly Node[]): Node[] => {
  const nodes = [...item];
  while (isSpace(nodes[0])) {
    nodes.shift();
  }
  while (isSpace(nodes.at(-1))) {
    nodes.pop();
  }
  return nodes;
};

const punctuation = (text: string): Token => ({ text, kind: "punctuation" });

// A table with named fields (or an indexer) is laid out one field per line; `{string}` (an array) stays inline.
function isRecord(group: Group): boolean {
  return (
    group.open === "{" &&
    group.items.some((item) => item.some((node) => node.kind === "token" && node.token.text === ":"))
  );
}

function inlineText(nodes: readonly Node[]): string {
  return nodes
    .map((node) =>
      node.kind === "token"
        ? node.token.text
        : `${node.open}${node.open === "{" ? " " : ""}${node.items.map((item) => inlineText(trimItem(item))).join(", ")}${node.open === "{" ? " " : ""}${node.close}`,
    )
    .join("");
}

class Printer {
  readonly lines: Token[][] = [[]];
  readonly #indent: number;
  readonly #width: number;

  constructor(options: FormatOptions) {
    this.#indent = options.indent ?? 2;
    this.#width = options.width ?? 72;
  }

  push(token: Token): void {
    this.lines.at(-1)?.push(token);
  }

  newline(depth: number): void {
    this.lines.push(depth > 0 ? [{ text: " ".repeat(depth * this.#indent), kind: "text" }] : []);
  }

  column(): number {
    return (this.lines.at(-1) ?? []).reduce((sum, token) => sum + token.text.length, 0);
  }

  print(nodes: readonly Node[], depth: number): void {
    for (const node of nodes) {
      if (node.kind === "token") {
        this.push(node.token);
      } else {
        this.group(node, depth);
      }
    }
  }

  group(group: Group, depth: number): void {
    const items = group.items.map(trimItem).filter((item) => item.length > 0);
    const broken = isRecord(group) || this.column() + inlineText([group]).length > this.#width;
    if (items.length === 0) {
      this.push(punctuation(group.open + group.close));
      return;
    }
    if (!broken) {
      this.push(punctuation(group.open));
      if (group.open === "{") {
        this.push({ text: " ", kind: "text" });
      }
      items.forEach((item, index) => {
        if (index > 0) {
          this.push(punctuation(","));
          this.push({ text: " ", kind: "text" });
        }
        this.print(item, depth);
      });
      if (group.open === "{") {
        this.push({ text: " ", kind: "text" });
      }
      this.push(punctuation(group.close));
      return;
    }
    const only = items[0];
    if (items.length === 1 && only !== undefined && group.open !== "{") {
      // A single item in parentheses or angle brackets (grouping, one parameter) hugs its content: `({ ... })?`.
      this.push(punctuation(group.open));
      this.print(only, depth);
      this.push(punctuation(group.close));
      return;
    }
    this.push(punctuation(group.open));
    for (const item of items) {
      this.newline(depth + 1);
      this.print(item, depth + 1);
      this.push(punctuation(","));
    }
    this.newline(depth);
    this.push(punctuation(group.close));
  }
}

/** Lays out and tokenises a type (or `local x: T` / `type X = T` text) as Luau prints it. */
export function formatType(text: string, options: FormatOptions = {}): TokenLines {
  const printer = new Printer(options);
  printer.print(parse(classify(lex(text))), 0);
  return printer.lines.filter((line, index, all) => line.length > 0 || index < all.length - 1);
}

/** Tokenises text on one line, without changing its layout. */
export function highlightLine(text: string): readonly Token[] {
  return classify(lex(text));
}

/** The text of tokenised lines, as plain text. */
export function linesToText(lines: TokenLines): string {
  return lines.map((line) => line.map((token) => token.text).join("")).join("\n");
}

function heading(hover: Hover): string {
  switch (hover.kind) {
    case "local":
      return `local ${hover.name}: `;
    case "global":
      return `${hover.name}: `;
    case "property":
      return `.${hover.name}: `;
    case "type":
      return `type ${hover.name} = `;
  }
}

/**
 * What a hover shows: the expanded type, laid out and highlighted, and the declared form when it differs. A type name
 * that is only its own name (`type Frame`) shows just that.
 */
export function hoverView(hover: Hover & { readonly expanded?: string }, options: FormatOptions = {}): HoverView {
  const expanded = hover.expanded ?? hover.type;
  if (hover.kind === "type" && expanded === hover.name) {
    return { main: [highlightLine(`type ${hover.name}`)], declared: undefined };
  }
  const main = formatType(`${heading(hover)}${expanded}`, options);
  // `type Point = Point` says nothing; a local or a field keeps its declared name (`local p: Point`).
  const redundant = expanded === hover.type || (hover.kind === "type" && hover.type === hover.name);
  const declared = redundant ? undefined : [highlightLine(`${heading(hover)}${hover.type}`)];
  return { main, declared };
}

// Checking a documentation code block, in the manner of TypeScript's Twoslash: the block is checked as a module, and
// every identifier's type is kept for hovers.
//
// Conventions inside a block:
//   -- ---cut---      lines above it are checked but not shown (a hidden prelude, as Twoslash's `// ---cut---`)
//   ... -- error      the line must have a type or syntax error (shown underlined, with the message on hover); no
//                     other line may have one, so an example that stops type-checking fails the build
// Lint warnings (unused locals and the like) are ignored, because examples are fragments.

import type { Checker, Diagnostic, Hover } from "./index.js";

/** The line that separates a hidden prelude from the shown code. */
export const CUT = "-- ---cut---";

/** `-- error` or `-- error: why`, as the end-of-line comment that marks an expected error. */
const ERROR_MARK = /--\s*error\b/u;

const ERROR_KINDS: ReadonlySet<string> = new Set(["TypeError", "SyntaxError", "InternalCompilerError"]);

/** Type names whose hover would only repeat the name. */
const BUILTIN_TYPES: ReadonlySet<string> = new Set([
  "any",
  "boolean",
  "buffer",
  "never",
  "nil",
  "number",
  "string",
  "thread",
  "unknown",
  "vector",
]);

export interface CheckedSnippet {
  /** How many lines at the top are hidden (the prelude and the cut line). */
  readonly hidden: number;
  /** The errors, with lines counted in the shown code (1-based). */
  readonly errors: readonly Diagnostic[];
  /** Each shown identifier with its type, lines counted in the shown code. */
  readonly hovers: readonly Hover[];
}

/** A code block that does not check as it claims to. The message lists every problem. */
export class SnippetError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[], code: string) {
    super(`Luau code block does not type-check as marked:\n  ${problems.join("\n  ")}\n--- code ---\n${code}`);
    this.name = "SnippetError";
    this.problems = problems;
  }
}

/** Whether a block is a definitions file (it has a top-level `declare`) rather than a module. */
export function isDefinitionsFile(code: string): boolean {
  return /^declare\s/mu.test(code);
}

/** What a hover shows: `local x: number`, `.field: string`, `type Alias = ...`. */
export function hoverLabel(hover: Hover): string {
  switch (hover.kind) {
    case "local":
      return `local ${hover.name}: ${hover.type}`;
    case "global":
      return `${hover.name}: ${hover.type}`;
    case "property":
      return `.${hover.name}: ${hover.type}`;
    case "type":
      return hover.type === hover.name ? `type ${hover.name}` : `type ${hover.name} = ${hover.type}`;
  }
}

/** Whether a hover says nothing its text does not (a builtin type name such as `number`). */
export function isTrivialHover(hover: Hover): boolean {
  return hover.kind === "type" && hover.type === hover.name && BUILTIN_TYPES.has(hover.name);
}

function shift<T extends Diagnostic | Hover>(entry: T, hidden: number): T {
  return { ...entry, line: entry.line - hidden, endLine: entry.endLine - hidden };
}

/**
 * Checks one code block. `checker` must already have its definitions. The block is added as module `name` and
 * removed again afterwards. `prelude` is hidden code checked before every block, such as the `require` lines its
 * examples assume.
 *
 * @throws SnippetError when an unmarked line has an error or a marked line has none.
 */
export function checkSnippet(checker: Checker, name: string, code: string, prelude = ""): CheckedSnippet {
  const lines = code.split("\n");
  const cutIndex = lines.findIndex((line) => line.trim() === CUT);
  const hidden = cutIndex === -1 ? 0 : cutIndex + 1;
  // The cut line becomes a blank line, so positions in the checked source equal positions in the block.
  const block = cutIndex === -1 ? code : lines.map((line, index) => (index === cutIndex ? "" : line)).join("\n");
  const preludeLines = prelude === "" ? 0 : prelude.replace(/\n$/u, "").split("\n").length;
  const source = preludeLines === 0 ? block : `${prelude.replace(/\n$/u, "")}\n${block}`;

  checker.setSource(name, source);
  try {
    // From here on, line 1 is the block's first line; the shared prelude is at line 0 and before.
    const errors = checker
      .check(name)
      .flatMap((error) => (ERROR_KINDS.has(error.kind) ? [shift(error, preludeLines)] : []));
    const hovers = checker.hovers(name).map((hover) => shift(hover, preludeLines));

    const marked = new Set(lines.flatMap((line, index) => (ERROR_MARK.test(line) ? [index + 1] : [])));
    const problems: string[] = [];
    for (const error of errors) {
      if (error.line < 1) {
        problems.push(`shared prelude, line ${String(error.line + preludeLines)}: ${error.kind}: ${error.message}`);
      } else if (error.line <= hidden) {
        problems.push(`hidden prelude, line ${String(error.line)}: ${error.kind}: ${error.message}`);
      } else if (!marked.has(error.line)) {
        problems.push(`line ${String(error.line - hidden)}: ${error.kind}: ${error.message}`);
      }
    }
    for (const line of marked) {
      if (line <= hidden) {
        problems.push(`hidden prelude, line ${String(line)}: an "-- error" mark belongs in the shown code`);
      } else if (!errors.some((error) => error.line === line)) {
        problems.push(`line ${String(line - hidden)} is marked "-- error" but has no error`);
      }
    }
    if (problems.length > 0) {
      throw new SnippetError(problems, code);
    }

    return {
      hidden,
      errors: errors.map((error) => shift(error, hidden)),
      hovers: hovers.flatMap((hover) => (hover.line > hidden ? [shift(hover, hidden)] : [])),
    };
  } finally {
    checker.removeSource(name);
  }
}

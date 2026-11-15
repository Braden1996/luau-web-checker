// The playground's checker, off the main thread: luau-web-checker with the example API (or none), answering one
// request at a time. The module and the .wasm load on the first request; Vite bundles both with the site.

import type { Diagnostic, Hover } from "luau-web-checker";
import { Checker } from "luau-web-checker";

import exampleApi from "../../lib/example-api.d.luau?raw";
import type { Definitions, Request, Response } from "./protocol.ts";

const MODULE = "playground.luau";

const checkers = new Map<Definitions, Promise<Checker>>();
const sources = new Map<Definitions, string>();

function checkerFor(definitions: Definitions): Promise<Checker> {
  let checker = checkers.get(definitions);
  if (checker === undefined) {
    checker = Checker.create(
      definitions === "example" ? { definitions: { "@example": exampleApi } } : {},
    );
    checkers.set(definitions, checker);
  }
  return checker;
}

// The identifier under a position (module lines, 1-based), moved to the editor's lines.
function hoverAt(
  checker: Checker,
  position: { readonly line: number; readonly column: number },
): Hover | undefined {
  const hover = checker
    .hovers(MODULE)
    .find(
      (entry) =>
        entry.line === position.line &&
        entry.column <= position.column &&
        position.column < entry.endColumn,
    );
  return hover === undefined
    ? undefined
    : { ...hover, line: hover.line - 1, endLine: hover.endLine - 1 };
}

async function answer(request: Request): Promise<Response> {
  const checker = await checkerFor(request.definitions);
  // The mode is part of the source, so a change of mode re-checks like an edit.
  const source = `${request.strict ? "--!strict" : "--!nonstrict"}\n${request.source}`;
  if (sources.get(request.definitions) !== source) {
    checker.setSource(MODULE, source);
    sources.set(request.definitions, source);
  }
  // Positions in the editor are one line above the module's (the mode comment is line 1).
  const diagnostics = checker
    .check(MODULE)
    .map(({ file, line, column, endLine, endColumn, kind, message }): Diagnostic => ({
      file,
      line: line - 1,
      column,
      endLine: endLine - 1,
      endColumn,
      kind,
      message,
    }));
  if (request.kind === "check") {
    return { id: request.id, kind: "check", diagnostics };
  }
  const position = { line: request.line + 1, column: request.column };
  return request.kind === "hover"
    ? { id: request.id, kind: "hover", hover: hoverAt(checker, position) }
    : { id: request.id, kind: "complete", completions: checker.complete(MODULE, position) };
}

async function respond(request: Request): Promise<void> {
  let response: Response;
  try {
    response = await answer(request);
  } catch (error) {
    response = {
      id: request.id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
  respond(event.data).catch((error: unknown) => {
    console.error("playground worker:", error);
  });
});

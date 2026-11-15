// luau-web-checker: Luau's own type checker (Analysis, new solver) compiled to WebAssembly.
//
// It is set up as `luau-lsp analyze --flag:LuauSolverV2=true` is: every non-experimental Luau flag on, the new
// solver, the builtin globals, your definitions files, then luau-lsp's `types.disabledGlobals`. The agreement tests
// compare its diagnostics with luau-lsp's on the same inputs.
//
// Positions are 1-based everywhere (line and column), and ranges end one past their last character, as luau-lsp
// prints them.

import type { LuauCheckerModule, ModuleOptions, NativeChecker } from "./luau-checker.mjs";
import createLuauChecker from "./luau-checker.mjs";

/** The Luau release compiled into this build (the one luau-lsp 1.70.1 uses). */
export const LUAU_VERSION = "0.740";

export interface Position {
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
}

export interface Range extends Position {
  readonly endLine: number;
  /** One past the last column. */
  readonly endColumn: number;
}

export interface Diagnostic extends Range {
  /** The module (or definitions package) it is in. */
  readonly file: string;
  /** `TypeError`, `SyntaxError`, `InternalCompilerError`, or a lint name such as `LocalShadow`. */
  readonly kind: string;
  /** The message as luau-lsp prints it (multi-line for some type errors). */
  readonly message: string;
}

export type HoverKind = "local" | "global" | "property" | "type";

/** One identifier and the type the solver gave it. */
export interface Hover extends Range {
  readonly kind: HoverKind;
  readonly name: string;
  /** The type as the solver names it (`A & B`, `Point`). */
  readonly type: string;
  /** The same type with aliases unfolded and intersections of tables merged (`{ a: string, b: { a: string } }`). */
  readonly expanded: string;
}

export type CompletionKind = "property" | "binding" | "keyword" | "string" | "type" | "other";

export interface Completion {
  readonly label: string;
  readonly kind: CompletionKind;
  readonly type?: string;
  readonly deprecated: boolean;
}

/** Where the .wasm comes from: its URL, or its bytes. The default is the file next to the module. */
export type WasmSource = string | URL | ArrayBuffer | Uint8Array;

export interface CheckerOptions {
  /** Definitions files by package name (`@api`), loaded in this order. */
  readonly definitions?: Readonly<Record<string, string>>;
  /** luau-lsp's `types.disabledGlobals`: globals (`os`) or library members (`table.clone`) to remove. */
  readonly disabledGlobals?: readonly string[];
  /** Check modules without a `--!strict`/`--!nonstrict` comment in strict mode (luau-lsp's default is nonstrict). */
  readonly strict?: boolean;
  /** `.luaurc` aliases: `{ "@pkg": "vendor/pkg/src" }` makes `require("@pkg/Thing")` find `vendor/pkg/src/Thing.luau`. */
  readonly aliases?: Readonly<Record<string, string>>;
  readonly wasm?: WasmSource;
}

/** A definitions file did not load: its diagnostics are attached. */
export class DefinitionsError extends Error {
  readonly packageName: string;
  readonly diagnostics: readonly Diagnostic[];

  constructor(packageName: string, diagnostics: readonly Diagnostic[]) {
    const first = diagnostics[0];
    super(
      `definitions ${packageName} did not load` +
        (first === undefined ? "" : `: ${String(first.line)}:${String(first.column)}: ${first.message}`),
    );
    this.name = "DefinitionsError";
    this.packageName = packageName;
    this.diagnostics = diagnostics;
  }
}

export { formatType, highlightLine, hoverView, linesToText } from "./pretty.ts";
export type { FormatOptions, HoverView, Token, TokenKind, TokenLines } from "./pretty.ts";

let defaultModule: Promise<LuauCheckerModule> | undefined;

function moduleOptions(wasm: WasmSource): ModuleOptions {
  if (typeof wasm === "string" || wasm instanceof URL) {
    const href = wasm.toString();
    return { locateFile: (path, prefix) => (path.endsWith(".wasm") ? href : prefix + path) };
  }
  return { wasmBinary: wasm };
}

/** Instantiates the WebAssembly module. Without `wasm` the instance is shared by every checker. */
export function loadModule(wasm?: WasmSource): Promise<LuauCheckerModule> {
  if (wasm !== undefined) {
    return createLuauChecker(moduleOptions(wasm));
  }
  defaultModule ??= createLuauChecker();
  return defaultModule;
}

// The native side returns JSON it builds itself (wasm/checker.cpp); each entry is still checked, so a mismatch
// between the two halves fails loudly instead of handing out wrongly typed objects.
type Guard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRange(value: Record<string, unknown>): boolean {
  return ["line", "column", "endLine", "endColumn"].every((key) => typeof value[key] === "number");
}

const isDiagnostic: Guard<Diagnostic> = (value): value is Diagnostic =>
  isRecord(value) &&
  isRange(value) &&
  typeof value["file"] === "string" &&
  typeof value["kind"] === "string" &&
  typeof value["message"] === "string";

const HOVER_KINDS: ReadonlySet<unknown> = new Set<HoverKind>(["local", "global", "property", "type"]);
const isHover: Guard<Hover> = (value): value is Hover =>
  isRecord(value) &&
  isRange(value) &&
  HOVER_KINDS.has(value["kind"]) &&
  typeof value["name"] === "string" &&
  typeof value["type"] === "string" &&
  typeof value["expanded"] === "string";

const COMPLETION_KINDS: ReadonlySet<unknown> = new Set<CompletionKind>([
  "property",
  "binding",
  "keyword",
  "string",
  "type",
  "other",
]);
const isCompletion: Guard<Completion> = (value): value is Completion =>
  isRecord(value) &&
  typeof value["label"] === "string" &&
  COMPLETION_KINDS.has(value["kind"]) &&
  (value["type"] === undefined || typeof value["type"] === "string") &&
  typeof value["deprecated"] === "boolean";

function parseList<T>(json: string, guard: Guard<T>): T[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) {
    throw new TypeError(`luau-web-checker: expected a JSON array, got ${json.slice(0, 80)}`);
  }
  return value.map((entry: unknown) => {
    if (!guard(entry)) {
      throw new TypeError(`luau-web-checker: unexpected entry ${JSON.stringify(entry)}`);
    }
    return entry;
  });
}

export class Checker {
  readonly #native: NativeChecker;
  /** Names in `disabledGlobals` that matched nothing (luau-lsp warns about these). */
  readonly unknownGlobals: readonly string[];
  #disposed = false;

  private constructor(native: NativeChecker, unknownGlobals: readonly string[]) {
    this.#native = native;
    this.unknownGlobals = unknownGlobals;
  }

  /**
   * Creates a checker with its definitions loaded. Loading a large definitions file takes seconds; create one
   * checker and reuse it for every module.
   *
   * @throws DefinitionsError when a definitions file has errors.
   */
  static async create(options: CheckerOptions = {}): Promise<Checker> {
    const module = await loadModule(options.wasm);
    const native = new module.Checker();
    try {
      for (const [packageName, source] of Object.entries(options.definitions ?? {})) {
        const diagnostics = parseList(native.addDefinitions(packageName, source), isDiagnostic);
        if (diagnostics.length > 0) {
          throw new DefinitionsError(packageName, diagnostics);
        }
      }
      const unknown = (options.disabledGlobals ?? []).filter((name) => !native.disableGlobal(name));
      native.setStrict(options.strict ?? false);
      for (const [alias, directory] of Object.entries(options.aliases ?? {})) {
        native.setAlias(alias, directory);
      }
      return new Checker(native, unknown);
    } catch (error) {
      native.delete();
      throw error;
    }
  }

  /**
   * Adds or replaces a module. Its name is its path (`src/util.luau`): `require("./util")` from a module in `src/`
   * finds it, as do `../` paths and `@alias/` paths (see `aliases`). The names are not files; nothing is read from disk.
   */
  setSource(name: string, source: string): void {
    this.#live().setSource(name, source);
  }

  removeSource(name: string): void {
    this.#live().removeSource(name);
  }

  /** Type errors, syntax errors and lint warnings, as `luau-lsp analyze` reports them, sorted by position. */
  check(name: string): Diagnostic[] {
    return parseList(this.#live().check(name), isDiagnostic).toSorted(
      (a, b) => a.line - b.line || a.column - b.column || compareText(a, b),
    );
  }

  /** Every identifier in the module with its type, in source order. Call after `check`. */
  hovers(name: string): Hover[] {
    return parseList(this.#live().hovers(name), isHover).toSorted((a, b) => a.line - b.line || a.column - b.column);
  }

  /**
   * The type at a position, as an editor's hover shows it: the identifier's entry in `hovers`, else the type of the
   * innermost expression there. Call after `check`.
   */
  typeAt(name: string, position: Position): string | undefined {
    const hover = this.hovers(name).find((entry) => contains(entry, position));
    if (hover !== undefined) {
      return hover.type;
    }
    const type = this.#live().typeAt(name, position.line - 1, position.column - 1);
    return type === "" ? undefined : type;
  }

  /** Completions at a position (the cursor sits before `column`). */
  complete(name: string, position: Position): Completion[] {
    return parseList(this.#live().autocomplete(name, position.line - 1, position.column - 1), isCompletion);
  }

  /** Frees the checker's memory. It cannot be used afterwards. */
  dispose(): void {
    if (!this.#disposed) {
      this.#disposed = true;
      this.#native.delete();
    }
  }

  #live(): NativeChecker {
    if (this.#disposed) {
      throw new Error("luau-web-checker: this checker was disposed");
    }
    return this.#native;
  }
}

function contains(range: Range, position: Position): boolean {
  const afterStart = position.line > range.line || (position.line === range.line && position.column >= range.column);
  const beforeEnd =
    position.line < range.endLine || (position.line === range.endLine && position.column < range.endColumn);
  return afterStart && beforeEnd;
}

function compareText(a: Diagnostic, b: Diagnostic): number {
  const left = `${a.kind}: ${a.message}`;
  const right = `${b.kind}: ${b.message}`;
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

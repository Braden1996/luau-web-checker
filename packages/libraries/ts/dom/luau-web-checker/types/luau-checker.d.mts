// Types for dist/luau-checker.mjs, the Emscripten module that scripts/build-wasm.effect.ts builds from wasm/checker.cpp.
// The class mirrors `Checker` in checker.cpp; its JSON strings are parsed by src/index.ts. Positions given to
// typeAt and autocomplete are 0-based; positions in the returned JSON are 1-based.

export interface NativeChecker {
  addDefinitions(packageName: string, source: string): string;
  disableGlobal(name: string): boolean;
  setStrict(strict: boolean): void;
  setSource(name: string, source: string): void;
  removeSource(name: string): void;
  setAlias(name: string, directory: string): void;
  check(name: string): string;
  hovers(name: string): string;
  typeAt(name: string, line: number, column: number): string;
  autocomplete(name: string, line: number, column: number): string;
  /** Frees the C++ object (embind). */
  delete(): void;
}

export interface LuauCheckerModule {
  readonly Checker: new () => NativeChecker;
}

export interface ModuleOptions {
  /** The .wasm bytes, when the caller has already fetched them. */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** Where to fetch the .wasm from (the default is next to luau-checker.mjs). */
  locateFile?: (path: string, prefix: string) => string;
}

declare function createLuauChecker(options?: ModuleOptions): Promise<LuauCheckerModule>;

export default createLuauChecker;

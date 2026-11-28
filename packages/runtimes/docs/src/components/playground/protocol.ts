// Messages between the playground page and its checker worker (checker.effect.worker.ts). Positions are 1-based.

import type { Completion, Diagnostic, Hover } from "@luau-web-checker/checker";

/** Which definitions the code is checked against: the site's example API, or only Luau's own globals. */
export type Definitions = "example" | "none";

interface Base {
  readonly id: number;
  readonly source: string;
  readonly definitions: Definitions;
  readonly strict: boolean;
}

export type Request =
  | (Base & { readonly kind: "check" })
  | (Base & {
      readonly kind: "hover" | "complete";
      readonly line: number;
      readonly column: number;
    });

export type Response =
  | { readonly id: number; readonly kind: "check"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly id: number; readonly kind: "hover"; readonly hover: Hover | undefined }
  | { readonly id: number; readonly kind: "complete"; readonly completions: readonly Completion[] }
  | { readonly id: number; readonly kind: "error"; readonly message: string };

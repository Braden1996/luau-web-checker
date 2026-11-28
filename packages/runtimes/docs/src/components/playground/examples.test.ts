// sgt:by-declaration: import.meta locates the example API fixture.
// Each playground example checks as the page claims: no errors, except the one the type-functions example shows.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Checker } from "@luau-web-checker/checker";

import { EXAMPLES } from "./examples.ts";

const exampleApi = readFileSync(join(import.meta.dir, "..", "..", "lib", "example-api.d.luau"), "utf8");
const ERROR_KINDS: ReadonlySet<string> = new Set(["TypeError", "SyntaxError"]);
const EXPECTED_ERRORS: Readonly<Record<string, number>> = { "type-functions": 1 };

describe.each(EXAMPLES.map((example) => [example.id, example] as const))("example %s", (id, example) => {
  test("checks with the expected number of errors", async () => {
    const checker = await Checker.create(
      example.definitions === "example" ? { definitions: { "@example": exampleApi }, strict: true } : { strict: true },
    );
    try {
      checker.setSource("playground.luau", example.code);
      const errors = checker.check("playground.luau").filter((d) => ERROR_KINDS.has(d.kind));
      expect(errors.map((d) => `${String(d.line)}: ${d.message}`)).toHaveLength(EXPECTED_ERRORS[id] ?? 0);
    } finally {
      checker.dispose();
    }
  });
});

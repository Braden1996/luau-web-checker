// The checker behind every ```luau block on the site (ec.config.mjs): this package itself, loaded with the example
// API (example-api.d.luau) and strict by default. Loading happens once per build.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Checker } from "luau-web-checker";

/** The example API's source. The build runs from site/, where `src/lib/` is. */
export function exampleApi(): string {
  return readFileSync(join(process.cwd(), "src", "lib", "example-api.d.luau"), "utf8");
}

let shared: Promise<Checker> | undefined;

export function siteChecker(): Promise<Checker> {
  shared ??= Checker.create({ definitions: { "@example": exampleApi() }, strict: true });
  return shared;
}

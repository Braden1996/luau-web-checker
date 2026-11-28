// Expressive Code options. They live here, not in astro.config.ts, because a plugin is not serializable.
// Every ```luau block on the site is type-checked at build time by this package's own plugin, and its identifiers
// get hover tooltips (src/lib/checker.ts sets up the checker).
import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import { pluginLuauTypes } from "luau-web-checker/expressive-code";

import { siteChecker } from "./src/lib/checker.ts";

export default defineEcConfig({
  themes: ["github-dark-default", "github-light-default"],
  plugins: [pluginLuauTypes({ checker: siteChecker })],
});

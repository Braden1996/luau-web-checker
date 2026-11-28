import starlight from "@astrojs/starlight";
import type { AstroUserConfig } from "astro";
import { defineConfig } from "astro/config";

import { BASE } from "./src/lib/base.ts";

const repository = "https://github.com/Braden1996/luau-web-checker";

// https://astro.build/config: fully static output for GitHub Pages (project site under /luau-web-checker/).
// Expressive Code's options, including the Luau checking plugin, are in ec.config.mjs.
const config: AstroUserConfig = defineConfig({
  site: "https://braden1996.github.io",
  base: BASE,
  trailingSlash: "always",
  output: "static",
  integrations: [
    starlight({
      title: "luau-web-checker",
      description:
        "Luau's own type checker, new solver, compiled to WebAssembly: checked, hoverable Luau code in docs sites, browsers, Node and Bun.",
      logo: { src: "./src/assets/logo.svg", alt: "" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: repository }],
      editLink: { baseUrl: `${repository}/edit/main/packages/runtimes/docs/` },
      lastUpdated: true,
      customCss: ["./src/styles/theme.css"],
      sidebar: [
        {
          label: "Start here",
          items: [{ slug: "start/introduction" }, { slug: "start/install" }, { slug: "start/usage" }],
        },
        {
          label: "Guides",
          items: [{ slug: "guides/checked-docs" }, { slug: "guides/browser" }, { slug: "guides/agreement" }],
        },
        {
          label: "Examples",
          items: [
            { slug: "examples/basics" },
            { slug: "examples/tables-and-generics" },
            { slug: "examples/unions-and-refinement" },
            { slug: "examples/classes" },
            { slug: "examples/type-functions" },
            { slug: "examples/definitions" },
            { slug: "examples/errors" },
          ],
        },
        { label: "Playground", link: "/playground/" },
        { label: "API reference", items: [{ slug: "reference/api" }] },
        {
          label: "Project",
          items: [{ slug: "project/used-by" }, { slug: "project/contributing" }, { slug: "project/changelog" }],
        },
      ],
    }),
  ],
  vite: {
    // The checker finds its .wasm through `new URL(..., import.meta.url)`; pre-bundling would move the module away
    // from it in dev.
    optimizeDeps: { exclude: ["@luau-web-checker/checker"] },
    worker: { format: "es" },
  },
});

export default config;

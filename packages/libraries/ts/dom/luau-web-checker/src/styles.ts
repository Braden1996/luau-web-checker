// Styles for checked code blocks: underlines, the tooltip, and syntax highlighting of the types in it. The colours come
// from the site's own code theme (each Expressive Code theme gets its own values), so tooltips match the code blocks
// in light and dark themes alike, as editor hovers do.

import type { ExpressiveCodeTheme, ResolverContext } from "@expressive-code/core";
import { PluginStyleSettings } from "@expressive-code/core";

import type { TokenKind } from "./pretty.js";

/** The colour the theme gives the most specific of these TextMate scopes, if any. */
function scopeColor(theme: ExpressiveCodeTheme, scopes: readonly string[]): string | undefined {
  for (const wanted of scopes) {
    let best: { readonly length: number; readonly color: string } | undefined;
    for (const setting of theme.settings) {
      const color = setting.settings.foreground;
      for (const scope of setting.scope ?? []) {
        const matches = wanted === scope || wanted.startsWith(`${scope}.`);
        if (color !== undefined && matches && (best === undefined || scope.length > best.length)) {
          best = { length: scope.length, color };
        }
      }
    }
    if (best !== undefined) {
      return best.color;
    }
  }
  return undefined;
}

const token =
  (scopes: readonly string[], dark: string, light: string) =>
  ({ theme }: { readonly theme: ExpressiveCodeTheme }): string =>
    scopeColor(theme, scopes) ?? (theme.type === "dark" ? dark : light);

export const luauTypesStyleSettings: PluginStyleSettings = new PluginStyleSettings({
  defaultValues: {
    luauTypes: {
      background: ({ theme }) =>
        theme.colors["editorHoverWidget.background"] ?? theme.colors["editor.background"] ?? theme.bg,
      foreground: ({ theme }) => theme.colors["editor.foreground"] ?? theme.fg,
      border: ({ theme }) =>
        theme.colors["editorHoverWidget.border"] ??
        theme.colors["editorWidget.border"] ??
        (theme.type === "dark" ? "#3d444d" : "#d1d9e0"),
      errorColor: ({ theme }) =>
        theme.colors["editorError.foreground"] ?? (theme.type === "dark" ? "#f85149" : "#cf222e"),
      keyword: token(["storage.type", "keyword.control", "keyword"], "#ff7b72", "#cf222e"),
      type: token(["entity.name.type", "support.type", "entity.name.class"], "#ffa657", "#953800"),
      builtin: token(["support.type.primitive", "support.type.builtin", "constant.language"], "#79c0ff", "#0550ae"),
      property: token(
        ["meta.property-name", "support.variable.property", "variable.other.property"],
        "#79c0ff",
        "#0550ae",
      ),
      string: token(["string.quoted", "string"], "#a5d6ff", "#0a3069"),
      punctuation: ({ theme }) => theme.colors["editor.foreground"] ?? theme.fg,
    },
  },
});

const KINDS = [
  "keyword",
  "type",
  "builtin",
  "property",
  "string",
  "punctuation",
] as const satisfies readonly TokenKind[];

/** Underlines and link styles (always), plus the tooltip and its highlighting (unless the site renders its own). */
export function baseStyles({ cssVar }: ResolverContext, tooltips: boolean): string {
  const underlines = `
    .luau-hover, .luau-link { cursor: help; color: inherit; text-decoration: none; }
    .luau-hover:hover, .luau-hover:focus-visible, .luau-link:hover, .luau-link:focus-visible {
      text-decoration: underline dotted; text-underline-offset: 3px;
    }
    .luau-error {
      cursor: help;
      text-decoration: underline wavy ${cssVar("luauTypes.errorColor")};
      text-decoration-skip-ink: none; text-underline-offset: 3px;
    }
    .luau-popup { display: none; }
    .luau-tooltip-host { margin: 0; padding: 0; }
  `;
  if (!tooltips) {
    return underlines;
  }
  const tokens = KINDS.map((kind) => `.luau-tooltip .luau-t-${kind} { color: ${cssVar(`luauTypes.${kind}`)}; }`).join(
    "\n",
  );
  return `${underlines}
    .luau-tooltip {
      position: fixed; z-index: 100; max-width: min(42rem, calc(100vw - 16px)); max-height: 22rem; overflow: auto;
      margin: 0; border: 1px solid ${cssVar("luauTypes.border")}; border-radius: 0.35rem;
      background: ${cssVar("luauTypes.background")}; color: ${cssVar("luauTypes.foreground")};
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.3);
      font-family: var(--ec-codeFontFml, ui-monospace, monospace); font-size: 0.82rem; line-height: 1.5;
      pointer-events: none;
    }
    .luau-tooltip[hidden] { display: none; }
    .luau-tooltip:not(:has(.luau-popup-main)) { padding: 0.45rem 0.7rem; white-space: pre-wrap; }
    .luau-tooltip-error { border-color: ${cssVar("luauTypes.errorColor")}; }
    .luau-tooltip .luau-popup-main, .luau-tooltip .luau-popup-declared {
      display: block; padding: 0.45rem 0.7rem; white-space: pre;
    }
    .luau-tooltip .luau-popup-declared { border-top: 1px solid ${cssVar("luauTypes.border")}; }
    ${tokens}
  `;
}

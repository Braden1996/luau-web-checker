// An Expressive Code plugin (Astro, Starlight and anything else that renders code with Expressive Code) that
// type-checks every Luau code block at build time and makes its identifiers hoverable: Twoslash for Luau.
//
//   import { Checker } from "luau-web-checker";
//   import { pluginLuauTypes } from "luau-web-checker/expressive-code";
//   const checker = Checker.create({ definitions: { "@api": api }, strict: true });
//   export default defineEcConfig({ plugins: [pluginLuauTypes({ checker: () => checker })] });
//
// Each identifier is wrapped in `.luau-hover[data-luau-type]` (or, when `link` returns one, an `a.luau-link` that also
// carries `data-luau-type`), and each marked error in `.luau-error[data-luau-error]`. The built-in tooltips show
// those attributes; turn them off to render your own. See snippets.ts for the conventions inside a block.

import type { AnnotationRenderOptions, ExpressiveCodePlugin } from "@expressive-code/core";
import { definePlugin, ExpressiveCodeAnnotation } from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";

import type { Checker, Diagnostic, Hover } from "./index.js";
import type { HoverView, TokenLines } from "./pretty.js";
import { hoverView } from "./pretty.js";
import { checkSnippet, hoverLabel, isDefinitionsFile, isTrivialHover } from "./snippets.js";
import { baseStyles, luauTypesStyleSettings } from "./styles.js";
import { tooltipScript } from "./tooltips.js";

export { CUT, checkSnippet, hoverLabel, isDefinitionsFile, isTrivialHover, SnippetError } from "./snippets.js";
export type { CheckedSnippet } from "./snippets.js";

/** Where an identifier links to, such as its page in an API reference. */
export interface HoverLink {
  readonly href: string;
  /** Extra attributes for the link, for a site's own hover cards (`{ "data-sym": "fn:print" }`). */
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface LuauTypesOptions {
  /** The checker for every block, with the site's definitions loaded. Called once per block; return a shared one. */
  readonly checker: () => Checker | Promise<Checker>;
  /** The code block languages to check (default `["luau"]`). */
  readonly languages?: readonly string[];
  /** A link for an identifier. `previous` is the identifier before it, to resolve `Namespace.member`. */
  readonly link?: (hover: Hover, previous: Hover | undefined) => HoverLink | undefined;
  /** Show the built-in tooltips (default `true`). Turn them off to render cards from the data attributes yourself. */
  readonly tooltips?: boolean;
  /**
   * Which blocks to check: every block of the languages (`"all"`, the default), or only blocks whose meta has `check`
   * (`"marked"`, opted into as Twoslash is), for a site that turns checking on page by page.
   */
  readonly check?: "all" | "marked";
  /** Hidden code checked before every block, such as the `require` lines the examples assume. */
  readonly prelude?: string;
}

type Rendered = ReturnType<ExpressiveCodeAnnotation["render"]>;
type HastElement = ReturnType<typeof h>;

function codeLines(className: string, lines: TokenLines): HastElement {
  const children = lines.flatMap((line, index) => [
    ...line.map((token) => (token.kind === "text" ? token.text : h(`span.luau-t-${token.kind}`, token.text))),
    ...(index < lines.length - 1 ? ["\n"] : []),
  ]);
  return h(`span.${className}`, children);
}

// The hover's highlighted view, hidden inside the identifier; the tooltip script shows a copy of it.
function popup(view: HoverView): HastElement {
  return h("span.luau-popup", { "aria-hidden": "true" }, [
    codeLines("luau-popup-main", view.main),
    ...(view.declared === undefined ? [] : [codeLines("luau-popup-declared", view.declared)]),
  ]);
}

class LuauHoverAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "luau-hover";
  readonly #label: string;
  readonly #view: HoverView;
  readonly #link: HoverLink | undefined;

  constructor(hover: Hover, link: HoverLink | undefined) {
    super({ inlineRange: { columnStart: hover.column - 1, columnEnd: hover.endColumn - 1 } });
    this.#label = hoverLabel(hover);
    this.#view = hoverView(hover);
    this.#link = link;
  }

  render({ nodesToTransform }: AnnotationRenderOptions): Rendered {
    const link = this.#link;
    return nodesToTransform.map((node) =>
      link === undefined
        ? h("span.luau-hover", { "data-luau-type": this.#label, tabindex: 0 }, [node, popup(this.#view)])
        : h("a.luau-link", { href: link.href, "data-luau-type": this.#label, ...link.attributes }, [
            node,
            popup(this.#view),
          ]),
    );
  }
}

class LuauErrorAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "luau-error";
  readonly #message: string;

  constructor(error: Diagnostic, lineText: string) {
    // A multi-line range is underlined on its first line only, and never over the `-- error` comment.
    const comment = lineText.search(/\s*--/u);
    const codeEnd = comment > error.column - 1 ? comment : lineText.length;
    const end = error.endLine === error.line ? Math.min(error.endColumn - 1, codeEnd) : codeEnd;
    const start = Math.min(error.column - 1, Math.max(lineText.length - 1, 0));
    super({ inlineRange: { columnStart: start, columnEnd: Math.max(end, start + 1) } });
    this.#message = `${error.kind}: ${error.message}`;
  }

  render({ nodesToTransform }: AnnotationRenderOptions): Rendered {
    return nodesToTransform.map((node) =>
      h("span.luau-error", { "data-luau-error": this.#message, tabindex: 0 }, [node]),
    );
  }
}

/**
 * Type-checks every Luau code block at build time and makes its identifiers hoverable. A block with an unmarked
 * error (or a `-- error` line without one) fails the build. Skip a block with the `nocheck` meta option; a block
 * with a top-level `declare` is a definitions file and is shown as written.
 */
export function pluginLuauTypes(options: LuauTypesOptions): ExpressiveCodePlugin {
  const languages: ReadonlySet<string> = new Set(options.languages ?? ["luau"]);
  const tooltips = options.tooltips ?? true;
  let blocks = 0;
  return definePlugin({
    name: "luau-types",
    styleSettings: luauTypesStyleSettings,
    baseStyles: (context) => baseStyles(context, tooltips),
    jsModules: tooltips ? [`(${tooltipScript.toString()})();`] : [],
    hooks: {
      async preprocessCode({ codeBlock }) {
        if (
          !languages.has(codeBlock.language) ||
          codeBlock.metaOptions.getBoolean("nocheck") === true ||
          (options.check === "marked" && codeBlock.metaOptions.getBoolean("check") !== true) ||
          isDefinitionsFile(codeBlock.code)
        ) {
          return;
        }
        blocks += 1;
        const checker = await options.checker();
        const checked = checkSnippet(checker, `block${String(blocks)}.luau`, codeBlock.code, options.prelude);

        if (checked.hidden > 0) {
          codeBlock.deleteLines(Array.from({ length: checked.hidden }, (_, index) => index));
        }
        let previous: Hover | undefined;
        for (const hover of checked.hovers) {
          const line = codeBlock.getLine(hover.line - 1);
          if (line !== undefined && hover.endLine === hover.line && !isTrivialHover(hover)) {
            line.addAnnotation(new LuauHoverAnnotation(hover, options.link?.(hover, previous)));
          }
          previous = hover;
        }
        for (const error of checked.errors) {
          const line = codeBlock.getLine(error.line - 1);
          if (line !== undefined) {
            line.addAnnotation(new LuauErrorAnnotation(error, line.text));
          }
        }
      },
    },
  });
}

// CodeMirror 6 for the playground: Lua highlighting, the checker's diagnostics as lint, hover types and completion.

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import type { Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { linter, lintGutter } from "@codemirror/lint";
import type { Extension, Text } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import type { HoverView, TokenLines } from "@luau-web-checker/checker/pretty";
import { hoverView } from "@luau-web-checker/checker/pretty";

import type { CheckerClient, Settings } from "./client.ts";

interface Position {
  readonly line: number;
  readonly column: number;
}

/** A document offset as a 1-based line and column. */
export function toPosition(doc: Text, offset: number): Position {
  const line = doc.lineAt(offset);
  return { line: line.number, column: offset - line.from + 1 };
}

/** A 1-based line and column as a document offset, clamped to the document. */
export function toOffset(doc: Text, position: Position): number {
  const line = doc.line(Math.min(Math.max(position.line, 1), doc.lines));
  return Math.min(line.from + position.column - 1, line.to);
}

export interface EditorHooks {
  readonly client: CheckerClient;
  readonly settings: () => Settings;
  readonly onChecked: (errors: number, warnings: number) => void;
  readonly onFailure: (message: string) => void;
}

const ERROR_KINDS: ReadonlySet<string> = new Set(["TypeError", "SyntaxError", "InternalCompilerError"]);

function lintSource(hooks: EditorHooks): Extension {
  return linter(
    async (view) => {
      const doc = view.state.doc;
      try {
        const diagnostics = await hooks.client.check(doc.toString(), hooks.settings());
        const errors = diagnostics.filter((d) => ERROR_KINDS.has(d.kind)).length;
        hooks.onChecked(errors, diagnostics.length - errors);
        return diagnostics.map((diagnostic): LintDiagnostic => {
          const from = toOffset(doc, diagnostic);
          const to = toOffset(doc, { line: diagnostic.endLine, column: diagnostic.endColumn });
          return {
            from,
            to: Math.max(to, from),
            severity: ERROR_KINDS.has(diagnostic.kind) ? "error" : "warning",
            message: diagnostic.message,
            source: diagnostic.kind,
          };
        });
      } catch (error) {
        hooks.onFailure(error instanceof Error ? error.message : String(error));
        return [];
      }
    },
    { delay: 300 },
  );
}

function renderLines(className: string, lines: TokenLines): HTMLElement {
  const block = document.createElement("div");
  block.className = className;
  lines.forEach((line, index) => {
    for (const token of line) {
      if (token.kind === "text") {
        block.append(token.text);
      } else {
        const span = document.createElement("span");
        span.className = `luau-t-${token.kind}`;
        span.textContent = token.text;
        block.append(span);
      }
    }
    if (index < lines.length - 1) {
      block.append("\n");
    }
  });
  return block;
}

// The same layout as the site's code-block tooltips: the expanded type, then the declared form underneath.
function renderHover(view: HoverView): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "pg-hover";
  dom.append(renderLines("pg-hover-main", view.main));
  if (view.declared !== undefined) {
    dom.append(renderLines("pg-hover-declared", view.declared));
  }
  return dom;
}

function hoverTypes(hooks: EditorHooks): Extension {
  return hoverTooltip(async (view, offset) => {
    const word = view.state.wordAt(offset);
    if (word === null) {
      return null;
    }
    const position = toPosition(view.state.doc, offset);
    const hover = await hooks.client.hover(view.state.doc.toString(), hooks.settings(), position.line, position.column);
    if (hover === undefined) {
      return null;
    }
    return {
      pos: word.from,
      end: word.to,
      above: true,
      create: () => ({ dom: renderHover(hoverView(hover)) }),
    };
  });
}

function completions(hooks: EditorHooks): (context: CompletionContext) => Promise<CompletionResult | null> {
  return async (context) => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/u);
    const trigger = context.matchBefore(/[.:]$/u);
    if (word === null && trigger === null && !context.explicit) {
      return null;
    }
    const position = toPosition(context.state.doc, context.pos);
    const entries = await hooks.client.complete(
      context.state.doc.toString(),
      hooks.settings(),
      position.line,
      position.column,
    );
    return {
      from: word?.from ?? context.pos,
      options: entries.map((entry): Completion => {
        const option: Completion = {
          label: entry.label,
          type: entry.kind === "property" ? "property" : entry.kind === "keyword" ? "keyword" : "variable",
        };
        if (entry.type !== undefined) {
          option.detail = entry.type.length > 80 ? `${entry.type.slice(0, 80)}...` : entry.type;
        }
        if (entry.deprecated) {
          option.boost = -10;
        }
        return option;
      }),
      validFor: /^[A-Za-z0-9_]*$/u,
    };
  };
}

// Colours come from CSS variables (playground.astro), so the editor follows Starlight's light and dark themes.
const theme = EditorView.theme({
  "&": { color: "var(--pg-text)", backgroundColor: "var(--pg-bg)" },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
  ".cm-content": { caretColor: "var(--pg-text)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--pg-text)" },
  ".cm-gutters": { color: "var(--pg-muted)", backgroundColor: "var(--pg-bg)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--pg-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--pg-active)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--pg-selection)",
  },
  ".cm-tooltip": {
    color: "var(--pg-text)",
    backgroundColor: "var(--pg-tooltip)",
    border: "1px solid var(--pg-border)",
    borderRadius: "0.3rem",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    color: "var(--pg-text)",
    backgroundColor: "var(--pg-selection)",
  },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword], color: "var(--pg-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--pg-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--pg-number)" },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--pg-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.function(tags.variableName), tags.standard(tags.variableName)],
    color: "var(--pg-function)",
  },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--pg-punctuation)" },
]);

export function editorExtensions(hooks: EditorHooks): Extension[] {
  return [
    theme,
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    indentOnInput(),
    indentUnit.of("\t"),
    bracketMatching(),
    closeBrackets(),
    StreamLanguage.define(lua),
    syntaxHighlighting(highlight),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    lintGutter(),
    lintSource(hooks),
    hoverTypes(hooks),
    autocompletion({ override: [completions(hooks)], activateOnTyping: true }),
  ];
}

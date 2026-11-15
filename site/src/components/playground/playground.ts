// Mounts the playground: the editor, its controls, and the URL hash that holds the code and settings, so a snippet can
// be shared without a server (#code=<base64url>&defs=example&strict=1).

import { forceLinting } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { Settings } from "./client.ts";
import { createClient } from "./client.ts";
import { editorExtensions } from "./editor.ts";
import { EXAMPLES } from "./examples.ts";
import type { Definitions } from "./protocol.ts";

function encode(code: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(code)) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decode(value: string): string | undefined {
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0));
  } catch {
    return undefined;
  }
}

interface State {
  code: string;
  definitions: Definitions;
  strict: boolean;
}

function readHash(): State {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get("code");
  const decoded = code === null ? undefined : decode(code);
  const fallback = EXAMPLES[0];
  return {
    code: decoded ?? fallback?.code ?? "",
    definitions:
      params.get("defs") === "example"
        ? "example"
        : ((decoded === undefined ? fallback?.definitions : undefined) ?? "none"),
    strict: params.get("strict") !== "0",
  };
}

function writeHash(state: State): void {
  const params = new URLSearchParams({
    code: encode(state.code),
    defs: state.definitions,
    strict: state.strict ? "1" : "0",
  });
  window.history.replaceState(null, "", `#${params.toString()}`);
}

function element<T extends HTMLElement>(root: HTMLElement, selector: string, type: new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) {
    throw new TypeError(`playground: ${selector} is missing`);
  }
  return found;
}

export function mountPlayground(root: HTMLElement): void {
  const host = element(root, ".pg-editor", HTMLDivElement);
  const exampleSelect = element(root, "select[name=example]", HTMLSelectElement);
  const definitionsSelect = element(root, "select[name=definitions]", HTMLSelectElement);
  const strictBox = element(root, "input[name=strict]", HTMLInputElement);
  const share = element(root, "button[name=share]", HTMLButtonElement);
  const status = element(root, ".pg-status", HTMLSpanElement);

  const state = readHash();
  definitionsSelect.value = state.definitions;
  strictBox.checked = state.strict;
  for (const example of EXAMPLES) {
    exampleSelect.add(new Option(example.label, example.id));
  }

  const settings = (): Settings => ({ definitions: state.definitions, strict: state.strict });
  status.textContent = "Loading the checker...";

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: state.code,
      extensions: [
        ...editorExtensions({
          client: createClient(),
          settings,
          onChecked: (errors, warnings) => {
            const parts = [
              errors === 0 ? "No errors" : `${String(errors)} ${errors === 1 ? "error" : "errors"}`,
              ...(warnings === 0
                ? []
                : [`${String(warnings)} ${warnings === 1 ? "warning" : "warnings"}`]),
            ];
            status.textContent = `${parts.join(", ")} · Luau 0.740, new solver`;
            status.dataset["state"] = errors === 0 ? "ok" : "error";
          },
          onFailure: (message) => {
            status.textContent = `The checker failed: ${message}`;
            status.dataset["state"] = "error";
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            state.code = update.state.doc.toString();
            writeHash(state);
          }
        }),
      ],
    }),
  });

  const recheck = (): void => {
    writeHash(state);
    forceLinting(view);
  };

  exampleSelect.addEventListener("change", () => {
    const example = EXAMPLES.find((entry) => entry.id === exampleSelect.value);
    if (example !== undefined) {
      state.definitions = example.definitions;
      definitionsSelect.value = example.definitions;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: example.code } });
      recheck();
    }
  });
  definitionsSelect.addEventListener("change", () => {
    state.definitions = definitionsSelect.value === "example" ? "example" : "none";
    recheck();
  });
  strictBox.addEventListener("change", () => {
    state.strict = strictBox.checked;
    recheck();
  });
  share.addEventListener("click", () => {
    copyLink(share).catch(() => {
      share.textContent = "Copy failed";
    });
  });
}

async function copyLink(button: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(window.location.href);
  button.textContent = "Link copied";
  window.setTimeout(() => {
    button.textContent = "Copy link";
  }, 1500);
}

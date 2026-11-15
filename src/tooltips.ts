// The built-in hover tooltips for checked code blocks: a small script and its styles, which the Expressive Code plugin
// adds to every page that has a block. The script must stay self-contained (no imports, no outer variables), because
// it is shipped as its source text.

/** Shows a tooltip for `[data-luau-type]` and `[data-luau-error]` on hover or keyboard focus. */
export function tooltipScript(): void {
  const selector = "[data-luau-type], [data-luau-error]";
  const gap = 6;
  let tip: HTMLDivElement | undefined;
  let current: HTMLElement | undefined;

  const target = (node: EventTarget | null): HTMLElement | undefined => {
    if (!(node instanceof Element)) {
      return undefined;
    }
    // An error underline wins over the identifier it covers.
    const found = node.closest("[data-luau-error]") ?? node.closest(selector);
    return found instanceof HTMLElement ? found : undefined;
  };

  const hide = (): void => {
    current = undefined;
    if (tip !== undefined) {
      tip.hidden = true;
    }
  };

  const show = (anchor: HTMLElement): void => {
    const block = anchor.closest(".expressive-code") ?? document.body;
    tip ??= document.createElement("div");
    if (tip.parentElement !== block) {
      block.append(tip);
    }
    current = anchor;
    const error = anchor.dataset["luauError"];
    tip.className = error === undefined ? "luau-tooltip" : "luau-tooltip luau-tooltip-error";
    tip.setAttribute("role", "tooltip");
    tip.textContent = error ?? anchor.dataset["luauType"] ?? "";
    tip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const below = rect.bottom + gap + height <= window.innerHeight || rect.top < height + gap;
    tip.style.left = `${String(Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)))}px`;
    tip.style.top = `${String(below ? rect.bottom + gap : rect.top - height - gap)}px`;
  };

  const onOver = (event: Event): void => {
    const anchor = target(event.target);
    if (anchor !== undefined && anchor !== current) {
      show(anchor);
    }
  };
  const onOut = (event: Event): void => {
    const next = event instanceof FocusEvent || event instanceof PointerEvent ? event.relatedTarget : null;
    if (current !== undefined && target(next) !== current) {
      hide();
    }
  };

  document.addEventListener("pointerover", onOver);
  document.addEventListener("pointerout", onOut);
  document.addEventListener("focusin", onOver);
  document.addEventListener("focusout", onOut);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
    }
  });
  window.addEventListener("scroll", hide, { passive: true });
}

/** Styles for the hoverable identifiers, error underlines and tooltips (scoped to code blocks by Expressive Code). */
export const BASE_STYLES = `
  .luau-hover, .luau-link { cursor: help; color: inherit; text-decoration: none; }
  .luau-hover:hover, .luau-hover:focus-visible, .luau-link:hover, .luau-link:focus-visible {
    text-decoration: underline dotted; text-underline-offset: 3px;
  }
  .luau-error {
    cursor: help;
    text-decoration: underline wavy #f85149; text-decoration-skip-ink: none; text-underline-offset: 3px;
  }
`;

export const TOOLTIP_STYLES = `
  .luau-tooltip {
    position: fixed; z-index: 100; max-width: min(40rem, calc(100vw - 16px)); max-height: 16rem; overflow: auto;
    margin: 0; padding: 0.4rem 0.6rem; border: 1px solid #3d444d; border-radius: 0.3rem;
    background: #151b23; color: #e6edf3; box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
    font-family: var(--ec-codeFontFml, ui-monospace, monospace); font-size: 0.8rem; line-height: 1.45;
    white-space: pre-wrap; pointer-events: none;
  }
  .luau-tooltip[hidden] { display: none; }
  .luau-tooltip-error { border-color: #f85149; }
`;

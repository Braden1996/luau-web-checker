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
    if (tip === undefined) {
      // On <body>, so no code block's stacking context can paint over it; the host carries Expressive Code's class
      // (and the block's theme), so the plugin's scoped styles and theme colours still apply.
      const host = document.createElement("div");
      host.className = "expressive-code luau-tooltip-host";
      tip = document.createElement("div");
      host.append(tip);
      document.body.append(host);
    }
    const theme = anchor.closest(".expressive-code")?.getAttribute("data-theme");
    if (theme === null || theme === undefined) {
      tip.parentElement?.removeAttribute("data-theme");
    } else {
      tip.parentElement?.setAttribute("data-theme", theme);
    }
    current = anchor;
    const error = anchor.dataset["luauError"];
    tip.className = error === undefined ? "luau-tooltip" : "luau-tooltip luau-tooltip-error";
    tip.setAttribute("role", "tooltip");
    // The highlighted view is pre-rendered at build time, hidden inside the identifier; fall back to the plain label.
    const popup = error === undefined ? anchor.querySelector(":scope > .luau-popup") : null;
    if (popup === null) {
      tip.textContent = error ?? anchor.dataset["luauType"] ?? "";
    } else {
      tip.replaceChildren(...[...popup.childNodes].map((node) => node.cloneNode(true)));
    }
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

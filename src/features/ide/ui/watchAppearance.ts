import { APPEARANCE_ATTRIBUTES } from "@/shared/config/theme";

// What a surface's `--osio-*` tokens resolve from: the root's data-theme/data-palette/accent and
// inline custom theme, the nearest `data-code-theme` card toggle, and the OS colour scheme. Kept
// apart from monacoTheme.ts so the dock can follow the theme without loading Monaco.

/** Calls `onChange` whenever what `host` resolves its tokens from can have changed; returns the unsubscribe. */
export function watchAppearance(host: HTMLElement, onChange: () => void): () => void {
  const rerun = () => { if (host.isConnected) onChange(); };
  const rootObserver = new MutationObserver(rerun);
  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", ...APPEARANCE_ATTRIBUTES] });
  const card = host.closest<HTMLElement>("[data-code-theme]");
  const cardObserver = card ? new MutationObserver(rerun) : null;
  cardObserver?.observe(card as HTMLElement, { attributes: true, attributeFilter: ["data-code-theme"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", rerun);
  return () => {
    rootObserver.disconnect();
    cardObserver?.disconnect();
    scheme.removeEventListener("change", rerun);
  };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoTheme.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { editor } from "../model/monacoRuntime";
import { buildEditorTheme, resolveEditorColors, SYNTAX_KEYS, type EditorTokenInput, type SyntaxKey } from "./editorPalette";

// The browser half of the palette bridge (editorPalette.ts is the pure half).
// Tokens are read from the EDITOR HOST's computed style, not from :root — the
// `--osio-code-*` chrome tokens are scoped to the code card and the syntax set
// changes per palette/theme — then the theme is (re)defined whenever anything
// that can change those values changes: the root's data-theme/data-palette, the
// nearest `data-code-theme` card toggle, or the OS color scheme.

export const OSIO_THEME = "osio";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** First painted (non-transparent) background at or above `el`. */
function effectiveBackground(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "transparent" && !/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(bg)) return bg;
  }
  return "";
}

function readTokens(host: HTMLElement): EditorTokenInput {
  const style = getComputedStyle(host);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const syntax = {} as Record<SyntaxKey, string>;
  for (const key of SYNTAX_KEYS) syntax[key] = token(`--osio-syntax-${key}`);
  return {
    bg: token("--osio-code-bg"),
    fg: token("--osio-code-fg"),
    fgMuted: token("--osio-code-fg-muted"),
    border: token("--osio-code-border"),
    chipBg: token("--osio-code-chip-bg"),
    headerBg: token("--osio-code-header-bg"),
    accent: token("--osio-accent"),
    danger: token("--osio-danger"),
    warning: token("--osio-warning"),
    selection: token("--osio-code-selection"),
    activeLine: token("--osio-code-active-line"),
    bracket: token("--osio-code-bracket"),
    syntax,
    effectiveBg: effectiveBackground(host),
    effectiveFg: style.color,
  };
}

/** The monospace stack the editor should use, resolved from the same host. */
export function editorFontFamily(host: HTMLElement): string {
  const mono = getComputedStyle(host).getPropertyValue("--osio-font-mono").trim();
  return mono || MONO_FALLBACK;
}

/** Define + activate the "osio" theme from what the host currently resolves. */
export function applyEditorTheme(host: HTMLElement): void {
  editor.defineTheme(OSIO_THEME, buildEditorTheme(resolveEditorColors(readTokens(host))));
  editor.setTheme(OSIO_THEME);
}

/** Apply now and keep following palette/theme changes; returns the unsubscribe. */
export function watchEditorTheme(host: HTMLElement): () => void {
  applyEditorTheme(host);
  const rerun = () => { if (host.isConnected) applyEditorTheme(host); };
  const rootObserver = new MutationObserver(rerun);
  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", "style"] });
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

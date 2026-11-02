import type { CodeTheme } from "@/features/ide/model/codeTheme";
import { codeThemeFromTokens } from "@/features/ide/model/codeThemeFromTokens";
import { terminalColorsFrom, type TerminalColors } from "@/features/ide/model/terminalPort";

/** The whole code theme of `host`'s tokens, null when a token does not resolve to a colour. */
export function dockTheme(host: HTMLElement): CodeTheme | null {
  const css = getComputedStyle(host);
  return codeThemeFromTokens((name) => css.getPropertyValue(name).trim());
}

/** The dock's code colours, as hex, for VS Code's terminal page to paint with (desktop and web). */
export function dockColors(host: HTMLElement): TerminalColors {
  const css = getComputedStyle(host);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return terminalColorsFrom({
    background: read("--osio-code-bg"),
    foreground: read("--osio-code-fg"),
    cursor: read("--osio-code-caret"),
    selection: read("--osio-code-selection"),
  });
}

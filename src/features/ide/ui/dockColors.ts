import { terminalColorsFrom, type TerminalColors } from "@/features/ide/model/terminalPort";

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

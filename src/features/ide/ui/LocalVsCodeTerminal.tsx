import React from "react";

import type { LocalPtyApi } from "@/features/ide/model/localPty";
import { handOffTerminalPort, terminalColorsFrom } from "@/features/ide/model/terminalPort";

/** The page the desktop shell serves at app://osionos/terminal/ (groot ADR 0038). */
export const TERMINAL_PAGE_SRC = "/terminal/index.html";

function dockColors(host: HTMLElement) {
  const css = getComputedStyle(host);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return terminalColorsFrom({
    background: read("--osio-code-bg"),
    foreground: read("--osio-code-fg"),
    cursor: read("--osio-code-caret"),
    selection: read("--osio-code-selection"),
  });
}

/** VS Code's own terminal on a shell on this computer, in the desktop app's dock. The page gets
 *  the shell only through the port handed to this frame (devil amendment A1); unmounting, or the
 *  frame reloading, kills the shells it had. */
export const LocalVsCodeTerminal: React.FC<{ api: LocalPtyApi }> = ({ api }) => {
  const frameRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let stop: (() => void) | null = null;
    // Each load is a fresh page, so the previous one's shells end. Only the terminal page itself is
    // handed a port, never the frame's first about:blank.
    const holdsTerminalPage = () => frame.contentWindow?.location.pathname === TERMINAL_PAGE_SRC;
    const handOff = () => {
      stop?.();
      stop = null;
      if (frame.contentWindow && holdsTerminalPage()) {
        stop = handOffTerminalPort(frame.contentWindow, api, location.origin, dockColors(frame));
      }
    };
    frame.addEventListener("load", handOff);
    if (frame.contentDocument?.readyState === "complete" && holdsTerminalPage()) handOff();
    return () => {
      frame.removeEventListener("load", handOff);
      stop?.();
    };
  }, [api]);

  return (
    <div className="relative min-h-0 flex-1" data-osio-terminal>
      <iframe
        ref={frameRef}
        src={TERMINAL_PAGE_SRC}
        title="Terminal"
        className="absolute inset-0 h-full w-full border-0 bg-[var(--osio-code-bg)]"
      />
    </div>
  );
};

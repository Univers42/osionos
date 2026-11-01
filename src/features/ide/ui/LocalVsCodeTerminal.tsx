import React from "react";

import type { LocalPtyApi } from "@/features/ide/model/localPty";
import { handOffTerminalPort, refusePtyPort, type PortOffer, type PtyPortRouter } from "@/features/ide/model/ptyPortRouter";
import { terminalColorsFrom } from "@/features/ide/model/terminalPort";

/** The terminal page, on its own origin so it runs in its own renderer process (groot ADR 0039). */
export const TERMINAL_PAGE_SRC = "app://terminal/index.html";

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

/** VS Code's own terminal on shells on this computer, in the desktop app's dock. The page gets a
 *  shell only through the control port handed to this frame (A1), and each shell's port only through
 *  this panel's router (T1). Unmounting, or the frame loading again, kills the shells it had. */
export const LocalVsCodeTerminal: React.FC<{ api: LocalPtyApi }> = ({ api }) => {
  const router = React.useRef<PtyPortRouter | null>(null);

  // Each load is a fresh page, so the previous one's shells end. The frame is cross-origin: the
  // handoff's targetOrigin, not a read of its location, keeps the port from any other document.
  const handOff = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget;
    router.current?.stop();
    router.current = frame.contentWindow ? handOffTerminalPort(frame.contentWindow, api, dockColors(frame), window) : null;
  };

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const offer = event as unknown as PortOffer;
      if (router.current) router.current.offer(offer);
      else refusePtyPort(offer);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      router.current?.stop();
      router.current = null;
    };
  }, [api]);

  return (
    <div className="relative min-h-0 flex-1" data-osio-terminal>
      <iframe
        src={TERMINAL_PAGE_SRC}
        title="Terminal"
        allow="clipboard-read; clipboard-write"
        onLoad={handOff}
        className="absolute inset-0 h-full w-full border-0 bg-[var(--osio-code-bg)]"
      />
    </div>
  );
};

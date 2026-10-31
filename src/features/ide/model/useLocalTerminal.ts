import { useEffect } from "react";

import type { LocalPtyApi } from "./localPty";
import { createLocalTerminalSession, type LocalTerminalSurface } from "./localTerminalSession";

/** A shell on this computer behind `term` while it is mounted; killed on unmount. Null `term`
 *  or `api` (the web app, or xterm not open yet) does nothing. */
export function useLocalTerminal(term: LocalTerminalSurface | null, api: LocalPtyApi | null): void {
  useEffect(() => {
    if (!term || !api) return;
    const session = createLocalTerminalSession({ api, term });
    return () => session.dispose();
  }, [term, api]);
}

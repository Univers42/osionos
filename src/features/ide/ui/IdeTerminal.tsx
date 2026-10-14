/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeTerminal.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useUserStore } from "@/features/auth";
import { useIdeTerminal } from "@/features/ide/model/useIdeTerminal";
import { isSandboxReachable, useSandboxHealthStore } from "@/features/ide/model/sandboxHealthStore";
import { SandboxUnavailable } from "./SandboxUnavailable";

// Ponytail: read once when the terminal opens. The dock is always the dark code
// theme so nothing changes under an open terminal today, but a code-theme switch
// would not reach it; an unset token falls back to xterm's own default colour.
function codeTheme(host: HTMLElement): ITheme {
  const css = getComputedStyle(host);
  const read = (name: string) => css.getPropertyValue(name).trim() || undefined;
  return {
    // Opaque on purpose: xterm 6 has no allowTransparency, and the surface it
    // paints (.xterm-scrollable-element) is what shows through the viewport.
    background: read("--osio-code-bg"),
    foreground: read("--osio-code-fg"),
    cursor: read("--osio-code-caret"),
    selectionBackground: read("--osio-code-selection"),
  };
}

/** xterm.js terminal over the sandbox PTY (P3). Lazy-loaded from IdeBottomStrip
 *  so xterm never lands in the warm IDE chunk — it loads on first terminal open.
 *  The transport (WS + resize) is useIdeTerminal; this file owns the emulator. */
export const IdeTerminal: React.FC<{ termId?: string }> = ({ termId = "0" }) => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const hostRef = React.useRef<HTMLDivElement>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const [term, setTerm] = React.useState<Terminal | null>(null);

  React.useEffect(() => {
    if (!hostRef.current) return;
    const t = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'var(--osio-font-family-mono)',
      scrollback: 5000,
      theme: codeTheme(hostRef.current),
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(hostRef.current);
    fit.fit();
    fitRef.current = fit;
    setTerm(t);
    return () => { t.dispose(); setTerm(null); };
  }, []);

  React.useEffect(() => {
    if (!term || !hostRef.current) return;
    const ro = new ResizeObserver(() => { try { fitRef.current?.fit(); } catch { /* detached */ } });
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, [term]);

  const { closedReason, reconnect } = useIdeTerminal(term, workspaceId, termId);
  const reachable = useSandboxHealthStore((s) => isSandboxReachable(s.state));

  return (
    <div className="relative min-h-0 flex-1" data-osio-terminal>
      {/* Inset from the right and bottom by the card's corner so the scrollbar
          is not cut by the dock's radius (a quarter of it below, half beside:
          enough for any roundness setting). Text padding lives on .xterm. */}
      <div ref={hostRef} className="absolute left-0 top-0 right-[calc(var(--osio-radius-pane)/2)] bottom-[calc(var(--osio-radius-pane)/4)]" />
      {(!reachable || closedReason !== null) && (
        <div className="absolute inset-0">
          <SandboxUnavailable onRetried={(next) => { if (isSandboxReachable(next)) reconnect(); }} />
        </div>
      )}
    </div>
  );
};

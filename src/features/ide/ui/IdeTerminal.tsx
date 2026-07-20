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
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useUserStore } from "@/features/auth";
import { useIdeTerminal } from "@/features/ide/model/useIdeTerminal";

/** xterm.js terminal over the sandbox PTY (P3). Lazy-loaded from IdeBottomStrip
 *  so xterm never lands in the warm IDE chunk — it loads on first terminal open.
 *  The transport (WS + resize) is useIdeTerminal; this file owns the emulator. */
export const IdeTerminal: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const hostRef = React.useRef<HTMLDivElement>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const [term, setTerm] = React.useState<Terminal | null>(null);

  React.useEffect(() => {
    if (!hostRef.current) return;
    const t = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'var(--osio-code-font, "JetBrains Mono", ui-monospace, monospace)',
      scrollback: 5000,
      theme: { background: "#00000000" }, // inherit the panel's --osio-code-bg
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

  const status = useIdeTerminal(term, workspaceId);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={hostRef} className="absolute inset-0 px-2 py-1" />
      {status === "unavailable" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-[var(--osio-code-fg-muted)]">
          Sign in and enable the workspace sandbox (OSIONOS_IDE_SANDBOX) to use the terminal.
        </div>
      )}
    </div>
  );
};

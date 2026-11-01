// The web dock's terminal, in place (owner 2026-11-01; groot ADR 0041): VS Code's own terminal panel,
// served by this computer's osionos-node and framed here, on this computer's shells. No second
// window. Until the first shell runs the dock shows a calm state over the frame, never a blank one;
// when the node does not answer it says why in plain words (terminalFrame.ts). The frame is the
// node's origin: only it opens the shell sockets, and the app never touches one.
import React from "react";

import { CONNECTOR_DOWNLOAD_URL } from "@/features/machines/model/connector";
import { TERMINAL_PAGE_URL, terminalFramePanel } from "@/features/machines/model/terminalFrame";
import { startTerminalFrame, useTerminalFrameStore } from "@/features/machines/model/terminalFrameStore";
import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { dockColors } from "./dockColors";
import { MachineFramePanel } from "./MachineFramePanel";
import { probeOldNode } from "@/features/machines/model/oldNodeProbe";

export const NodeVsCodeTerminal: React.FC = () => {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const phase = useTerminalFrameStore((state) => state.phase);

  React.useEffect(() => startTerminalFrame({
    frame: () => frameRef.current?.contentWindow ?? null,
    colors: () => (frameRef.current ? dockColors(frameRef.current) : {}),
    probeOldNode,
    // The page focuses VS Code's terminal inside; the frame itself must hold the page's focus.
    onConnected: () => frameRef.current?.focus(),
  }), [attempt]);

  const panel = terminalFramePanel(phase === "idle" ? "connecting" : phase, CONNECTOR_DOWNLOAD_URL);
  return (
    <div className="relative min-h-0 flex-1" data-osio-terminal>
      <iframe
        key={attempt}
        ref={frameRef}
        src={TERMINAL_PAGE_URL}
        title="Terminal"
        // Paste needs clipboard-read on this cross-origin frame (measured 2026-11-01: refused without
        // it); OSC 52 clipboard reads from the shell stay dropped by the page (W13).
        allow="local-network-access; clipboard-read; clipboard-write"
        className="absolute inset-0 h-full w-full border-0 bg-[var(--osio-code-bg)]"
      />
      {panel && <MachineFramePanel panel={panel} waiting={phase === "idle" || phase === "connecting"} pairing={phase === "no-node" || phase === "other-account"} onTryAgain={() => setAttempt((n) => n + 1)} />}
      {/* The store opens the emailed-code prompt on a step-up; it renders only where it is mounted. */}
      {phase === "step-up" && <SudoPrompt />}
    </div>
  );
};

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
import { LOCAL_NODE_ORIGIN, NODE_FRAME_PERMISSIONS } from "@/features/machines/model/machineWindow";
import { frameAllow } from "@/shared/lib/dom/frameAllow";
import { TERMINAL_THEME_MESSAGE } from "@/features/machines/model/terminalFrame";
import { dockColors, dockTheme } from "./dockColors";
import { watchAppearance } from "./watchAppearance";
import { MachineFramePanel } from "./MachineFramePanel";
import { probeOldNode } from "@/features/machines/model/oldNodeProbe";
import { RememberComputerChoice } from "@/features/machines/ui/RememberComputerChoice";

export const NodeVsCodeTerminal: React.FC = () => {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const phase = useTerminalFrameStore((state) => state.phase);

  React.useEffect(() => startTerminalFrame({
    frame: () => frameRef.current?.contentWindow ?? null,
    colors: () => (frameRef.current ? dockColors(frameRef.current) : {}),
    theme: () => (frameRef.current ? dockTheme(frameRef.current) : null),
    probeOldNode,
    // The page focuses VS Code's terminal inside; the frame itself must hold the page's focus.
    onConnected: () => frameRef.current?.focus(),
  }), [attempt]);

  // A theme picked in Settings repaints a running terminal; its shells keep running.
  React.useEffect(() => {
    const host = frameRef.current;
    if (!host) return undefined;
    return watchAppearance(host, () => {
      const theme = dockTheme(host);
      if (theme) host.contentWindow?.postMessage({ type: TERMINAL_THEME_MESSAGE, theme }, LOCAL_NODE_ORIGIN);
    });
  }, [attempt]);

  const panel = terminalFramePanel(phase === "idle" ? "connecting" : phase, CONNECTOR_DOWNLOAD_URL);
  return (
    <div className="relative min-h-0 flex-1" data-osio-terminal>
      <iframe
        key={attempt}
        ref={frameRef}
        src={TERMINAL_PAGE_URL}
        title="Terminal"
        // OSC 52 clipboard reads from the shell stay dropped by the page (W13).
        allow={frameAllow(NODE_FRAME_PERMISSIONS)}
        className="absolute inset-0 h-full w-full border-0 bg-[var(--osio-code-bg)]"
      />
      {panel && <MachineFramePanel panel={panel} waiting={phase === "idle" || phase === "connecting"} pairing={phase === "no-node" || phase === "other-account"} onTryAgain={() => setAttempt((n) => n + 1)} />}
      {/* The store opens the emailed-code prompt on a step-up; it renders only where it is mounted. */}
      {phase === "step-up" && <SudoPrompt extra={<RememberComputerChoice />} />}
    </div>
  );
};

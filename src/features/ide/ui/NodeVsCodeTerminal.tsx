// The web dock's terminal, in place (owner 2026-11-01; groot ADR 0041): VS Code's own terminal panel,
// served by this computer's osionos-node and framed here, on this computer's shells. No second
// window. Until the first shell runs the dock shows a calm state over the frame, never a blank one;
// when the node does not answer it says why in plain words (terminalFrame.ts). The frame is the
// node's origin: only it opens the shell sockets, and the app never touches one.
import React from "react";
import { Laptop, LoaderCircle } from "lucide-react";
import { Button } from "@/shared/ui";

import { readIdeMessage } from "@/features/ide/vscode/ideFrameProtocol";
import { CONNECTOR_DOWNLOAD_URL } from "@/features/machines/model/connector";
import { LOCAL_NODE_ORIGIN, READY_TIMEOUT_MS } from "@/features/machines/model/machineWindow";
import { OLD_NODE_PROBE_URL, TERMINAL_PAGE_URL, terminalFramePanel, type TerminalFramePanel } from "@/features/machines/model/terminalFrame";
import { startTerminalFrame, useTerminalFrameStore } from "@/features/machines/model/terminalFrameStore";
import { openSettings } from "@/features/settings/model/settingsNav";
import { dockColors } from "./dockColors";
import { CODE_BUTTON, StateBlock } from "./ExplorerStates";

// The node's IDE page answers ready from its light entry, which READY_TIMEOUT_MS was measured on
// (machineWindow.ts). A node too old for /terminal/ still serves it, so an answer there means "update".
function probeOldNode(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = document.createElement("iframe");
    probe.hidden = true;
    probe.title = "osionos Connector check";
    probe.src = OLD_NODE_PROBE_URL;
    const done = (answer: boolean) => {
      clearTimeout(timer);
      globalThis.removeEventListener("message", onMessage);
      probe.remove();
      resolve(answer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source === probe.contentWindow && readIdeMessage(event.data, event.origin, LOCAL_NODE_ORIGIN)?.type === "osionos-ide/ready") done(true);
    };
    globalThis.addEventListener("message", onMessage);
    const timer = setTimeout(() => done(false), READY_TIMEOUT_MS);
    document.body.append(probe);
  });
}

const PanelActions: React.FC<{ panel: TerminalFramePanel; onTryAgain: () => void }> = ({ panel, onTryAgain }) => (
  <>
    {panel.download && (
      <Button size="sm" tone="primary" className={CODE_BUTTON} onClick={() => globalThis.open(panel.download ?? "", "_blank", "noopener")}>Download osionos Connector</Button>
    )}
    {panel.pair && <Button size="sm" tone="primary" className={CODE_BUTTON} onClick={() => openSettings("machines")}>Open Settings › Machines</Button>}
    {panel.tryAgain && <Button size="sm" className={CODE_BUTTON} onClick={onTryAgain}>Try again</Button>}
  </>
);

const FramePanel: React.FC<{ panel: TerminalFramePanel; waiting: boolean; onTryAgain: () => void }> = ({ panel, waiting, onTryAgain }) => (
  <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center overflow-auto bg-[var(--osio-code-bg)]">
    <StateBlock icon={waiting ? LoaderCircle : Laptop} title={panel.title} tone="code" actions={<PanelActions panel={panel} onTryAgain={onTryAgain} />}>
      {panel.detail && <p>{panel.detail}</p>}
    </StateBlock>
  </div>
);

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
      {panel && <FramePanel panel={panel} waiting={phase === "idle" || phase === "connecting" || phase === "step-up"} onTryAgain={() => setAttempt((n) => n + 1)} />}
    </div>
  );
};

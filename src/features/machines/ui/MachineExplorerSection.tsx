// The Explorer's machine section: a frame of the node's own page, which holds the folders. Nothing
// loads until the person asks, so opening the app never triggers the browser's local-network prompt
// or an emailed code; a browser that already allowed it reconnects on its own.
import React from "react";

import { MachineFramePanel } from "@/features/ide/ui/MachineFramePanel";
import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { useWorkbenchDockOpener } from "../model/machineDock";
import { CONNECTOR_DOWNLOAD_URL } from "../model/connector";
import { EDITOR_OPEN_TAB, EDITOR_PICK, EDITOR_SHOW_TERMINAL, type EditorToApp } from "../model/editorFrameProtocol";
import { EDITOR_FRAME_PERMISSIONS, EDITOR_PAGE_URL, useEditorFrame } from "../model/editorFrame";
import { openMachineFile } from "../model/machineFileTab";
import { useMachineExplorer } from "../model/machineExplorerStore";
import { terminalFramePanel } from "../model/terminalFrame";
import { localNetwork } from "../model/terminalFrameStore";

export const MachineExplorerSection: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const used = useMachineExplorer((state) => state.used);
  const markUsed = useMachineExplorer((state) => state.markUsed);
  const openFolderRequests = useMachineExplorer((state) => state.openFolderRequests);
  const openTerminal = useWorkbenchDockOpener();
  const asked = React.useRef(false);
  const [allowed, setAllowed] = React.useState(false);
  // Folding the section keeps the frame, so its tree, connection and open folders survive.
  const [everOpened, setEverOpened] = React.useState(false);
  const handled = React.useRef(openFolderRequests);

  // Past the first use, reconnect quietly only where the browser will not ask anything.
  React.useEffect(() => {
    if (!used) return;
    void localNetwork().then((state) => { if (state !== "prompt" && state !== "denied") setAllowed(true); });
  }, [used]);

  const opened = !collapsed;
  React.useEffect(() => {
    if (!opened) return;
    asked.current = true;
    markUsed();
    setAllowed(true);
    setEverOpened(true);
  }, [opened, markUsed]);

  const onMessage = React.useCallback((message: EditorToApp) => {
    if (message.type === EDITOR_OPEN_TAB) openMachineFile(message.key, message.title);
    else if (message.type === EDITOR_SHOW_TERMINAL) openTerminal();
  }, [openTerminal]);
  const mayPromptStepUp = React.useCallback(() => asked.current, []);

  const armed = allowed && everOpened;
  const { frameRef, attempt, phase, ready, post, tryAgain } = useEditorFrame({ armed, mayPromptStepUp, onMessage });

  React.useEffect(() => {
    if (!ready || handled.current === openFolderRequests) return;
    handled.current = openFolderRequests;
    post({ type: EDITOR_PICK });
  }, [ready, openFolderRequests, post]);

  const panel = phase === "idle" ? null : terminalFramePanel(phase, CONNECTOR_DOWNLOAD_URL);
  if (!armed) return null;
  return (
    <div className="relative h-full min-h-0 w-full flex-1">
      <iframe
        key={attempt}
        ref={frameRef}
        src={`${EDITOR_PAGE_URL}?view=explorer`}
        title="Folders on this computer"
        allow={EDITOR_FRAME_PERMISSIONS}
        className="absolute inset-0 h-full w-full border-0 bg-transparent"
      />
      {panel && <MachineFramePanel tone="sidebar" panel={panel} waiting={phase === "connecting"} pairing={phase === "no-node" || phase === "other-account"} onTryAgain={tryAgain} />}
      {phase === "step-up" && <SudoPrompt />}
    </div>
  );
};

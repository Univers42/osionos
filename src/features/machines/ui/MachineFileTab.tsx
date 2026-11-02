// A tab holding a file from this computer: one frame of the node's editor page per pane, so moving
// between such tabs keeps the frame and swaps the file. The tab's title comes from the page, and is
// only ever a base name; the file itself never enters the app.
import React from "react";

import { MachineFramePanel } from "@/features/ide/ui/MachineFramePanel";
import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { CONNECTOR_DOWNLOAD_URL } from "../model/connector";
import { EDITOR_FRAME_PERMISSIONS, EDITOR_PAGE_URL, useEditorFrame } from "../model/editorFrame";
import { EDITOR_OPEN, EDITOR_TITLE, type EditorToApp } from "../model/editorFrameProtocol";
import { markMachineFile } from "../model/machineFileTab";
import { terminalFramePanel } from "../model/terminalFrame";

const onMessage = (message: EditorToApp): void => {
  if (message.type === EDITOR_TITLE) markMachineFile(message.key, message.title, message.dirty);
};
const mayPrompt = (): boolean => true;

export const MachineFileTab: React.FC<{ fileKey: string }> = ({ fileKey }) => {
  const { frameRef, attempt, phase, ready, post, tryAgain } = useEditorFrame({ armed: true, mayPromptStepUp: mayPrompt, onMessage });

  React.useEffect(() => {
    if (ready) post({ type: EDITOR_OPEN, key: fileKey });
  }, [ready, fileKey, post]);

  const panel = phase === "idle" ? null : terminalFramePanel(phase, CONNECTOR_DOWNLOAD_URL);
  return (
    <div className="relative h-full min-h-0 w-full bg-[var(--osio-code-bg)]">
      <iframe key={attempt} ref={frameRef} src={`${EDITOR_PAGE_URL}?view=file`} title="File on this computer" allow={EDITOR_FRAME_PERMISSIONS} className="absolute inset-0 h-full w-full border-0" />
      {panel && <MachineFramePanel panel={panel} waiting={phase === "connecting"} pairing={false} onTryAgain={tryAgain} />}
      {phase === "step-up" && <SudoPrompt />}
    </div>
  );
};

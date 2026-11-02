// The page osionos-node serves at /editor/ (devil verdict 2026-11-01 editor on disk): the Explorer's
// machine section with `?view=explorer`, one editor with `?view=file`. Both link to the app the way
// the terminal page does. Framed by anything but the app's top page, it draws nothing.
import React from "react";
import { createRoot } from "react-dom/client";

import "./editor.css";
import { EDITOR_OPEN, EDITOR_PICK, EDITOR_THEME, readAppToEditor } from "../features/machines/model/editorFrameProtocol";
import type { NodeFsState } from "../features/ide/vfs/nodeFsClient";
import { ExplorerView } from "./ExplorerView";
import { FileView } from "./FileView";
import { startEditorSession, type EditorSession } from "./session";
import { applyTheme } from "./theme";

const view = new URLSearchParams(location.search).get("view") === "file" ? "file" : "explorer";

const App: React.FC = () => {
  const [session, setSession] = React.useState<EditorSession | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const [pickRequests, setPickRequests] = React.useState(0);
  const [fileKey, setFileKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onAppMessage = (data: unknown): boolean => {
      const message = readAppToEditor(data);
      if (!message) return false;
      if (message.type === EDITOR_THEME) applyTheme(message.theme);
      else if (message.type === EDITOR_OPEN) setFileKey(message.key);
      else if (message.type === EDITOR_PICK) setPickRequests((count) => count + 1);
      return true;
    };
    const onState = (state: NodeFsState) => {
      setConnected(state === "open");
      if (state === "open") setEpoch((count) => count + 1);
    };
    void startEditorSession(onAppMessage, onState).then(setSession);
  }, []);

  if (!session || !connected) return null;
  if (view === "file") return <FileView session={session} fileKey={fileKey} epoch={epoch} />;
  return <ExplorerView session={session} pickRequests={pickRequests} epoch={epoch} />;
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);

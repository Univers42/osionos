// The app's half of a frame of the node's editor page: the same link as the terminal's, the app's
// theme on `ready`, and only what editorFrameProtocol.ts lets through. The app never sees a path, a
// listing or a file's content: it hears a base name and whether it has unsaved changes.
import { watchAppearance } from "@/features/ide/ui/watchAppearance";
import React from "react";

import { readIdeMessage } from "@/features/ide/vscode/ideFrameProtocol";
import { EDITOR_THEME, readEditorToApp, type AppToEditor, type EditorTheme, type EditorToApp } from "./editorFrameProtocol";
import { LOCAL_NODE_ORIGIN } from "./machineWindow";
import { probeOldNode } from "./oldNodeProbe";
import type { TerminalFramePhase } from "./terminalFrame";
import { startMachineFrame } from "./terminalFrameStore";

export const EDITOR_PAGE_URL = `${LOCAL_NODE_ORIGIN}/editor/index.html`;
export const EDITOR_FRAME_PERMISSIONS = "local-network-access; clipboard-read; clipboard-write";

export type EditorFramePhase = TerminalFramePhase | "idle";

function appTheme(): EditorTheme {
  const root = document.documentElement;
  const { theme, palette, accent, density, radius, uiScale } = root.dataset;
  const accentHue = root.style.getPropertyValue("--osio-accent-hue").trim() || undefined;
  const tokens: Record<string, string> = {};
  for (const name of Array.from(root.style)) if (name.startsWith("--osio-")) tokens[name] = root.style.getPropertyValue(name).trim();
  return { theme, palette, accent, density, radius, uiScale, accentHue, tokens };
}

export function useEditorFrame({ armed, mayPromptStepUp, onMessage }: {
  armed: boolean;
  mayPromptStepUp: () => boolean;
  onMessage?: (message: EditorToApp) => void;
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [phase, setPhase] = React.useState<EditorFramePhase>("idle");
  const [ready, setReady] = React.useState(false);
  const handler = React.useRef(onMessage);
  React.useEffect(() => { handler.current = onMessage; }, [onMessage]);

  const post = React.useCallback((message: AppToEditor) => {
    frameRef.current?.contentWindow?.postMessage(message, LOCAL_NODE_ORIGIN);
  }, []);

  React.useEffect(() => {
    if (!armed) return undefined;
    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== LOCAL_NODE_ORIGIN) return;
      if (readIdeMessage(event.data, event.origin, LOCAL_NODE_ORIGIN)?.type === "osionos-ide/ready") {
        post({ type: EDITOR_THEME, theme: appTheme() });
        setReady(true);
      }
      const message = readEditorToApp(event.data);
      if (message) handler.current?.(message);
    };
    globalThis.addEventListener("message", onWindowMessage);
    const { stop } = startMachineFrame({
      frame: () => frameRef.current?.contentWindow ?? null,
      colors: () => ({}),
      probeOldNode,
      onConnected: () => undefined,
      onPhase: setPhase,
      mayPromptStepUp,
    });
    return () => {
      globalThis.removeEventListener("message", onWindowMessage);
      stop();
      setPhase("idle");
      setReady(false);
    };
  }, [armed, attempt, mayPromptStepUp, post]);

  // The folder tree and the open file repaint with the app, whatever changed its theme.
  React.useEffect(() => {
    const host = frameRef.current;
    if (!armed || !ready || !host) return undefined;
    return watchAppearance(host, () => post({ type: EDITOR_THEME, theme: appTheme() }));
  }, [armed, ready, post]);

  return { frameRef, attempt, phase, ready, post, tryAgain: React.useCallback(() => setAttempt((count) => count + 1), []) };
}

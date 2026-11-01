// The live wiring of the web dock's terminal frame (terminalFrame.ts): the account's machines, the
// bridge's mint and identity check, the app's step-up prompt, and the phase the status bar's
// "This computer" chip shows. One frame per dock; the panel starts and stops it.
import { create } from "zustand";

import { newNonce } from "@/features/ide/vscode/ideFrameProtocol";
import type { TerminalColors } from "@/features/ide/model/terminalPort";
import { onSudoGranted, useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { mintMachineToken, verifyMachineIdentity } from "../api/machinesApi";
import { lookupOwnMachine } from "./machineWindowStore";
import { createTerminalFrame, type LocalNetworkState, type TerminalFrameDeps, type TerminalFramePhase } from "./terminalFrame";

export const useTerminalFrameStore = create<{ phase: TerminalFramePhase | "idle" }>()(() => ({ phase: "idle" }));

// Chrome names the permission "local-network-access"; a browser without it rejects the query.
async function localNetwork(): Promise<LocalNetworkState> {
  try {
    const status = await navigator.permissions.query({ name: "local-network-access" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

type FrameHooks = Pick<TerminalFrameDeps, "frame" | "probeOldNode"> & { colors: () => TerminalColors; onConnected: () => void };

export function startTerminalFrame({ frame, probeOldNode, colors, onConnected }: FrameHooks): () => void {
  const controller = createTerminalFrame({
    frame, probeOldNode, colors, localNetwork,
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      globalThis.addEventListener("message", onMessage);
      return () => globalThis.removeEventListener("message", onMessage);
    },
    lookup: lookupOwnMachine,
    mint: mintMachineToken,
    verify: verifyMachineIdentity,
    nonce: newNonce,
    schedule: (fire, ms) => {
      const timer = setTimeout(fire, ms);
      return () => clearTimeout(timer);
    },
    onPhase: (phase) => {
      useTerminalFrameStore.setState({ phase });
      if (phase === "step-up") useSudoPromptStore.getState().show();
      if (phase === "connected") onConnected();
    },
  });
  const stopRetrying = onSudoGranted(() => {
    if (useTerminalFrameStore.getState().phase === "step-up") void controller.retry();
  });
  return () => {
    stopRetrying();
    controller.stop();
    useTerminalFrameStore.setState({ phase: "idle" });
  };
}

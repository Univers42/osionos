// The live wiring of the web dock's terminal frame (terminalFrame.ts): the account's machines, the
// bridge's mint and identity check, the app's step-up prompt, and the phase the status bar's
// "This computer" chip shows. One frame per dock; the panel starts and stops it. `remember` is the
// step-up dialog's "Remember this computer" box, on by default (owner, 2026-11-01): a token minted
// while it is checked lets the node give the terminal frame a device secret (Amendment 1, R6).
import { create } from "zustand";

import { newNonce } from "@/features/ide/vscode/ideFrameProtocol";
import type { TerminalColors } from "@/features/ide/model/terminalPort";
import { onSudoGranted, useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { mintMachineToken, mintResumeAssertion, verifyMachineIdentity } from "../api/machinesApi";
import { lookupOwnMachine } from "./machineWindowStore";
import { createTerminalFrame, type LocalNetworkState, type TerminalFramePhase, type TerminalFrameDeps } from "./terminalFrame";

export const useTerminalFrameStore = create<{ phase: TerminalFramePhase | "idle"; remember: boolean }>()(() => ({ phase: "idle", remember: true }));

// Chrome names the permission "local-network-access"; a browser without it rejects the query.
export async function localNetwork(): Promise<LocalNetworkState> {
  try {
    const status = await navigator.permissions.query({ name: "local-network-access" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

type FrameHooks = Pick<TerminalFrameDeps, "frame" | "probeOldNode" | "theme"> & { colors: () => TerminalColors; onConnected: () => void };

type MachineFrameHooks = FrameHooks & {
  onPhase: (phase: TerminalFramePhase) => void;
  /** False while nobody asked for this frame, as when it reconnects on page load. */
  mayPromptStepUp?: () => boolean;
  /** Whether a token minted now carries the remember choice; only the terminal's frame reads it. */
  remember?: () => boolean;
};

/** One node-served frame linked to this app: the terminal's and the editor's are the same door. */
export function startMachineFrame({ frame, probeOldNode, colors, theme, onConnected, onPhase, mayPromptStepUp = () => true, remember = () => false }: MachineFrameHooks): { stop(): void; retry(): void } {
  let current: TerminalFramePhase = "connecting";
  const controller = createTerminalFrame({
    frame, probeOldNode, colors, theme, localNetwork,
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      globalThis.addEventListener("message", onMessage);
      return () => globalThis.removeEventListener("message", onMessage);
    },
    lookup: lookupOwnMachine,
    mint: (id, mode) => (mode === "resume" ? mintResumeAssertion(id) : mintMachineToken(id, { remember: remember() })),
    verify: verifyMachineIdentity,
    nonce: newNonce,
    schedule: (fire, ms) => {
      const timer = setTimeout(fire, ms);
      return () => clearTimeout(timer);
    },
    onPhase: (phase) => {
      current = phase;
      onPhase(phase);
      if (phase === "step-up" && mayPromptStepUp()) useSudoPromptStore.getState().show();
      if (phase === "connected") onConnected();
    },
  });
  const stopRetrying = onSudoGranted(() => {
    if (current === "step-up") void controller.retry();
  });
  return {
    stop: () => { stopRetrying(); controller.stop(); },
    retry: () => { void controller.retry(); },
  };
}

export function startTerminalFrame(hooks: FrameHooks): () => void {
  const { stop } = startMachineFrame({
    ...hooks,
    onPhase: (phase) => useTerminalFrameStore.setState({ phase }),
    remember: () => useTerminalFrameStore.getState().remember,
  });
  return () => {
    stop();
    useTerminalFrameStore.setState({ phase: "idle" });
  };
}

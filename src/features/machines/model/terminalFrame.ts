// The web dock's terminal, in place (owner 2026-11-01; devil verdict 2026-11-01, W11, W14; groot ADR
// 0041). The dock frames this computer's osionos-node terminal page and runs the machine handshake
// the IDE window runs (machineLink.ts): the page names its machine, the account's list says whether
// it is ours, the node signs the app's nonce, and only then is one token minted and posted, to the
// node's exact origin. Each later shell's token goes through the same identity check. A frame that
// never answers is explained in plain words: no command in the dock (owner, 2026-11-01).
import { linkMachineFrame, type IdentityVerdict, type MachineFrameDeps, type MachineViewState, type MintResult } from "../../ide/vscode/machineLink.ts";
import { readIdeMessage } from "../../ide/vscode/ideFrameProtocol.ts";
import type { TerminalColors } from "../../ide/model/terminalPort.ts";
import type { Machine } from "../api/machinesApi.ts";
import { LOCAL_NODE_ORIGIN } from "./machineWindow.ts";

export const TERMINAL_PAGE_URL = `${LOCAL_NODE_ORIGIN}/terminal/index.html`;
/** The IDE page's light entry: an osionos-node too old for /terminal/ still answers ready there. */
export const OLD_NODE_PROBE_URL = `${LOCAL_NODE_ORIGIN}/?local=1`;
/** The frame posts this to the dock's colours (terminalAppLink.ts). */
const COLORS_MESSAGE = "osionos-terminal/colors";
/** The whole code theme; sent before the colours, and again whenever the app's appearance changes. */
export const TERMINAL_THEME_MESSAGE = "osionos-terminal/theme";

// Caveat: the page sends ready only after its whole bundle has loaded, and a first visit may wait
// on the browser's local-network prompt, so a slow disk or a person reading the prompt can pass the
// bound: the dock then says "not running" and keeps listening, and a late ready still connects.
// Measured 2026-11-01, headless Chromium 156 on the owner's laptop, fresh context (cold HTTP cache),
// https app origin framing a loopback node: ready at 898, 953 and 781 ms (3 runs); 8 s is ~8x the
// worst. A headed first visit with the prompt up was not measured.
export const TERMINAL_READY_TIMEOUT_MS = 8000;

export type TerminalFramePhase = "connecting" | "step-up" | "connected" | "no-node" | "lna-blocked" | "old-node" | "other-account" | "mismatch" | "unavailable" | "error";
export type LocalNetworkState = "granted" | "denied" | "prompt" | "unknown";

export type TerminalFrameDeps = {
  frame: MachineFrameDeps["frame"];
  listen: MachineFrameDeps["listen"];
  lookup: (machineId: string) => Promise<Machine | "other-account" | "unavailable">;
  mint: (machineId: string) => Promise<MintResult>;
  verify: (machineId: string, nonce: string, sig: string) => Promise<IdentityVerdict>;
  nonce: () => string;
  schedule: (fire: () => void, ms: number) => () => void;
  colors: () => TerminalColors;
  theme?: () => unknown;
  /** Chrome's local network access permission for this site, when the browser can tell. */
  localNetwork: () => Promise<LocalNetworkState>;
  /** Whether an osionos-node answers on the IDE page, though not on /terminal/. */
  probeOldNode: () => Promise<boolean>;
  onPhase: (phase: TerminalFramePhase) => void;
};

const PHASE_OF: Record<Exclude<MachineViewState, "no-node">, TerminalFramePhase> = {
  connecting: "connecting", reconnecting: "connecting", connected: "connected", error: "error",
  "step-up": "step-up", mismatch: "mismatch", unavailable: "unavailable", "other-account": "other-account",
};

export function createTerminalFrame(deps: TerminalFrameDeps) {
  let machine: Machine | null = null;
  let colorsSent = false;
  // Bumped on every state, so an explanation still being worked out never overwrites a later one.
  let generation = 0;

  async function explainSilence(seen: number): Promise<void> {
    const lna = await deps.localNetwork().catch((): LocalNetworkState => "unknown");
    const phase = lna === "denied" ? "lna-blocked" : (await deps.probeOldNode().catch(() => false)) ? "old-node" : "no-node";
    if (seen === generation) deps.onPhase(phase);
  }

  const onState = (state: MachineViewState) => {
    generation += 1;
    if (state === "no-node") void explainSilence(generation);
    else deps.onPhase(PHASE_OF[state]);
  };

  // The page listens before it says ready, so its ready is when the dock's colours can reach it.
  const listen: MachineFrameDeps["listen"] = (handler) => deps.listen((event) => {
    const frame = deps.frame();
    if (!colorsSent && frame && event.source === frame && readIdeMessage(event.data, event.origin, LOCAL_NODE_ORIGIN)?.type === "osionos-ide/ready") {
      colorsSent = true;
      const theme = deps.theme?.();
      if (theme) frame.postMessage({ type: TERMINAL_THEME_MESSAGE, theme }, LOCAL_NODE_ORIGIN);
      frame.postMessage({ type: COLORS_MESSAGE, colors: deps.colors() }, LOCAL_NODE_ORIGIN);
    }
    handler(event);
  });

  deps.onPhase("connecting");
  const link = linkMachineFrame({
    frame: deps.frame,
    ideOrigin: LOCAL_NODE_ORIGIN,
    listen,
    mint: () => (machine ? deps.mint(machine.id) : Promise.resolve({ kind: "unavailable", reason: "no-machine" })),
    onState,
    claim: async (node) => {
      const found = await deps.lookup(node);
      if (typeof found === "string") return found;
      machine = found;
      return { machineId: found.id, nonce: deps.nonce, verify: (nonce, sig) => deps.verify(found.id, nonce, sig) };
    },
    readyWithin: { ms: TERMINAL_READY_TIMEOUT_MS, schedule: deps.schedule },
  });
  return { retry: link.retry, stop: link.stop };
}

export type TerminalFramePanel = {
  title: string;
  detail: string | null;
  /** The Connector's download address, or null when there is none to offer. */
  download: string | null;
  tryAgain: boolean;
  pair: boolean;
  /** The step-up: a button that opens the emailed-code prompt. */
  confirm: boolean;
};

const ALLOW_LOCAL = "If your browser asked to connect to apps on this device and it was blocked, allow it in the site settings (the icon left of the address), then try again.";

const PANELS: Record<Exclude<TerminalFramePhase, "connected">, Omit<TerminalFramePanel, "download" | "confirm"> & { offersDownload: boolean }> = {
  connecting: { title: "Connecting to this computer…", detail: "Your browser may ask to let osionos connect to apps on this device. Allow it to open your terminal here.", tryAgain: false, pair: false, offersDownload: false },
  "step-up": { title: "Confirm it's you", detail: "We email you a six-digit code. Enter it, and your terminal opens right here.", tryAgain: false, pair: false, offersDownload: false },
  "no-node": { title: "osionos Connector isn't running on this computer.", detail: ALLOW_LOCAL, tryAgain: true, pair: false, offersDownload: true },
  "lna-blocked": { title: "Your browser is blocking osionos from this computer.", detail: "Allow apps on this device for this site in the browser's site settings (the icon left of the address), then try again.", tryAgain: true, pair: false, offersDownload: false },
  "old-node": { title: "osionos Connector needs an update.", detail: null, tryAgain: true, pair: false, offersDownload: true },
  "other-account": { title: "This computer is connected to another osionos account.", detail: "Connect it to your account in Settings › Machines.", tryAgain: false, pair: true, offersDownload: false },
  mismatch: { title: "Something else answered for osionos Connector on this computer.", detail: "Restart osionos Connector, then try again.", tryAgain: true, pair: false, offersDownload: false },
  unavailable: { title: "osionos could not check this computer against your account.", detail: "Try again in a moment.", tryAgain: true, pair: false, offersDownload: false },
  error: { title: "The terminal could not start on this computer.", detail: null, tryAgain: true, pair: false, offersDownload: false },
};

/** What the dock shows over the frame, or null once the terminal is connected. */
export function terminalFramePanel(phase: TerminalFramePhase, downloadUrl: string): TerminalFramePanel | null {
  if (phase === "connected") return null;
  const { offersDownload, ...panel } = PANELS[phase];
  return { ...panel, download: offersDownload && downloadUrl ? downloadUrl : null, confirm: phase === "step-up" };
}

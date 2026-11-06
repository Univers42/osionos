// The web terminal page's link to the app that frames it (devil verdict 2026-11-01, W10; groot ADR
// 0041). The page is served by this computer's osionos-node, which writes its app origins into the
// page; the page cannot be told another. It starts only as a direct frame of the top page, hears
// only that parent from one of those origins, pins the first that answers, and then posts only to
// it. Before an answer, `ready` goes to each app origin by name, never "*": the browser delivers it
// only where the parent's origin matches. It acts on three messages: a token (for the next shell's
// socket, and nothing else), a hello (relayed to the node's whoami) and the dock's colours, once.
// "Remember this computer" adds exactly two (Amendment 1, R10): a resume assertion, handled like the
// token, and `forget`. Before `ready`, each app origin this frame holds a device secret for is told
// `remembered`, by name, and nothing more: the secret itself never leaves the frame (R9).
import { readAppMessage, type IdeMessage, type IdeState } from "../vscode/ideFrameProtocol.ts";
import { createFrameCredentials, type FrameCredentials, type RememberedStore } from "./terminalCredentials.ts";
import { terminalColorsFrom, type TerminalColors } from "./terminalPort.ts";

export const TERMINAL_COLORS_MESSAGE = "osionos-terminal/colors";

type FrameEvent = { source: unknown; origin: string; data: unknown };

export interface TerminalAppLinkDeps {
  page: { parent: unknown; top: unknown; self: unknown };
  appOrigins: readonly string[];
  node: string;
  post: (message: IdeMessage, origin: string) => void;
  listen: (handler: (event: FrameEvent) => void) => () => void;
  whoami: (nonce: string) => Promise<IdeMessage | null>;
  /** The editor page's own vocabulary from the app (editorFrameProtocol.ts); true when it was one. */
  onAppMessage?: (data: unknown) => boolean;
  /** The node remembers computers (/api/machine/self says so); the terminal page only. */
  remembers?: boolean;
  store?: RememberedStore | null;
  /** Tells the node to delete a device secret's record (POST /api/machine/forget). */
  forgetOnNode?: (device: string) => Promise<void>;
  /** The app answers `ready` with a grant, so the first shell does not ask again (terminalFrame.ts). */
  readyAsks?: boolean;
}

export interface TerminalAppLink {
  credentials: FrameCredentials;
  /** The dock's colours, when it sends them. */
  colors: Promise<TerminalColors>;
  report(state: IdeState): void;
  /** The app's origin, once it has spoken. */
  appOrigin(): string | null;
  /** Posts to the pinned app only; before it has spoken, there is nobody to tell. */
  tell(message: unknown): void;
}

export function linkTerminalToApp({ page, appOrigins, node, post, listen, whoami, onAppMessage, remembers = false, store = null, forgetOnNode = async () => {}, readyAsks = false }: TerminalAppLinkDeps): TerminalAppLink | null {
  if (page.parent === page.self || page.parent !== page.top || appOrigins.length === 0) return null;
  let pinned: string | null = null;
  const send = (message: IdeMessage) => {
    for (const origin of pinned ? [pinned] : appOrigins) {
      // A browser throws on a scheme it cannot address (app:// outside the desktop app).
      try { post(message, origin); } catch { /* not an origin this browser can post to */ }
    }
  };
  const credentials = createFrameCredentials({
    ask: (kind) => send({ type: kind === "resume" ? "osionos-ide/need-resume" : "osionos-ide/need-session" }),
    appOrigin: () => pinned,
    remembers,
    store,
    readyAsks,
  });

  async function forget(): Promise<void> {
    const device = pinned ? store?.read(pinned) ?? null : null;
    if (pinned) store?.remove(pinned);
    if (device) await forgetOnNode(device).catch(() => {});
    send({ type: "osionos-ide/forgotten" });
  }

  let colorsTaken = false;
  let giveColors: (colors: TerminalColors) => void = () => {};
  const colors = new Promise<TerminalColors>((resolve) => { giveColors = resolve; });

  listen((event) => {
    if (event.source !== page.parent) return;
    if (pinned ? event.origin !== pinned : !appOrigins.includes(event.origin)) return;
    if (onAppMessage?.(event.data)) {
      pinned ??= event.origin;
      return;
    }
    const data = event.data as { type?: unknown; colors?: unknown } | null;
    if (data?.type === TERMINAL_COLORS_MESSAGE) {
      if (colorsTaken) return;
      colorsTaken = true;
      pinned ??= event.origin;
      return giveColors(terminalColorsFrom(data.colors));
    }
    const message = readAppMessage(event.data, event.origin, [event.origin]);
    if (message?.type === "osionos-ide/session") {
      pinned ??= event.origin;
      credentials.give(message.token);
    } else if (message?.type === "osionos-ide/resume") {
      pinned ??= event.origin;
      credentials.giveResume(message.assertion);
    } else if (message?.type === "osionos-ide/forget") {
      pinned ??= event.origin;
      void forget();
    } else if (message?.type === "osionos-ide/hello") {
      pinned ??= event.origin;
      const failed = () => send({ type: "osionos-ide/state", state: "error" });
      void whoami(message.nonce).then((identity) => (identity ? send(identity) : failed()), failed);
    }
  });
  if (remembers && store) {
    for (const origin of appOrigins) {
      if (!store.read(origin)) continue;
      try { post({ type: "osionos-ide/remembered" }, origin); } catch { /* not an origin this browser can post to */ }
    }
  }
  send({ type: "osionos-ide/ready", node });
  return {
    credentials,
    colors,
    report: (state) => send({ type: "osionos-ide/state", state }),
    appOrigin: () => pinned,
    tell: (message) => { if (pinned) post(message as IdeMessage, pinned); },
  };
}

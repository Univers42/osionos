// The web terminal page's link to the app that frames it (devil verdict 2026-11-01, W10; groot ADR
// 0041). The page is served by this computer's osionos-node, which writes its app origins into the
// page; the page cannot be told another. It starts only as a direct frame of the top page, hears
// only that parent from one of those origins, pins the first that answers, and then posts only to
// it. Before an answer, `ready` goes to each app origin by name, never "*": the browser delivers it
// only where the parent's origin matches. It acts on three messages: a token (for the next shell's
// socket, and nothing else), a hello (relayed to the node's whoami) and the dock's colours, once.
import { readAppMessage, type IdeMessage, type IdeState } from "../vscode/ideFrameProtocol.ts";
import { createTokenCredentials, type PtyCredentials } from "./terminalSocket.ts";
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
}

export interface TerminalAppLink {
  credentials: PtyCredentials;
  /** The dock's colours, when it sends them. */
  colors: Promise<TerminalColors>;
  report(state: IdeState): void;
  /** The app's origin, once it has spoken. */
  appOrigin(): string | null;
  /** Posts to the pinned app only; before it has spoken, there is nobody to tell. */
  tell(message: unknown): void;
}

export function linkTerminalToApp({ page, appOrigins, node, post, listen, whoami, onAppMessage }: TerminalAppLinkDeps): TerminalAppLink | null {
  if (page.parent === page.self || page.parent !== page.top || appOrigins.length === 0) return null;
  let pinned: string | null = null;
  const send = (message: IdeMessage) => {
    for (const origin of pinned ? [pinned] : appOrigins) {
      // A browser throws on a scheme it cannot address (app:// outside the desktop app).
      try { post(message, origin); } catch { /* not an origin this browser can post to */ }
    }
  };
  const credentials = createTokenCredentials(() => send({ type: "osionos-ide/need-session" }));
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
    } else if (message?.type === "osionos-ide/hello") {
      pinned ??= event.origin;
      const failed = () => send({ type: "osionos-ide/state", state: "error" });
      void whoami(message.nonce).then((identity) => (identity ? send(identity) : failed()), failed);
    }
  });
  send({ type: "osionos-ide/ready", node });
  return {
    credentials,
    colors,
    report: (state) => send({ type: "osionos-ide/state", state }),
    appOrigin: () => pinned,
    tell: (message) => { if (pinned) post(message as IdeMessage, pinned); },
  };
}

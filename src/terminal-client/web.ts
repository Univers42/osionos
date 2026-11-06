// The terminal page on the web (groot ADR 0041): served by this computer's osionos-node at
// /terminal/, framed in place by the app's dock. It names its machine (GET /api/machine/self), links
// to the app (W10), and opens one WebSocket per shell to its own node, with a token the app minted
// for the first and the node's session secret for the next (U6). A computer the person chose to
// remember opens instead with the device secret the node gave this frame, kept in this origin's own
// storage, beside a resume assertion the app fetched with no emailed code (Amendment 1). Framed by
// anything but the app's top page, it draws nothing.
import { readCodeTheme, type CodeTheme } from "../features/ide/model/codeTheme";
import { readSelf } from "../features/ide/vscode/machineSession";
import { whoami } from "../features/ide/vscode/machineWhoami";
import type { TerminalColors, TerminalPtyApi } from "../features/ide/model/terminalPort";
import { linkTerminalToApp, type TerminalAppLink } from "../features/ide/model/terminalAppLink";
import { PTY_SOCKET_PATH, ptyApiOverWebSocket, type SocketLike } from "../features/ide/model/terminalSocket";
import { rememberedStoreOver } from "../features/ide/model/terminalCredentials";

const appOrigins = (): string[] =>
  (document.querySelector<HTMLMetaElement>('meta[name="osionos-app-origin"]')?.content ?? "").split(" ").filter(Boolean);

async function selfNode(): Promise<{ node: string; remembers: boolean } | null> {
  const res = await fetch("/api/machine/self", { credentials: "same-origin" });
  const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
  const node = readSelf(body);
  return node ? { node, remembers: (body as { remember?: unknown }).remember === true } : null;
}

async function forgetOnNode(device: string): Promise<void> {
  await fetch("/api/machine/forget", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ device }) });
}

// The dock shows "connected" once a shell runs, and its fallback when the first one fails.
function reporting(api: TerminalPtyApi, link: TerminalAppLink): TerminalPtyApi {
  return {
    async create(cols, rows) {
      try {
        const shell = await api.create(cols, rows);
        link.report(shell ? "connected" : "error");
        return shell;
      } catch (error) {
        link.report("error");
        throw error;
      }
    },
    kill: (id) => api.kill(id),
  };
}

const THEME_MESSAGE = "osionos-terminal/theme";

export async function startOnTheWeb(start: (api: TerminalPtyApi, colors: TerminalColors) => Promise<void>, onTheme: (theme: CodeTheme) => void): Promise<void> {
  const self = await selfNode();
  if (!self) return;
  const { node, remembers } = self;
  const link = linkTerminalToApp({
    page: { parent: window.parent, top: window.top, self: window },
    appOrigins: appOrigins(),
    node,
    post: (message, origin) => window.parent.postMessage(message, origin),
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },
    whoami,
    remembers,
    store: rememberedStoreOver(() => window.localStorage),
    forgetOnNode,
    readyAsks: true,
    onAppMessage: (data) => {
      const message = data as { type?: unknown; theme?: unknown } | null;
      if (message?.type !== THEME_MESSAGE) return false;
      const theme = readCodeTheme(message.theme);
      if (theme) onTheme(theme);
      return true;
    },
  });
  if (!link) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${PTY_SOCKET_PATH}`;
  const api = ptyApiOverWebSocket(() => new WebSocket(url) as unknown as SocketLike, link.credentials);
  await start(reporting(api, link), await link.colors);
}

// The web terminal page's transport (devil verdict 2026-11-01, W3, W5, U6; groot ADR 0041). The
// desktop hands the page a MessagePort per shell (terminalPort.ts); on the web the page opens one
// WebSocket per shell to this computer's osionos-node, `ws://<node>/api/pty`. Both implement the
// same TerminalPtyApi and PortLike, so createLocalPtyProcess (OSC 52 filter, typed-ahead input) runs
// unchanged on either. The socket's first message is the frame's session secret when it holds one,
// else one fresh token the app minted; nothing here stores a credential beyond the frame's memory.
import type { PortLike, PtyConnection, TerminalPtyApi } from "./terminalPort";

export const PTY_SOCKET_PATH = "/api/pty";

/** The node's close codes (packages/osionos-node/pty-wire.mjs PTY_CLOSE). */
const CLOSE_AUTH = 4401;
const CLOSE_FULL = 4429;

export type PtyCredential = { token: string } | { secret: string };

export interface PtyCredentials {
  /** The frame's secret if it holds one, else the next token from the app (it may wait for a step-up). */
  take(): Promise<PtyCredential>;
  keepSecret(secret: string): void;
  dropSecret(): void;
}

/** The slice of the browser's WebSocket used here. */
export interface SocketLike {
  send(text: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
}

/** Tokens from the app, one asked for at a time: the app's handshake holds one nonce at a time, so
 *  a second ask before the first answer would void the first identity check. */
export function createTokenCredentials(askForToken: () => void): PtyCredentials & { give(token: string): void } {
  let secret: string | null = null;
  const tokens: string[] = [];
  const waiting: Array<(token: string) => void> = [];
  return {
    async take() {
      if (secret) return { secret };
      const ready = tokens.shift();
      if (ready) return { token: ready };
      if (waiting.length === 0) askForToken();
      return new Promise<PtyCredential>((resolve) => waiting.push((token) => resolve({ token })));
    },
    give(token) {
      const next = waiting.shift();
      if (next) next(token);
      else tokens.push(token);
      if (waiting.length > 0) askForToken();
    },
    keepSecret(value) { secret = value; },
    dropSecret() { secret = null; },
  };
}

const readMessage = (data: unknown): Record<string, unknown> | null => {
  try {
    const value: unknown = typeof data === "string" ? JSON.parse(data) : null;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

// After the opening, the socket is this shell's port. A drop the node never explained (it stopped,
// the tab lost the network) still ends the terminal, as an exit, so VS Code does not sit on it.
function portOver(socket: SocketLike): PortLike {
  let exited = false;
  const port: PortLike = {
    onmessage: null,
    postMessage: (message: unknown) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
    start: () => {},
  };
  socket.onmessage = (event) => {
    const message = readMessage(event.data);
    if (!message) return;
    if (message.op === "exit") exited = true;
    port.onmessage?.({ data: message } as MessageEvent);
  };
  socket.onclose = () => {
    if (!exited) port.onmessage?.({ data: { op: "exit", exitCode: 1 } } as MessageEvent);
  };
  return port;
}

type Opening = { kind: "opened"; connection: PtyConnection } | { kind: "full" } | { kind: "refused" } | { kind: "gone" };

export function ptyApiOverWebSocket(openSocket: () => SocketLike, credentials: PtyCredentials): TerminalPtyApi {
  let nextId = 0;
  const open = new Map<string, SocketLike>();

  function openOnce(credential: PtyCredential, cols: number, rows: number): Promise<Opening> {
    const socket = openSocket();
    return new Promise((resolve) => {
      socket.onopen = () => socket.send(JSON.stringify({ ...credential, cols, rows }));
      socket.onmessage = (event) => {
        const message = readMessage(event.data);
        if (message?.op !== "opened") return;
        if (typeof message.secret === "string") credentials.keepSecret(message.secret);
        const id = `web-${++nextId}`;
        open.set(id, socket);
        const port = portOver(socket);
        const onclose = socket.onclose;
        socket.onclose = (closed) => { open.delete(id); onclose?.(closed); };
        resolve({ kind: "opened", connection: { id, port } });
      };
      socket.onclose = ({ code }) => resolve(code === CLOSE_FULL ? { kind: "full" } : code === CLOSE_AUTH ? { kind: "refused" } : { kind: "gone" });
    });
  }

  return {
    async create(cols, rows) {
      let credential = await credentials.take();
      let opening = await openOnce(credential, cols, rows);
      // A secret dies with the frame's last shell, and a token waiting in memory can expire: one
      // retry, with a fresh token, before saying no.
      if (opening.kind === "refused") {
        if ("secret" in credential) credentials.dropSecret();
        credential = await credentials.take();
        opening = await openOnce(credential, cols, rows);
      }
      if (opening.kind === "opened") return opening.connection;
      if (opening.kind === "full") return null;
      throw new Error(opening.kind === "refused" ? "this computer refused the terminal" : "the terminal could not reach this computer");
    },
    kill(id) {
      open.get(id)?.close();
      open.delete(id);
    },
  };
}

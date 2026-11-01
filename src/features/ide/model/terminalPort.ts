// The terminal page's side of its link to the panel that frames it (devil amendments A1 and 2,
// groot ADR 0039). The page runs on app://terminal, in its own renderer process. The panel hands
// a control port to the iframe it rendered; over it the page asks for a shell and receives that
// shell's own port, on which it talks to the pty host directly. The page never posts to
// window.parent, so a copy of the page framed by content gets no port and no shell.
// The panel's side is ptyPortRouter.ts.

export type PortLike = Pick<MessagePort, "postMessage" | "close" | "start"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

/** The one message the panel posts to the frame it rendered. */
export const TERMINAL_PORT_MESSAGE = "osionos-terminal/port";
/** The message the preload posts to its own window with a pty's port (groot ADR 0039). */
export const PTY_PORT_MESSAGE = "osionos-pty-port";
export const APP_ORIGIN = "app://osionos";
export const TERMINAL_ORIGIN = "app://terminal";

/** A shell the page created: its id, for kill, and its own port to the pty host. */
export interface PtyConnection {
  id: string;
  port: PortLike;
}

/** What the page can do over the control port: start a shell, end one. */
export interface TerminalPtyApi {
  /** The shell, or null when the desktop refused (eight open); rejects when it failed. */
  create(cols: number, rows: number): Promise<PtyConnection | null>;
  kill(id: string): void;
}

/** The code theme the panel paints with, so VS Code's terminal matches the dock. */
export interface TerminalColors {
  background?: string;
  foreground?: string;
  cursor?: string;
  selection?: string;
}

const COLOR_KEYS = ["background", "foreground", "cursor", "selection"] as const;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The hex colours of `value`: VS Code's colour customizations read hex only, and nothing else
 *  crosses into the page's configuration. */
export function terminalColorsFrom(value: unknown): TerminalColors {
  const colors: TerminalColors = {};
  if (!value || typeof value !== "object") return colors;
  for (const key of COLOR_KEYS) {
    const color = (value as Record<string, unknown>)[key];
    if (typeof color === "string" && HEX_COLOR.test(color)) colors[key] = color;
  }
  return colors;
}

export const isPtySize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;
export const isPtyId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** Page side: the port in `event` when the app's top page framing this page sent it, else null (A2). */
export function acceptTerminalPort(
  event: { source: unknown; origin: string; data: unknown; ports: readonly MessagePort[] },
  page: { parent: unknown; top: unknown; self: unknown },
): MessagePort | null {
  if (page.parent === page.self || page.parent !== page.top) return null;
  if (event.source !== page.parent || event.origin !== APP_ORIGIN) return null;
  if ((event.data as { type?: unknown } | null)?.type !== TERMINAL_PORT_MESSAGE) return null;
  return event.ports[0] ?? null;
}

interface Pending {
  resolve(connection: PtyConnection | null): void;
  reject(error: Error): void;
}

/** Page side: create and kill over the control port the panel handed this page. */
export function ptyApiOverPort(control: PortLike): TerminalPtyApi {
  let nextReq = 0;
  const pending = new Map<number, Pending>();

  control.onmessage = (event) => {
    const m = event.data as { op?: unknown; req?: unknown; id?: unknown; failed?: unknown } | null;
    if (!m || m.op !== "created" || typeof m.req !== "number") return;
    const waiting = pending.get(m.req);
    pending.delete(m.req);
    const port = event.ports[0] as PortLike | undefined;
    if (m.failed) {
      port?.close();
      waiting?.reject(new Error("the desktop could not start a shell"));
    } else if (isPtyId(m.id) && port && waiting) {
      waiting.resolve({ id: m.id, port });
    } else {
      // A shell nobody here waits for, or one without its port, would run with no reader.
      if (isPtyId(m.id)) control.postMessage({ op: "kill", id: m.id });
      port?.close();
      waiting?.resolve(null);
    }
  };
  control.start();

  return {
    create: (cols, rows) => new Promise((resolve, reject) => {
      const req = ++nextReq;
      pending.set(req, { resolve, reject });
      control.postMessage({ op: "create", req, cols, rows });
    }),
    kill: (id) => control.postMessage({ op: "kill", id }),
  };
}

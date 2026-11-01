// The terminal page and the panel that frames it (devil amendment A1, 2026-10-31): the panel hands
// a MessagePort to the iframe element it rendered itself and serves the desktop's pty over it. The
// page never touches window.parent, so an iframe of the page inserted by content gets no port and
// no shell. Each side checks what crosses: the panel serves only ptys created over this port.
import type { LocalPtyApi } from "./localPty";

type PortLike = Pick<MessagePort, "postMessage" | "close" | "start"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

/** The one message the panel posts to the frame it rendered. */
export const TERMINAL_PORT_MESSAGE = "osionos-terminal/port";

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

const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** Panel side: serve the desktop's pty to the page at the other end of `port`; returns a stop. */
export function servePtyOverPort(port: PortLike, api: LocalPtyApi): () => void {
  const owned = new Map<string, Array<() => void>>();

  const forget = (id: string) => {
    for (const off of owned.get(id) ?? []) off();
    owned.delete(id);
  };

  let stopped = false;

  async function create(req: number, cols: number, rows: number) {
    let id: string | null;
    try {
      id = await api.create(cols, rows);
    } catch {
      if (!stopped) port.postMessage({ op: "created", req, id: null, failed: true });
      return;
    }
    // The panel unmounted while the desktop was starting this one: nobody will ever see it.
    if (stopped) {
      if (id) api.kill(id);
      return;
    }
    if (id) {
      owned.set(id, [
        api.onData(id, (data) => port.postMessage({ op: "data", id, data })),
        api.onExit(id, (exitCode) => { forget(id); port.postMessage({ op: "exit", id, exitCode }); }),
      ]);
    }
    port.postMessage({ op: "created", req, id });
  }

  port.onmessage = (event) => {
    const m = event.data as Record<string, unknown> | null;
    if (!m || typeof m !== "object") return;
    if (m.op === "create") {
      if (Number.isInteger(m.req) && isSize(m.cols) && isSize(m.rows)) void create(m.req as number, m.cols, m.rows);
      return;
    }
    if (!isId(m.id) || !owned.has(m.id)) return;
    if (m.op === "write" && typeof m.data === "string") api.write(m.id, m.data);
    else if (m.op === "resize" && isSize(m.cols) && isSize(m.rows)) api.resize(m.id, m.cols, m.rows);
    else if (m.op === "ack" && Number.isInteger(m.chars)) api.ack(m.id, m.chars as number);
    else if (m.op === "kill") { api.kill(m.id); forget(m.id); }
  };
  port.start();

  return () => {
    stopped = true;
    for (const id of [...owned.keys()]) { api.kill(id); forget(id); }
    port.onmessage = null;
    port.close();
  };
}

/** Page side: the pty API, carried over the port the panel handed this page. */
export function ptyApiOverPort(port: PortLike): LocalPtyApi {
  let nextReq = 0;
  const pending = new Map<number, { resolve(id: string | null): void; reject(error: Error): void }>();
  const listeners = { data: new Map<string, Set<(v: string) => void>>(), exit: new Map<string, Set<(v: number) => void>>() };

  port.onmessage = (event) => {
    const m = event.data as { op?: string; req?: number; id?: string | null; failed?: boolean; data?: string; exitCode?: number } | null;
    if (!m) return;
    if (m.op === "created" && typeof m.req === "number") {
      const waiting = pending.get(m.req);
      pending.delete(m.req);
      if (m.failed) waiting?.reject(new Error("the desktop could not start a shell"));
      else waiting?.resolve(typeof m.id === "string" ? m.id : null);
    } else if (m.op === "data" && typeof m.id === "string" && typeof m.data === "string") {
      for (const cb of listeners.data.get(m.id) ?? []) cb(m.data);
    } else if (m.op === "exit" && typeof m.id === "string" && typeof m.exitCode === "number") {
      for (const cb of listeners.exit.get(m.id) ?? []) cb(m.exitCode);
    }
  };
  port.start();

  function subscribe<T>(map: Map<string, Set<(v: T) => void>>, id: string, cb: (v: T) => void) {
    const set = map.get(id) ?? new Set();
    set.add(cb);
    map.set(id, set);
    return () => { set.delete(cb); if (set.size === 0) map.delete(id); };
  }

  return {
    create: (cols, rows) => new Promise((resolve, reject) => {
      const req = ++nextReq;
      pending.set(req, { resolve, reject });
      port.postMessage({ op: "create", req, cols, rows });
    }),
    write: (id, data) => port.postMessage({ op: "write", id, data }),
    resize: (id, cols, rows) => port.postMessage({ op: "resize", id, cols, rows }),
    kill: (id) => port.postMessage({ op: "kill", id }),
    ack: (id, chars) => port.postMessage({ op: "ack", id, chars }),
    onData: (id, cb) => subscribe(listeners.data, id, cb),
    onExit: (id, cb) => subscribe(listeners.exit, id, cb),
  };
}

/** Panel side: give the iframe this panel rendered a port to the desktop's pty; returns a stop
 *  that kills the shells served over it. `origin` is the app's own, so no other page receives it. */
export function handOffTerminalPort(
  frame: { postMessage(message: unknown, targetOrigin: string, transfer: Transferable[]): void },
  api: LocalPtyApi,
  origin: string,
  colors: TerminalColors,
): () => void {
  const channel = new MessageChannel();
  const stop = servePtyOverPort(channel.port1, api);
  frame.postMessage({ type: TERMINAL_PORT_MESSAGE, colors }, origin, [channel.port2]);
  return stop;
}

/** Page side: the port in `event` when the panel framing this page sent it, else null. */
export function acceptTerminalPort(
  event: { source: unknown; origin: string; data: unknown; ports: readonly MessagePort[] },
  page: { parent: unknown; origin: string },
): MessagePort | null {
  if (event.source !== page.parent || event.origin !== page.origin) return null;
  if ((event.data as { type?: unknown } | null)?.type !== TERMINAL_PORT_MESSAGE) return null;
  return event.ports[0] ?? null;
}

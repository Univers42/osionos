// The panel's side of the desktop terminal (devil amendment 2, T1; groot ADR 0039). The preload
// posts each pty's port to this window; the panel forwards it, untouched, to the terminal frame it
// rendered, inside the `created` reply on that frame's control port. Any page in the window can
// post a message shaped like the preload's, embeds included, so a port is routed only when:
//   - it comes from this window itself (`event.source === window`), on app://osionos;
//   - its id is one this panel's own create returned, and no port went out for that id yet.
// Every other port is closed at once: a forwarded spoofed port would receive every keystroke.
// One panel per window: a second router would close the first one's ports as unknown ids.
import type { LocalPtyApi } from "./localPty";
import {
  APP_ORIGIN,
  PTY_PORT_MESSAGE,
  TERMINAL_ORIGIN,
  TERMINAL_PORT_MESSAGE,
  isPtyId,
  isPtySize,
  type PortLike,
  type TerminalColors,
} from "./terminalPort";

/** A window `message` event, as far as the router reads it. */
export interface PortOffer {
  source: unknown;
  origin: string;
  data: unknown;
  ports: readonly PortLike[];
}

export interface PtyPortRouter {
  /** A window message: routes or closes a pty port; any other message is left alone. */
  offer(event: PortOffer): void;
  /** Kills every shell this panel created and closes every port it holds. */
  stop(): void;
}

/** Caveat: a desktop that answers create but posts the port later than this gets a failed
 *  terminal and its shell killed; a shell is never left running with no reader. */
export const PTY_PORT_WAIT_MS = 5000;

interface Owned {
  /** The frame's request, while its port has not arrived. */
  req?: number;
  timer?: ReturnType<typeof setTimeout>;
  offExit(): void;
}

const isPtyPortMessage = (data: unknown): data is { type: string; id?: unknown } =>
  typeof data === "object" && data !== null && (data as { type?: unknown }).type === PTY_PORT_MESSAGE;

/** A pty port message that reached a window with no panel to route it: its ports are closed. */
export function refusePtyPort(event: PortOffer): void {
  if (isPtyPortMessage(event.data)) for (const port of event.ports) port.close();
}

/** Serve the desktop's pty to the frame at the other end of `control`. `self` is this window. */
export function servePtyToFrame(control: PortLike, api: LocalPtyApi, self: unknown, portWaitMs = PTY_PORT_WAIT_MS): PtyPortRouter {
  const owned = new Map<string, Owned>();
  // Ports that came before their create returned; kept only while a create is in flight.
  const early = new Map<string, PortLike>();
  let creating = 0;
  let stopped = false;

  const reply = (message: Record<string, unknown>, transfer: PortLike[] = []) => {
    if (!stopped) control.postMessage(message, transfer as unknown as Transferable[]);
  };

  const forget = (id: string) => {
    const entry = owned.get(id);
    if (!entry) return;
    entry.offExit();
    clearTimeout(entry.timer);
    owned.delete(id);
  };

  const route = (id: string, entry: Owned, port: PortLike) => {
    clearTimeout(entry.timer);
    const req = entry.req;
    entry.req = undefined;
    entry.timer = undefined;
    reply({ op: "created", req, id }, [port]);
  };

  // An early port whose create never came back for this panel is nobody's.
  const settleEarly = () => {
    if (creating > 0) return;
    for (const port of early.values()) port.close();
    early.clear();
  };

  const giveUp = (id: string, req: number) => {
    api.kill(id);
    forget(id);
    reply({ op: "created", req, id: null, failed: true });
  };

  async function create(req: number, cols: number, rows: number) {
    creating += 1;
    let id: string | null;
    try {
      id = await api.create(cols, rows);
    } catch {
      creating -= 1;
      settleEarly();
      reply({ op: "created", req, id: null, failed: true });
      return;
    }
    creating -= 1;
    if (stopped) {
      // The panel unmounted while the desktop was starting this one: nobody will ever see it.
      if (id) api.kill(id);
      return;
    }
    if (!id || owned.has(id)) {
      settleEarly();
      reply({ op: "created", req, id: null });
      return;
    }
    const entry: Owned = { req, offExit: () => {} };
    owned.set(id, entry);
    entry.offExit = api.onExit(id, () => {
      const waiting = entry.req;
      forget(id);
      if (waiting !== undefined) reply({ op: "created", req: waiting, id: null, failed: true });
    });
    const port = early.get(id);
    early.delete(id);
    if (port) route(id, entry, port);
    else entry.timer = setTimeout(() => giveUp(id, req), portWaitMs);
    settleEarly();
  }

  control.onmessage = (event) => {
    const m = event.data as Record<string, unknown> | null;
    if (!m || typeof m !== "object") return;
    if (m.op === "create" && Number.isInteger(m.req) && isPtySize(m.cols) && isPtySize(m.rows)) {
      void create(m.req as number, m.cols, m.rows);
    } else if (m.op === "kill" && isPtyId(m.id) && owned.has(m.id)) {
      api.kill(m.id);
      forget(m.id);
    }
  };
  control.start();

  function offer(event: PortOffer) {
    if (!isPtyPortMessage(event.data)) return;
    const { id } = event.data;
    const port = event.ports[0];
    const trusted = !stopped && event.source === self && event.origin === APP_ORIGIN && event.ports.length === 1 && isPtyId(id);
    if (!trusted) return refusePtyPort(event);
    const entry = owned.get(id);
    if (entry?.req !== undefined) route(id, entry, port);
    else if (entry || early.has(id) || creating === 0) port.close();
    else early.set(id, port);
  }

  function stop() {
    if (stopped) return;
    for (const id of [...owned.keys()]) { api.kill(id); forget(id); }
    for (const port of early.values()) port.close();
    early.clear();
    stopped = true;
    control.onmessage = null;
    control.close();
  }

  return { offer, stop };
}

/** Give the iframe this panel rendered a control port to the desktop's pty. The handoff reaches
 *  the frame only while it holds a page on app://terminal: any other document never sees it. */
export function handOffTerminalPort(
  frame: { postMessage(message: unknown, targetOrigin: string, transfer: Transferable[]): void },
  api: LocalPtyApi,
  colors: TerminalColors,
  self: unknown,
): PtyPortRouter {
  const channel = new MessageChannel();
  const router = servePtyToFrame(channel.port1, api, self);
  frame.postMessage({ type: TERMINAL_PORT_MESSAGE, colors }, TERMINAL_ORIGIN, [channel.port2]);
  return router;
}

// Fakes for the desktop local terminal's tests: the preload's `pty`, the pty host behind each pty's
// port, and a port that records what crosses it. Every call lands in one `calls` list.
import type { LocalPtyApi } from "../../../src/features/ide/model/localPty.ts";
import type { PortLike, TerminalPtyApi } from "../../../src/features/ide/model/terminalPort.ts";

type Call = [string, ...unknown[]];

const listen = <T>(map: Map<string, Set<T>>, id: string, cb: T) => {
  const set = map.get(id) ?? new Set<T>();
  set.add(cb);
  map.set(id, set);
  return () => { set.delete(cb); };
};

/** A port that records what is posted on it and whether it was closed. `receive` plays the other end. */
export function fakePort(name = "port") {
  const posted: Array<{ message: unknown; transfer: unknown[] }> = [];
  const port = {
    name,
    closed: false,
    posted,
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage(message: unknown, transfer?: unknown) {
      posted.push({ message, transfer: Array.isArray(transfer) ? transfer : [] });
    },
    close() { port.closed = true; },
    start() {},
    receive(data: unknown, ports: unknown[] = []) {
      port.onmessage?.({ data, ports } as unknown as MessageEvent);
    },
  };
  return port;
}
export type FakePort = ReturnType<typeof fakePort>;

/** The preload's pty. Each create answers with the next of `created`: an id, null (refused) or an
 *  Error (failed). */
export function fakePty(created: Array<string | null | Error> = ["p1"]) {
  const calls: Call[] = [];
  const exits = new Map<string, Set<(code: number) => void>>();
  const api: LocalPtyApi = {
    create: async (cols, rows) => {
      calls.push(["create", cols, rows]);
      const next = created.shift() ?? null;
      if (next instanceof Error) throw next;
      return next;
    },
    kill: (id) => { calls.push(["kill", id]); },
    onExit: (id, cb) => listen(exits, id, cb),
  };
  const exit = (id: string, code: number) => { for (const cb of exits.get(id) ?? []) cb(code); };
  const listeners = () => [...exits.values()].reduce((n, set) => n + set.size, 0);
  const of = (kind: string) => calls.filter((call) => call[0] === kind);
  /** The next create waits until the test answers it: a desktop still starting the shell. */
  const deferCreate = () => {
    let answer: (id: string | null) => void = () => {};
    api.create = (cols, rows) => {
      calls.push(["create", cols, rows]);
      return new Promise((resolve) => { answer = resolve; });
    };
    return (id: string | null) => answer(id);
  };
  return { api, calls, exit, listeners, of, deferCreate };
}

/** The pty host behind real ports: what a frame posts on a pty's port lands in `calls` as
 *  [op, id, ...], and `output`/`exit` play the shell. Close every channel with `closeAll`. */
export function fakePtyHost(calls: Call[]) {
  const channels = new Map<string, MessageChannel>();
  const open = (id: string): MessagePort => {
    const channel = new MessageChannel();
    channels.set(id, channel);
    channel.port1.onmessage = (event) => {
      const m = event.data as { op: string; data?: string; cols?: number; rows?: number; chars?: number };
      if (m.op === "write") calls.push(["write", id, m.data]);
      else if (m.op === "resize") calls.push(["resize", id, m.cols, m.rows]);
      else if (m.op === "ack") calls.push(["ack", id, m.chars]);
      else calls.push([m.op, id]);
    };
    return channel.port2;
  };
  const output = (id: string, data: string) => channels.get(id)?.port1.postMessage({ op: "data", data });
  const exit = (id: string, exitCode: number) => {
    channels.get(id)?.port1.postMessage({ op: "exit", exitCode });
    channels.get(id)?.port1.close();
  };
  const closeAll = () => {
    for (const channel of channels.values()) { channel.port1.close(); channel.port2.close(); }
    channels.clear();
  };
  return { open, output, exit, closeAll };
}

/** The page's pty API with a recording port per shell: VS Code's process side, without a panel. */
export function fakeTerminalPty(created: Array<string | null | Error> = ["p1"]) {
  const calls: Call[] = [];
  const ports = new Map<string, FakePort>();
  const portFor = (id: string) => {
    const port = fakePort(id);
    port.postMessage = (message: unknown) => {
      const m = message as { op: string; data?: string; cols?: number; rows?: number; chars?: number };
      if (m.op === "write") calls.push(["write", id, m.data]);
      else if (m.op === "resize") calls.push(["resize", id, m.cols, m.rows]);
      else if (m.op === "ack") calls.push(["ack", id, m.chars]);
      else calls.push([m.op, id]);
    };
    const close = port.close;
    port.close = () => { if (!port.closed) calls.push(["close", id]); close(); };
    ports.set(id, port);
    return port;
  };
  const connect = (id: string | null) => (id ? { id, port: portFor(id) as PortLike } : null);
  let deferNext = false;
  let answerDeferred: (id: string | null) => void = () => {};
  const api: TerminalPtyApi = {
    create: async (cols, rows) => {
      calls.push(["create", cols, rows]);
      if (deferNext) {
        deferNext = false;
        return new Promise((resolve) => { answerDeferred = (id) => resolve(connect(id)); });
      }
      const next = created.shift() ?? null;
      if (next instanceof Error) throw next;
      return connect(next);
    },
    kill: (id) => { calls.push(["kill", id]); },
  };
  /** The next create waits until the test answers it. */
  const deferCreate = () => {
    deferNext = true;
    return (id: string | null) => answerDeferred(id);
  };
  const emit = (id: string, data: string) => ports.get(id)?.receive({ op: "data", data });
  const exit = (id: string, exitCode: number) => ports.get(id)?.receive({ op: "exit", exitCode });
  const listening = () => [...ports.values()].filter((port) => !port.closed && port.onmessage).length;
  const of = (kind: string) => calls.filter((call) => call[0] === kind);
  return { api, calls, emit, exit, listening, of, deferCreate };
}

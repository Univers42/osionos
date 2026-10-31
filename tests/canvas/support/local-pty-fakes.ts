// Fakes for the desktop local terminal: a preload `pty` that records every call and lets a test
// play the shell, and the xterm surface the session drives.
import type { LocalPtyApi } from "../../../src/features/ide/model/localPty.ts";
import type { LocalTerminalSurface } from "../../../src/features/ide/model/localTerminalSession.ts";

type Call = [string, ...unknown[]];

/** A preload `pty` that records every call and lets the test play the shell. */
export function fakePty(created: Array<string | null | Error> = ["p1"]) {
  const calls: Call[] = [];
  const data = new Map<string, Set<(chunk: string) => void>>();
  const exits = new Map<string, Set<(code: number) => void>>();
  const listen = <T>(map: Map<string, Set<T>>, id: string, cb: T) => {
    const set = map.get(id) ?? new Set<T>();
    set.add(cb);
    map.set(id, set);
    return () => { set.delete(cb); };
  };
  const api: LocalPtyApi = {
    create: async (cols, rows) => {
      calls.push(["create", cols, rows]);
      const next = created.shift() ?? null;
      if (next instanceof Error) throw next;
      return next;
    },
    write: (id, chunk) => { calls.push(["write", id, chunk]); },
    resize: (id, cols, rows) => { calls.push(["resize", id, cols, rows]); },
    kill: (id) => { calls.push(["kill", id]); },
    ack: (id, chars) => { calls.push(["ack", id, chars]); },
    onData: (id, cb) => listen(data, id, cb),
    onExit: (id, cb) => listen(exits, id, cb),
  };
  const emit = (id: string, chunk: string) => { for (const cb of data.get(id) ?? []) cb(chunk); };
  const exit = (id: string, code: number) => { for (const cb of exits.get(id) ?? []) cb(code); };
  const listeners = () => [...data.values(), ...exits.values()].reduce((n, set) => n + set.size, 0);
  const of = (kind: string) => calls.filter((call) => call[0] === kind);
  return { api, calls, emit, exit, listeners, of };
}

/** The xterm surface the session needs; `render()` plays xterm finishing its queued writes. */
export function fakeTerm(cols = 80, rows = 24) {
  const shown: string[] = [];
  const pendingRender: Array<() => void> = [];
  const input = new Set<(data: string) => void>();
  const resized = new Set<(size: { cols: number; rows: number }) => void>();
  let focused = 0;
  const term: LocalTerminalSurface & { cols: number; rows: number } = {
    cols,
    rows,
    onData: (cb) => { input.add(cb); return { dispose: () => { input.delete(cb); } }; },
    onResize: (cb) => { resized.add(cb); return { dispose: () => { resized.delete(cb); } }; },
    write: (chunk, cb) => { shown.push(chunk); if (cb) pendingRender.push(cb); },
    focus: () => { focused++; },
  };
  const type = (data: string) => { for (const cb of input) cb(data); };
  const resize = (nextCols: number, nextRows: number) => {
    term.cols = nextCols;
    term.rows = nextRows;
    for (const cb of resized) cb({ cols: nextCols, rows: nextRows });
  };
  const render = () => { for (const cb of pendingRender.splice(0)) cb(); };
  return { term, shown, type, resize, render, focused: () => focused, subscribers: () => input.size + resized.size };
}

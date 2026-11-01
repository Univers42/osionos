// A preload `pty` for the desktop local terminal's tests: it records every call and lets a test
// play the shell.
import type { LocalPtyApi } from "../../../src/features/ide/model/localPty.ts";

type Call = [string, ...unknown[]];

/** Each create answers with the next of `created`: an id, null (refused) or an Error (failed). */
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
  /** The next create waits until the test answers it: a desktop still starting the shell. */
  const deferCreate = () => {
    let answer: (id: string) => void = () => {};
    api.create = () => new Promise((resolve) => { answer = resolve; });
    return (id: string) => answer(id);
  };
  return { api, calls, emit, exit, listeners, of, deferCreate };
}

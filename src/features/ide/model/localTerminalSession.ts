// One xterm over one shell on this computer (devil verdict 2026-10-31, desktop local terminal).
// C3: the pty hears xterm's input and resize, and nothing else. The run bus, tasks.json and the
// debugger reach only the sandbox terminal (useIdeTerminal), because a collaborator's task would
// otherwise run as the person, in $HOME. C7: output is acknowledged once xterm has rendered it,
// so the main process can pause a flooding shell (`yes`) instead of stalling its event loop.
import type { LocalPtyApi } from "./localPty";

/** The preload drops a write longer than this. */
export const MAX_PTY_WRITE = 65536;
const MAX_PTY_DIMENSION = 1000;

/** The part of an xterm Terminal the session drives. */
export interface LocalTerminalSurface {
  readonly cols: number;
  readonly rows: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onResize(listener: (size: { cols: number; rows: number }) => void): { dispose(): void };
  write(data: string, callback?: () => void): void;
  focus(): void;
}

export interface LocalTerminalSession {
  dispose(): void;
}

type Phase = "starting" | "live" | "idle" | "disposed";

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/** `data` in pieces the preload accepts. A piece never ends on the first half of a surrogate
 *  pair: the shell would receive two broken characters instead of one emoji. */
export function chunkPtyInput(data: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(start + MAX_PTY_WRITE, data.length);
    if (end < data.length && isHighSurrogate(data.charCodeAt(end - 1))) end -= 1;
    chunks.push(data.slice(start, end));
    start = end;
  }
  return chunks;
}

/** A terminal size the preload accepts: an integer from 1 to 1000.
 *  Caveat: a terminal wider or taller than 1000 cells runs its shell at 1000, so full-screen
 *  programs wrap early there. */
export function ptyDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PTY_DIMENSION, Math.max(1, Math.trunc(value)));
}

const notice = (text: string): string => `\r\n\x1b[2m[${text}]\x1b[0m\r\n`;
const REFUSED = notice("too many terminals are open in this window — close one, then press Enter");
const FAILED = notice("could not start a shell — press Enter to try again");
const exited = (code: number): string => notice(`shell exited (code ${code}) — press Enter for a new one`);

/** Starts a shell at the terminal's size at once. After an exit or a refusal, Enter starts
 *  another; what is typed while a shell starts is sent to it once it runs. */
export function createLocalTerminalSession({ api, term }: { api: LocalPtyApi; term: LocalTerminalSurface }): LocalTerminalSession {
  let phase: Phase = "starting";
  let ptyId: string | null = null;
  let typedWhileStarting = "";
  let createdAt = { cols: 0, rows: 0 };
  let offPty: Array<() => void> = [];

  const send = (id: string, data: string): void => {
    for (const chunk of chunkPtyInput(data)) api.write(id, chunk);
  };

  const detach = (): void => {
    for (const off of offPty) off();
    offPty = [];
    ptyId = null;
  };

  const settleIdle = (line: string): void => {
    phase = "idle";
    typedWhileStarting = "";
    term.write(line);
  };

  const attach = (id: string): void => {
    ptyId = id;
    phase = "live";
    offPty = [
      // Acked only while this pty is the live one: an exited or killed id is never acked.
      api.onData(id, (data) => term.write(data, () => { if (ptyId === id) api.ack(id, data.length); })),
      api.onExit(id, (code) => { detach(); settleIdle(exited(code)); }),
    ];
    const cols = ptyDimension(term.cols), rows = ptyDimension(term.rows);
    if (cols !== createdAt.cols || rows !== createdAt.rows) api.resize(id, cols, rows);
    if (typedWhileStarting !== "") send(id, typedWhileStarting);
    typedWhileStarting = "";
    term.focus();
  };

  const start = (): void => {
    phase = "starting";
    createdAt = { cols: ptyDimension(term.cols), rows: ptyDimension(term.rows) };
    api.create(createdAt.cols, createdAt.rows).then(
      (id) => {
        if (phase === "disposed") {
          if (id !== null) api.kill(id);
        } else if (id === null) settleIdle(REFUSED);
        else attach(id);
      },
      () => { if (phase !== "disposed") settleIdle(FAILED); },
    );
  };

  const input = term.onData((data) => {
    if (phase === "live" && ptyId !== null) send(ptyId, data);
    else if (phase === "starting") typedWhileStarting += data;
    else if (phase === "idle" && data.includes("\r")) start();
  });
  const resize = term.onResize(({ cols, rows }) => {
    if (phase === "live" && ptyId !== null) api.resize(ptyId, ptyDimension(cols), ptyDimension(rows));
  });

  start();
  return {
    dispose() {
      if (phase === "disposed") return;
      const id = ptyId;
      phase = "disposed";
      detach();
      input.dispose();
      resize.dispose();
      if (id !== null) api.kill(id);
    },
  };
}

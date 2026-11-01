// The desktop's local shell behind VS Code's terminal (groot ADR 0038): the desktop shell owns the
// pty; this carries keystrokes, resizes and render acknowledgements only — never a command chosen
// by page content (C3).
import { chunkPtyInput, ptyDimension, type LocalPtyApi } from "./localPty";

export interface LocalPtyEvents {
  data(data: string): void;
  exit(exitCode: number): void;
}

/** One shell for one VS Code terminal. VS Code sends keystrokes and sizes as soon as it marks the
 *  process ready, which is before the desktop answers create: those wait for the shell. */
export function createLocalPtyProcess(api: LocalPtyApi, events: LocalPtyEvents) {
  let id: string | null = null;
  let unsubscribe: Array<() => void> = [];
  let phase: "idle" | "starting" | "live" | "ended" = "idle";
  let typedWhileStarting = "";
  let size = { cols: 0, rows: 0 };
  // Read through a call: shutdown() may run while start() awaits the desktop.
  const isEnded = () => phase === "ended";

  const send = (to: string, data: string) => {
    for (const chunk of chunkPtyInput(data)) api.write(to, chunk);
  };

  const end = () => {
    for (const off of unsubscribe) off();
    unsubscribe = [];
    id = null;
    phase = "ended";
    typedWhileStarting = "";
  };

  return {
    async start(cols: number, rows: number): Promise<"started" | "refused" | "failed"> {
      phase = "starting";
      size = { cols: ptyDimension(cols), rows: ptyDimension(rows) };
      const createdAt = size;
      let created: string | null;
      try {
        created = await api.create(createdAt.cols, createdAt.rows);
      } catch {
        end();
        return "failed";
      }
      // VS Code closed the terminal while the shell started: nothing will ever show this one.
      if (isEnded()) {
        if (created) api.kill(created);
        return "failed";
      }
      if (!created) {
        end();
        return "refused";
      }
      id = created;
      phase = "live";
      unsubscribe = [
        api.onData(created, events.data),
        api.onExit(created, (exitCode) => { end(); events.exit(exitCode); }),
      ];
      if (size.cols !== createdAt.cols || size.rows !== createdAt.rows) api.resize(created, size.cols, size.rows);
      if (typedWhileStarting) send(created, typedWhileStarting);
      typedWhileStarting = "";
      return "started";
    },
    input(data: string): void {
      if (id) send(id, data);
      else if (phase === "starting") typedWhileStarting += data;
    },
    resize(cols: number, rows: number): void {
      size = { cols: ptyDimension(cols), rows: ptyDimension(rows) };
      if (id) api.resize(id, size.cols, size.rows);
    },
    /** Characters VS Code finished rendering: the desktop shell resumes a paused pty on these. */
    ack(chars: number): void {
      if (id && chars > 0) api.ack(id, chars);
    },
    shutdown(): void {
      if (id) api.kill(id);
      end();
    },
  };
}

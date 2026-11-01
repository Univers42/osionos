// The desktop's local shell behind one VS Code terminal (groot ADR 0038, ADR 0039): the desktop
// owns the pty; this carries keystrokes, resizes and render acknowledgements on that pty's own port,
// straight to the pty host, and never a command chosen by page content (C3).
import { chunkPtyInput, ptyDimension } from "./localPty";
import type { PtyConnection, TerminalPtyApi } from "./terminalPort";

export interface LocalPtyEvents {
  data(data: string): void;
  exit(exitCode: number): void;
}

/** One shell for one VS Code terminal. VS Code sends keystrokes and sizes as soon as it marks the
 *  process ready, which is before the desktop answers create: those wait for the shell. */
export function createLocalPtyProcess(api: TerminalPtyApi, events: LocalPtyEvents) {
  let shell: PtyConnection | null = null;
  let phase: "idle" | "starting" | "live" | "ended" = "idle";
  let typedWhileStarting = "";
  let size = { cols: 0, rows: 0 };
  // Read through a call: shutdown() may run while start() awaits the desktop.
  const isEnded = () => phase === "ended";

  const send = (data: string) => {
    for (const chunk of chunkPtyInput(data)) shell?.port.postMessage({ op: "write", data: chunk });
  };

  const end = () => {
    if (shell) {
      shell.port.onmessage = null;
      shell.port.close();
    }
    shell = null;
    phase = "ended";
    typedWhileStarting = "";
  };

  const listen = (connection: PtyConnection) => {
    connection.port.onmessage = (event) => {
      const m = event.data as { op?: unknown; data?: unknown; exitCode?: unknown } | null;
      if (m?.op === "data" && typeof m.data === "string") events.data(m.data);
      else if (m?.op === "exit" && typeof m.exitCode === "number") {
        end();
        events.exit(m.exitCode);
      }
    };
    connection.port.start();
  };

  return {
    async start(cols: number, rows: number): Promise<"started" | "refused" | "failed"> {
      phase = "starting";
      size = { cols: ptyDimension(cols), rows: ptyDimension(rows) };
      const createdAt = size;
      let created: PtyConnection | null;
      try {
        created = await api.create(createdAt.cols, createdAt.rows);
      } catch {
        end();
        return "failed";
      }
      // VS Code closed the terminal while the shell started: nothing will ever show this one.
      if (isEnded()) {
        if (created) {
          api.kill(created.id);
          created.port.close();
        }
        return "failed";
      }
      if (!created) {
        end();
        return "refused";
      }
      shell = created;
      phase = "live";
      listen(created);
      if (size.cols !== createdAt.cols || size.rows !== createdAt.rows) created.port.postMessage({ op: "resize", ...size });
      if (typedWhileStarting) send(typedWhileStarting);
      typedWhileStarting = "";
      return "started";
    },
    input(data: string): void {
      if (shell) send(data);
      else if (phase === "starting") typedWhileStarting += data;
    },
    resize(cols: number, rows: number): void {
      size = { cols: ptyDimension(cols), rows: ptyDimension(rows) };
      shell?.port.postMessage({ op: "resize", cols: size.cols, rows: size.rows });
    },
    /** Characters VS Code finished rendering: the pty host resumes a paused pty on these. */
    ack(chars: number): void {
      if (chars > 0) shell?.port.postMessage({ op: "ack", chars });
    },
    shutdown(): void {
      if (shell) api.kill(shell.id);
      end();
    },
  };
}

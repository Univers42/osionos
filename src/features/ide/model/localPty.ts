// The shell on this computer, as the desktop app's preload exposes it (devil verdict 2026-10-31,
// desktop local terminal). `window.osionosDesktop.pty` exists only in the FULL edition on
// app://osionos; the web app and the other editions have none, and keep the machine launcher.
// Main picks the login shell, its argv, $HOME as cwd and the environment: the renderer cannot.

export interface LocalPtyApi {
  /** A pty id, or null when refused (eight already open in this window). */
  create(cols: number, rows: number): Promise<string | null>;
  /** At most 65536 characters per call; the shell drops a longer one. */
  write(id: string, data: string): void;
  /** Integers from 1 to 1000. */
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  /** Flow control: the characters of output the renderer has finished rendering. */
  ack(id: string, chars: number): void;
  onData(id: string, cb: (data: string) => void): () => void;
  onExit(id: string, cb: (exitCode: number) => void): () => void;
}

const PTY_METHODS = ["create", "write", "resize", "kill", "ack", "onData", "onExit"] as const;

/** The preload's pty, or null when any method of the contract is missing. */
export function localPtyApi(): LocalPtyApi | null {
  const pty = (globalThis as { osionosDesktop?: { pty?: unknown } }).osionosDesktop?.pty;
  if (typeof pty !== "object" || pty === null) return null;
  const methods = pty as Record<string, unknown>;
  return PTY_METHODS.every((name) => typeof methods[name] === "function") ? (pty as LocalPtyApi) : null;
}

export function hasLocalTerminal(): boolean {
  return localPtyApi() !== null;
}

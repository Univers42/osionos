// The shell on this computer, as the desktop app's preload exposes it (devil verdict 2026-10-31,
// desktop local terminal, amendment 2). `window.osionosDesktop.pty` exists only in the FULL edition
// on app://osionos; the web app and the other editions have none, and keep the machine launcher.
// Main picks the login shell, its argv, $HOME as cwd and the environment: the renderer cannot.
// A shell's I/O never crosses this API: after create, the preload posts that pty's own port to this
// window (`PTY_PORT_MESSAGE`, ptyPortRouter.ts), and keystrokes and output travel on it.

export interface LocalPtyApi {
  /** A pty id, or null when refused (eight already open in this window). */
  create(cols: number, rows: number): Promise<string | null>;
  kill(id: string): void;
  onExit(id: string, cb: (exitCode: number) => void): () => void;
}

/** The pty host drops a write longer than this. */
export const MAX_PTY_WRITE = 65536;
const MAX_PTY_DIMENSION = 1000;

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/** `data` in pieces the pty host accepts. A piece never ends on the first half of a surrogate
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

/** A terminal size the pty host accepts: an integer from 1 to 1000.
 *  Caveat: a terminal wider or taller than 1000 cells runs its shell at 1000, so full-screen
 *  programs wrap early there. */
export function ptyDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PTY_DIMENSION, Math.max(1, Math.trunc(value)));
}

const PTY_METHODS = ["create", "kill", "onExit"] as const;
// A desktop built before the direct port posts no pty port, so its terminal would never start: a
// skewed pair shows no local terminal instead (T3).
const RETIRED_METHODS = ["write", "resize", "ack", "onData"] as const;

/** The preload's pty, or null when a method of the contract is missing or a retired one remains. */
export function localPtyApi(): LocalPtyApi | null {
  const pty = (globalThis as { osionosDesktop?: { pty?: unknown } }).osionosDesktop?.pty;
  if (typeof pty !== "object" || pty === null) return null;
  const methods = pty as Record<string, unknown>;
  if (RETIRED_METHODS.some((name) => name in methods)) return null;
  return PTY_METHODS.every((name) => typeof methods[name] === "function") ? (pty as LocalPtyApi) : null;
}

export function hasLocalTerminal(): boolean {
  return localPtyApi() !== null;
}

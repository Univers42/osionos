// The terminal page (groot ADR 0038): VS Code's own terminal, drawn in the app's terminal panel, on
// this computer's shell. The page reaches the shell only through the port the panel hands to the
// iframe it rendered (devil amendment A1); framed anywhere else, or never handed a port, it draws
// nothing and takes no focus.
import { ITerminalService, getService, initialize } from "@codingame/monaco-vscode-api";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import { SimpleTerminalBackend, SimpleTerminalProcess } from "@codingame/monaco-vscode-terminal-service-override";
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import type { LocalPtyApi } from "../features/ide/model/localPty";
import { createLocalPtyProcess } from "../features/ide/model/localPtyProcess";
import { acceptTerminalPort, ptyApiOverPort, terminalColorsFrom, type TerminalColors } from "../features/ide/model/terminalPort";
import { terminalModeServices } from "./services";
import "./terminal.css";

const terminalEl = document.getElementById("terminal") as HTMLElement;
const PLACEHOLDER_PID = 1;

class LocalShellProcess extends SimpleTerminalProcess {
  private readonly exited = new Emitter<number>();
  private readonly core;
  override onProcessExit = this.exited.event;

  constructor(api: LocalPtyApi, private readonly size: { cols: number; rows: number }) {
    const output = new Emitter<string>();
    // VS Code queues every keystroke until the process reports a non-zero pid
    // (terminalProcessManager write()); the desktop keeps the real one, so this stands in for it.
    super(1, PLACEHOLDER_PID, "", output.event);
    this.core = createLocalPtyProcess(api, { data: (data) => output.fire(data), exit: (code) => this.exited.fire(code) });
  }

  async start() {
    const started = await this.core.start(this.size.cols, this.size.rows);
    if (started === "refused") return { message: "8 terminals are already open in this window. Close one to open another." };
    return started === "failed" ? { message: "The shell on this computer could not start." } : undefined;
  }
  input(data: string) { this.core.input(data); }
  resize(cols: number, rows: number) { this.core.resize(cols, rows); }
  shutdown() { this.core.shutdown(); }
  // VS Code passes the characters it rendered; the base class declares no parameter.
  override acknowledgeDataEvent(charCount?: number) { this.core.ack(charCount ?? 0); }
  sendSignal() { /* the shell gets Ctrl+C as input, as in a real terminal */ }
  clearBuffer() { /* VS Code clears its own view; the shell keeps no buffer */ }
}

class LocalShellBackend extends SimpleTerminalBackend {
  constructor(private readonly api: LocalPtyApi) { super(); }
  getDefaultSystemShell = async () => "";
  createProcess = async (_launch: unknown, _cwd: unknown, cols: number, rows: number) => new LocalShellProcess(this.api, { cols, rows });
}

// VS Code's default theme on the dock's side of light or dark, repainted in the dock's own colours.
// Caveat: light/dark is the background's perceived brightness against the midpoint; a mid-grey dock
// (around #808080) can land on the theme whose foreground colours have less contrast.
const isLight = (hex: string): boolean => {
  const full = hex.length <= 5 ? [...hex.slice(1, 4)].map((c) => c + c).join("") : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 128;
};

function terminalTheme(colors: TerminalColors) {
  const customizations: Record<string, string> = {};
  if (colors.background) customizations["terminal.background"] = colors.background;
  if (colors.foreground) customizations["terminal.foreground"] = colors.foreground;
  if (colors.cursor) customizations["terminalCursor.foreground"] = colors.cursor;
  if (colors.selection) customizations["terminal.selectionBackground"] = colors.selection;
  return {
    "workbench.colorTheme": colors.background && isLight(colors.background) ? "Default Light Modern" : "Default Dark Modern",
    "workbench.colorCustomizations": customizations,
  };
}

async function start(api: LocalPtyApi, colors: TerminalColors) {
  if (colors.background) document.body.style.background = colors.background;
  await initialize(terminalModeServices(new LocalShellBackend(api) as never), undefined, {
    configurationDefaults: terminalTheme(colors),
    workspaceProvider: { trusted: false, workspace: undefined, open: async () => false },
  } as never);
  const terminals = await getService(ITerminalService);
  const terminal = await terminals.createTerminal({});
  terminal.attachToElement(terminalEl);
  terminal.setVisible(true);
  const layout = () => terminal.layout({ width: terminalEl.clientWidth, height: terminalEl.clientHeight });
  new ResizeObserver(layout).observe(terminalEl);
  layout();
  terminal.focus();
}

// Only a frame of the app's own top page, and only the first port it hands over (A1, A2).
const framedByTheApp = window.parent !== window && window.parent === window.top;
function onHandoff(event: MessageEvent) {
  const port = acceptTerminalPort(event, { parent: window.parent, origin: location.origin });
  if (!port) return;
  window.removeEventListener("message", onHandoff);
  const colors = terminalColorsFrom((event.data as { colors?: unknown }).colors);
  void start(ptyApiOverPort(port), colors).catch((error: Error) => {
    terminalEl.textContent = `The terminal did not start: ${error.message}`;
  });
}
if (framedByTheApp) window.addEventListener("message", onHandoff);

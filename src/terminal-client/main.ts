// The terminal page (groot ADR 0038, ADR 0039): VS Code's own terminal panel (tabs, toolbar, find,
// splits, several terminals), drawn in the app's dock, on this computer's shells. It runs on app://terminal, in its own renderer process. It reaches
// the shell only through the control port the panel hands to the iframe it rendered (devil amendment
// A1), and each terminal talks to its pty host over that pty's own port. Framed anywhere else, or
// never handed a port, it draws nothing and takes no focus.
import { ITerminalGroupService, IWorkbenchLayoutService, getService, initialize } from "@codingame/monaco-vscode-api";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import { SimpleTerminalBackend, SimpleTerminalProcess } from "@codingame/monaco-vscode-terminal-service-override";
import { Parts, attachPart, onPartVisibilityChange } from "@codingame/monaco-vscode-views-service-override";
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { ProcessPropertyType } from "@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal";
import { createLocalPtyProcess } from "../features/ide/model/localPtyProcess";
import { acceptTerminalPort, ptyApiOverPort, terminalColorsFrom, type TerminalColors, type TerminalPtyApi } from "../features/ide/model/terminalPort";
import { terminalModeServices, terminalWorkbenchOptions } from "./services";
import "./terminal.css";

const terminalEl = document.getElementById("terminal") as HTMLElement;
const PLACEHOLDER_PID = 1;
let nextProcessId = 0;

class LocalShellProcess extends SimpleTerminalProcess {
  private readonly exited = new Emitter<number>();
  private readonly core;
  override onProcessExit = this.exited.event;

  constructor(api: TerminalPtyApi, private readonly size: { cols: number; rows: number }) {
    const output = new Emitter<string>();
    // VS Code queues every keystroke until the process reports a non-zero pid
    // (terminalProcessManager write()); the desktop keeps the real one, so this stands in for it.
    super(++nextProcessId, PLACEHOLDER_PID, "", output.event);
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
  // The desktop picks the cwd ($HOME) and does not report it; VS Code wants a string, not undefined.
  // (The base class declares it without the property it is asked for.)
  override refreshProperty = (async (property: ProcessPropertyType) =>
    property === ProcessPropertyType.Cwd || property === ProcessPropertyType.InitialCwd ? "" : undefined) as unknown as SimpleTerminalProcess["refreshProperty"];
  sendSignal() { /* the shell gets Ctrl+C as input, as in a real terminal */ }
  clearBuffer() { /* VS Code clears its own view; the shell keeps no buffer */ }
}

class LocalShellBackend extends SimpleTerminalBackend {
  constructor(private readonly api: TerminalPtyApi) { super(); }
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

function terminalSettings(colors: TerminalColors) {
  const customizations: Record<string, string> = {};
  if (colors.background) {
    customizations["terminal.background"] = colors.background;
    customizations["panel.background"] = colors.background;
  }
  if (colors.foreground) customizations["terminal.foreground"] = colors.foreground;
  if (colors.cursor) customizations["terminalCursor.foreground"] = colors.cursor;
  if (colors.selection) customizations["terminal.selectionBackground"] = colors.selection;
  return {
    "workbench.colorTheme": colors.background && isLight(colors.background) ? "Default Light Modern" : "Default Dark Modern",
    "workbench.colorCustomizations": customizations,
    // The dock owns closing; the last terminal closed leaves VS Code's panel with its "+" in place.
    "terminal.integrated.hideOnLastClosed": false,
  };
}

async function start(api: TerminalPtyApi, colors: TerminalColors) {
  if (colors.background) document.body.style.background = colors.background;
  await initialize(terminalModeServices(new LocalShellBackend(api) as never), undefined, terminalWorkbenchOptions(terminalSettings(colors)) as never);
  const layout = await getService(IWorkbenchLayoutService);
  // VS Code's panel is the whole page: hiding it would leave the dock blank.
  onPartVisibilityChange(Parts.PANEL_PART, (visible) => {
    if (!visible) layout.setPartHidden(false, Parts.PANEL_PART);
  });
  attachPart(Parts.PANEL_PART, terminalEl);
  layout.setPartHidden(false, Parts.PANEL_PART);
  // Showing the terminal view with no terminal starts one, as in VS Code.
  await (await getService(ITerminalGroupService)).showPanel(true);
}

// Only a frame of the app's own top page, and only the first port it hands over (A1, A2).
const framedByTheApp = window.parent !== window && window.parent === window.top;
function onHandoff(event: MessageEvent) {
  const port = acceptTerminalPort(event, { parent: window.parent, top: window.top, self: window });
  if (!port) return;
  window.removeEventListener("message", onHandoff);
  const colors = terminalColorsFrom((event.data as { colors?: unknown }).colors);
  void start(ptyApiOverPort(port), colors).catch((error: Error) => {
    terminalEl.textContent = `The terminal did not start: ${error.message}`;
  });
}
if (framedByTheApp) window.addEventListener("message", onHandoff);

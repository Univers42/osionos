// The terminal page (groot ADR 0038, ADR 0039, ADR 0041): VS Code's own terminal panel (tabs,
// toolbar, find, splits, several terminals), drawn in the app's dock, on this computer's shells.
// In the desktop app it runs on app://terminal, in its own renderer process, and reaches the shell
// only through the control port the panel hands to the iframe it rendered (devil amendment A1);
// each terminal talks to its pty host over that pty's own port. On the web it is served by this
// computer's osionos-node and each terminal is a WebSocket to that node (web.ts). Framed anywhere
// else, or never handed a port or a token, it draws nothing and takes no focus.
import { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";
import type { CodeTheme } from "../features/ide/model/codeTheme";
import { codeThemeSettings, legacyTerminalSettings } from "../features/ide/model/codeThemeSettings";
import { EDITOR_CHANNEL } from "../features/machines/model/editorFrameProtocol";
import { cdCommand } from "./cdCommand";
import { ITerminalGroupService, IWorkbenchLayoutService, getService, initialize } from "@codingame/monaco-vscode-api";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import { SimpleTerminalBackend, SimpleTerminalProcess } from "@codingame/monaco-vscode-terminal-service-override";
import { Parts, attachPart, onPartVisibilityChange } from "@codingame/monaco-vscode-views-service-override";
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { ProcessPropertyType } from "@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal";
import { createLocalPtyProcess } from "../features/ide/model/localPtyProcess";
import { acceptTerminalPort, ptyApiOverPort, terminalColorsFrom, type TerminalColors, type TerminalPtyApi } from "../features/ide/model/terminalPort";
import { terminalModeServices, terminalWorkbenchOptions } from "./services";
import { startOnTheWeb } from "./web";
import "./terminal.css";

const terminalEl = document.getElementById("terminal") as HTMLElement;
const PLACEHOLDER_PID = 1;
let nextProcessId = 0;

// Caveat: the line goes to the newest shell whatever it is running; with vim or a build in the
// foreground it lands there as keystrokes instead of moving the shell.
let newestShell: { input(data: string): void } | null = null;
let waitingLine: string | null = null;

function typeInNewestShell(line: string): void {
  if (newestShell) newestShell.input(line);
  else waitingLine = line;
}

new BroadcastChannel(EDITOR_CHANNEL).addEventListener("message", (event) => {
  if (event.data?.type !== "open-terminal" || typeof event.data.path !== "string") return;
  const line = cdCommand(event.data.path);
  if (line) typeInNewestShell(line);
});

class LocalShellProcess extends SimpleTerminalProcess {
  private readonly exited = new Emitter<number>();
  private readonly typing = { input: (data: string) => this.input(data) };
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
    if (started === "failed") return { message: "The shell on this computer could not start." };
    newestShell = this.typing;
    if (waitingLine) this.input(waitingLine);
    waitingLine = null;
    return undefined;
  }
  input(data: string) { this.core.input(data); }
  resize(cols: number, rows: number) { this.core.resize(cols, rows); }
  shutdown() {
    if (newestShell === this.typing) newestShell = null;
    this.core.shutdown();
  }
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

let appTheme: CodeTheme | null = null;
let workbenchRunning = false;

/** The app's theme whenever it comes; a running workbench repaints without touching its shells. */
function takeTheme(theme: CodeTheme): void {
  appTheme = theme;
  document.body.style.background = theme.colors.bg;
  if (workbenchRunning) void updateUserConfiguration(JSON.stringify(codeThemeSettings(theme)));
}

function terminalSettings(colors: TerminalColors) {
  return {
    ...(appTheme ? codeThemeSettings(appTheme) : legacyTerminalSettings(colors)),
    // The dock owns closing; the last terminal closed leaves VS Code's panel with its "+" in place.
    "terminal.integrated.hideOnLastClosed": false,
  };
}

async function start(api: TerminalPtyApi, colors: TerminalColors) {
  if (colors.background && !appTheme) document.body.style.background = colors.background;
  await initialize(terminalModeServices(new LocalShellBackend(api) as never), undefined, terminalWorkbenchOptions(terminalSettings(colors)) as never);
  workbenchRunning = true;
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

const showFailure = (error: Error) => { terminalEl.textContent = `The terminal did not start: ${error.message}`; };

// Only a frame of the app's own top page, and only the first port it hands over (A1, A2).
const framedByTheApp = window.parent !== window && window.parent === window.top;
function onHandoff(event: MessageEvent) {
  const port = acceptTerminalPort(event, { parent: window.parent, top: window.top, self: window });
  if (!port) return;
  window.removeEventListener("message", onHandoff);
  const colors = terminalColorsFrom((event.data as { colors?: unknown }).colors);
  void start(ptyApiOverPort(port), colors).catch(showFailure);
}
if (location.protocol === "app:") {
  if (framedByTheApp) window.addEventListener("message", onHandoff);
} else {
  void startOnTheWeb(start, takeTheme).catch(showFailure);
}

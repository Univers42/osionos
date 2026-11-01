// In the desktop app the Terminal entry points open the dock's terminal, a shell on this computer
// (owner, 2026-10-31): no machine window, no launcher or sandbox overlay, and a "This computer"
// chip. Without the preload's `pty` (the web app) each keeps today's machine behaviour.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// xterm is CommonJS and needs a DOM; a static render never opens it.
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@xterm/xterm") return { url: url("export class Terminal {}"), shortCircuit: true };
    if (specifier === "@xterm/addon-fit") return { url: url("export class FitAddon {}"), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { fakePty } = await import("./support/local-pty-fakes.ts");
const { useMachinesStore } = await import("../../src/features/machines/model/machinesStore.ts");
const { useSandboxHealthStore } = await import("../../src/features/ide/model/sandboxHealthStore.ts");
const { useWorkbenchStore } = await import("../../src/widgets/workbench/model/workbenchStore.ts");
const { openWorkbenchTerminal } = await import("../../src/widgets/workbench/model/workbenchMenuActions.ts");
const { WorkbenchStatusBar } = await import("../../src/widgets/workbench/ui/WorkbenchStatusBar.tsx");
const { IdeTerminal } = await import("../../src/features/ide/ui/IdeTerminal.tsx");
const { LocalVsCodeTerminal, TERMINAL_PAGE_SRC } = await import("../../src/features/ide/ui/LocalVsCodeTerminal.tsx");

const LAPTOP = {
  id: "m-abcdefghijklmnop", name: "laptop", platform: "linux-x64", fingerprint: "ABCD-EFGH-IJKL-MNOP",
  isDefault: true, online: true, ideOrigin: "http://127.0.0.1:4100", lastSeenAt: null,
};

// renderToStaticMarkup reads zustand's server snapshot, which is the initial state: no hosted
// sandbox, and one online machine.
useSandboxHealthStore.getInitialState().state = "disabled";
useMachinesStore.getInitialState().machines = [LAPTOP];

function onDesktop(run: () => void): void {
  Reflect.set(globalThis, "osionosDesktop", { pty: fakePty().api });
  try {
    run();
  } finally {
    Reflect.deleteProperty(globalThis, "osionosDesktop");
  }
}

function countWindowOpens(run: () => void): number {
  let opens = 0;
  const previous = Reflect.get(globalThis, "open");
  // null = a blocked popup: the machine controller stops there, before it listens for messages.
  Reflect.set(globalThis, "open", () => { opens++; return null; });
  try {
    run();
  } finally {
    Reflect.set(globalThis, "open", previous);
  }
  return opens;
}

test("Terminal menu on the desktop opens the dock's terminal, never a machine window", () => {
  useMachinesStore.setState({ machines: [LAPTOP] });
  useWorkbenchStore.setState({ dockOpen: false, dockTab: "problems" });
  const opens = countWindowOpens(() => onDesktop(() => openWorkbenchTerminal("new")));
  assert.equal(opens, 0);
  assert.equal(useWorkbenchStore.getState().dockOpen, true);
  assert.equal(useWorkbenchStore.getState().dockTab, "terminal");
});

test("Terminal menu on the web still opens the online machine's window", () => {
  useMachinesStore.setState({ machines: [LAPTOP] });
  useWorkbenchStore.setState({ dockOpen: false, dockTab: "problems" });
  assert.equal(countWindowOpens(() => openWorkbenchTerminal("new")), 1);
  assert.equal(useWorkbenchStore.getState().dockOpen, false);
});

test("the status bar names this computer on the desktop, the machine on the web", () => {
  let desktop = "";
  onDesktop(() => { desktop = renderToStaticMarkup(React.createElement(WorkbenchStatusBar)); });
  assert.match(desktop, /data-testid="local-terminal-chip"[^>]*>.*This computer/);
  assert.doesNotMatch(desktop, /machine-chip|sandbox-chip/);
  const web = renderToStaticMarkup(React.createElement(WorkbenchStatusBar));
  assert.match(web, /data-testid="machine-chip"/);
  assert.doesNotMatch(web, /local-terminal-chip/);
});

test("the desktop terminal panel frames VS Code's terminal page on its own origin", () => {
  const desktop = renderToStaticMarkup(React.createElement(LocalVsCodeTerminal, { api: fakePty().api }));
  assert.equal(TERMINAL_PAGE_SRC, "app://terminal/index.html");
  // No `name` (a named frame can be targeted by window.open), and only the clipboard (T4).
  assert.match(desktop, /<iframe src="app:\/\/terminal\/index.html" title="Terminal" allow="clipboard-read; clipboard-write"/);
  assert.doesNotMatch(desktop, / name=/);
  assert.doesNotMatch(desktop, /role="status"|Terminal on laptop|Open terminal/);
  const web = renderToStaticMarkup(React.createElement(IdeTerminal));
  assert.match(web, /Terminal on laptop/);
});

test("on the desktop the dock has no terminal buttons of its own: VS Code's panel carries them", async () => {
  const { WorkbenchDock } = await import("../../src/widgets/workbench/ui/WorkbenchDock.tsx");
  useWorkbenchStore.getInitialState().dockTab = "terminal";
  let desktop = "";
  onDesktop(() => { desktop = renderToStaticMarkup(React.createElement(WorkbenchDock)); });
  assert.doesNotMatch(desktop, /aria-label="(New terminal|Split terminal|Close split|Safe terminal|Restart box)"/);
  assert.match(desktop, /aria-label="Hide panel"/);
  const web = renderToStaticMarkup(React.createElement(WorkbenchDock));
  assert.match(web, /aria-label="New terminal"/);
  assert.match(web, /aria-label="Split terminal"/);
});

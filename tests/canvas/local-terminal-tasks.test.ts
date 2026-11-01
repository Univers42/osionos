// C3 of the desktop local terminal verdict (2026-10-31): a workspace page's tasks.json reaches the
// sandbox PTY as `cd /workspace && ${command}`, where a `;` runs even when the cd fails. On this
// computer that would run a collaborator's command in $HOME, so the local pty carries what is typed
// into VS Code's terminal page and its resizes only: the run bus, tasks and the debugger never write
// to it. The page store, the api
// client and the user store do not load under node, so they are stubbed with one workspace.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "@/store/usePageStore": "export const usePageStore = { getState: () => globalThis.__c3PageStore };",
  "@/shared/api/client": `export const API_BASE = ""; export function getActivePageJwt() { return "jwt"; }`,
  "@/features/auth": `export const useUserStore = { getState: () => ({ activeWorkspace: () => ({ _id: "ws" }), activePageJwt: () => "jwt" }) };`,
};
const STUB_FILES: Record<string, string> = {
  "/src/store/usePageStore.ts": STUBS["@/store/usePageStore"],
  "/src/shared/api/client.ts": STUBS["@/shared/api/client"],
  "/src/features/auth/index.ts": STUBS["@/features/auth"],
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: url(STUBS[specifier]), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    const file = Object.keys(STUB_FILES).find((suffix) => resolved.url.endsWith(suffix));
    return file ? { url: url(STUB_FILES[file]), shortCircuit: true } : resolved;
  },
});

const { fakePty, fakePtyHost } = await import("./support/local-pty-fakes.ts");
const { APP_ORIGIN, PTY_PORT_MESSAGE, ptyApiOverPort } = await import("../../src/features/ide/model/terminalPort.ts");
const { handOffTerminalPort } = await import("../../src/features/ide/model/ptyPortRouter.ts");
const { createLocalPtyProcess } = await import("../../src/features/ide/model/localPtyProcess.ts");
const { runDefaultTask, runInTerminal } = await import("../../src/features/ide/model/ideTasks.ts");
const { useTerminalRunBus } = await import("../../src/features/ide/model/terminalRunBus.ts");

const HOSTILE = "true; touch $S";
const TASKS_PAGE = {
  _id: "tasks-page",
  title: "tasks.json",
  parentPageId: null,
  surface: "code",
  content: [{ id: "b1", type: "code", content: JSON.stringify({ tasks: [{ label: "build", command: HOSTILE, group: "build", default: true }] }) }],
};
Reflect.set(globalThis, "__c3PageStore", {
  pages: { ws: [TASKS_PAGE] },
  pageById: (id: string) => (id === TASKS_PAGE._id ? TASKS_PAGE : undefined),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a default task from tasks.json makes 0 writes to the local pty", async () => {
  const pty = fakePty();
  const host = fakePtyHost(pty.calls);
  Reflect.set(globalThis, "osionosDesktop", { pty: pty.api });
  // The desktop chain as it runs: the panel hands the page a control port, the preload posts the
  // pty's own port to the window, the panel routes it, VS Code's process writes on it.
  const self = {};
  let pagePort: MessagePort | undefined;
  const router = handOffTerminalPort({ postMessage: (_m, _o, ports) => { pagePort = ports[0] as MessagePort; } }, pty.api, {}, self);
  const create = pty.api.create;
  pty.api.create = async (cols, rows) => {
    const id = await create(cols, rows);
    if (id) setTimeout(() => router.offer({ source: self, origin: APP_ORIGIN, data: { type: PTY_PORT_MESSAGE, id }, ports: [host.open(id)] }), 0);
    return id;
  };
  const shell = createLocalPtyProcess(ptyApiOverPort(pagePort as MessagePort), { data: () => {}, exit: () => {} });
  assert.equal(await shell.start(80, 24), "started");
  const seq = useTerminalRunBus.getState().seq;

  await runDefaultTask("build");
  await settle();
  // The task did run: it reached the run bus, the sandbox terminal's only input. Nothing drained it.
  assert.equal(useTerminalRunBus.getState().pending, `cd /workspace && ${HOSTILE}`);
  assert.deepEqual(pty.of("write"), []);

  await runDefaultTask();
  await runInTerminal("rm -rf ~");
  await settle();
  assert.equal(useTerminalRunBus.getState().seq, seq + 3);
  assert.deepEqual(pty.of("write"), []);

  shell.input("echo typed\r");
  for (let waited = 0; pty.of("write").length === 0 && waited < 2000; waited += 5) await settle();
  assert.deepEqual(pty.of("write"), [["write", "p1", "echo typed\r"]]);
  shell.shutdown();
  router.stop();
  pagePort?.close();
  host.closeAll();
  Reflect.deleteProperty(globalThis, "osionosDesktop");
});

// The web terminal's transport as it ships: bundled and minified by Vite, as vite.terminal.config.ts
// builds it. Bug 2026-11-01: Rollup folded the port's `onmessage: null` literal and deleted every
// `port.onmessage?.(...)` call, so the shell ran and echoed but the dock's terminal stayed blank. The
// source-level tests passed; only the bundle lost the output.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/features/ide/model/", import.meta.url));

// The page's own wiring: the socket api under the local pty process, the shell's output to `data`.
const ENTRY = `
import { ptyApiOverWebSocket } from "${SRC}terminalSocket.ts";
import { createLocalPtyProcess } from "${SRC}localPtyProcess.ts";
export async function run() {
  const seen = [];
  let socket;
  const api = ptyApiOverWebSocket(() => (socket = { send() {}, close() {}, onopen: null, onmessage: null, onclose: null }), {
    take: async () => ({ token: "osionos_mc1.a.b.c" }), keepSecret() {}, dropSecret() {},
  });
  const shell = createLocalPtyProcess(api, { data: (text) => seen.push(text), exit: (code) => seen.push("exit " + code) });
  const started = shell.start(80, 24);
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ op: "opened" }) });
  await started;
  socket.onmessage({ data: JSON.stringify({ op: "data", data: "prompt$ " }) });
  socket.onclose({ code: 1006 });
  return seen;
}`;

test("bundled, the shell's output and an unexplained drop still reach the terminal", async () => {
  const { build } = await import("vite");
  const dir = await mkdtemp(join(tmpdir(), "terminal-socket-bundle-"));
  try {
    const entry = join(dir, "entry.mjs");
    await writeFile(entry, ENTRY);
    await build({
      configFile: false, logLevel: "silent", root: dir,
      build: { outDir: join(dir, "out"), minify: true, lib: { entry, formats: ["es"], fileName: "bundle" } },
    });
    const { run } = await import(pathToFileURL(join(dir, "out", "bundle.mjs")).href);
    assert.deepEqual(await run(), ["prompt$ ", "exit 1"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

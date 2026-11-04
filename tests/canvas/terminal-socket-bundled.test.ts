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

// Amendment 1: the device secret the node issues reaches the frame's storage, and the next load opens
// with it beside the resume assertion, as the bundle runs it (R4, R9).
const REMEMBER_ENTRY = `
import { ptyApiOverWebSocket } from "${SRC}terminalSocket.ts";
import { createFrameCredentials, rememberedStoreOver } from "${SRC}terminalCredentials.ts";
const ORIGIN = "https://baas.tail10f2ea.ts.net:8443";
export async function run() {
  const items = new Map();
  const storage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), removeItem: (k) => items.delete(k) };
  const store = rememberedStoreOver(() => storage);
  const sent = [];
  let socket;
  const open = () => (socket = { send: (text) => sent.push(JSON.parse(text)), close() {}, onopen: null, onmessage: null, onclose: null });
  const first = createFrameCredentials({ ask() {}, appOrigin: () => ORIGIN, remembers: true, store });
  first.give("osionos_mc1.a.b.c");
  const opening = ptyApiOverWebSocket(open, first).create(80, 24);
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ op: "opened", secret: "S".repeat(43), device: "D".repeat(43) }) });
  await opening;
  const reload = createFrameCredentials({ ask() {}, appOrigin: () => ORIGIN, remembers: true, store });
  reload.giveResume("osionos_mr1.a.b.c");
  void ptyApiOverWebSocket(open, reload).create(80, 24);
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.onopen();
  return { sent, stored: [...items.entries()] };
}`;

test("bundled, a remembered device secret is stored and opens the next load's shell", async () => {
  const { build } = await import("vite");
  const dir = await mkdtemp(join(tmpdir(), "terminal-remember-bundle-"));
  try {
    const entry = join(dir, "entry.mjs");
    await writeFile(entry, REMEMBER_ENTRY);
    await build({
      configFile: false, logLevel: "silent", root: dir,
      build: { outDir: join(dir, "out"), minify: true, lib: { entry, formats: ["es"], fileName: "bundle" } },
    });
    const { run } = await import(pathToFileURL(join(dir, "out", "bundle.mjs")).href);
    const origin = "https://baas.tail10f2ea.ts.net:8443";
    assert.deepEqual(await run(), {
      sent: [
        { token: "osionos_mc1.a.b.c", appOrigin: origin, cols: 80, rows: 24 },
        { device: "D".repeat(43), assertion: "osionos_mr1.a.b.c", appOrigin: origin, cols: 80, rows: 24 },
      ],
      stored: [[`osionos-remembered:${origin}`, "D".repeat(43)]],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

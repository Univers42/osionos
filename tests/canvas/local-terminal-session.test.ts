// The desktop app's integrated terminal (devil verdict 2026-10-31, desktop local terminal): the
// dock's xterm drives a shell on this computer through the preload's `pty`. Only xterm input and
// resize reach it (C3); output is acknowledged once xterm has rendered it (C7); writes and sizes
// stay inside the preload's limits (C5).
import test from "node:test";
import assert from "node:assert/strict";

import { hasLocalTerminal, localPtyApi } from "../../src/features/ide/model/localPty.ts";
import {
  MAX_PTY_WRITE,
  chunkPtyInput,
  createLocalTerminalSession,
  ptyDimension,
} from "../../src/features/ide/model/localTerminalSession.ts";
import { fakePty, fakeTerm } from "./support/local-pty-fakes.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function withDesktop<T>(desktop: unknown, run: () => T): T {
  Reflect.set(globalThis, "osionosDesktop", desktop);
  try {
    return run();
  } finally {
    Reflect.deleteProperty(globalThis, "osionosDesktop");
  }
}

test("the local terminal exists only when the preload exposes every pty method", () => {
  const { api } = fakePty();
  assert.equal(localPtyApi(), null);
  assert.equal(hasLocalTerminal(), false);
  withDesktop({ minimize() {}, toggleMaximize() {}, close() {} }, () => assert.equal(hasLocalTerminal(), false));
  withDesktop({ pty: { ...api, ack: "not a function" } }, () => assert.equal(localPtyApi(), null));
  const withoutKill = Object.fromEntries(Object.entries(api).filter(([name]) => name !== "kill"));
  withDesktop({ pty: withoutKill }, () => assert.equal(hasLocalTerminal(), false));
  withDesktop({ pty: null }, () => assert.equal(hasLocalTerminal(), false));
  withDesktop({ pty: api }, () => {
    assert.equal(localPtyApi(), api);
    assert.equal(hasLocalTerminal(), true);
  });
});

test("the shell starts at the terminal's size and takes the focus", async () => {
  const pty = fakePty();
  const view = fakeTerm(132, 40);
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  assert.deepEqual(pty.of("create"), [["create", 132, 40]]);
  assert.equal(view.focused(), 1);
});

test("keystrokes go to the shell; a paste over 64 KiB goes in chunks the preload accepts", async () => {
  const pty = fakePty();
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  view.type("ls -la\r");
  const paste = "x".repeat(MAX_PTY_WRITE * 2 + 5);
  view.type(paste);
  const writes = pty.of("write");
  assert.deepEqual(writes[0], ["write", "p1", "ls -la\r"]);
  const pasted = writes.slice(1).map((call) => call[2] as string);
  assert.deepEqual(pasted.map((chunk) => chunk.length), [MAX_PTY_WRITE, MAX_PTY_WRITE, 5]);
  assert.equal(pasted.join(""), paste);
});

test("a chunk never ends between the two halves of one character", () => {
  const emoji = "\u{1F600}";
  const text = `${"a".repeat(MAX_PTY_WRITE - 1)}${emoji}b`;
  const chunks = chunkPtyInput(text);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [MAX_PTY_WRITE - 1, 3]);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= MAX_PTY_WRITE));
  assert.deepEqual(chunkPtyInput(""), []);
});

test("what is typed while the shell is starting reaches it once it runs", async () => {
  const pty = fakePty();
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  view.type("e");
  view.type("cho hi\r");
  assert.deepEqual(pty.of("write"), []);
  await settle();
  assert.deepEqual(pty.of("write"), [["write", "p1", "echo hi\r"]]);
});

test("a resize reaches the shell as integers from 1 to 1000, even one made while it started", async () => {
  const pty = fakePty();
  const view = fakeTerm(80, 24);
  createLocalTerminalSession({ api: pty.api, term: view.term });
  view.resize(100, 30);
  await settle();
  view.resize(120, 50);
  view.resize(5000, 0);
  assert.deepEqual(pty.of("resize"), [["resize", "p1", 100, 30], ["resize", "p1", 120, 50], ["resize", "p1", 1000, 1]]);
  assert.deepEqual([ptyDimension(0), ptyDimension(12.7), ptyDimension(1001), ptyDimension(Number.NaN)], [1, 12, 1000, 1]);
});

test("output is acknowledged only after xterm has rendered it (flow control)", async () => {
  const pty = fakePty();
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  pty.emit("p1", "hello ");
  pty.emit("p1", "wörld\r\n");
  assert.deepEqual(view.shown, ["hello ", "wörld\r\n"]);
  assert.deepEqual(pty.of("ack"), []);
  view.render();
  assert.deepEqual(pty.of("ack"), [["ack", "p1", 6], ["ack", "p1", 7]]);
});

test("when the shell exits the terminal says so, and Enter starts a new one", async () => {
  const pty = fakePty(["p1", "p2"]);
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  pty.exit("p1", 130);
  assert.equal(view.shown.at(-1), "\r\n\x1b[2m[shell exited (code 130) — press Enter for a new one]\x1b[0m\r\n");
  assert.equal(pty.listeners(), 0);
  view.type("q");
  assert.deepEqual(pty.of("write"), []);
  assert.equal(pty.of("create").length, 1);
  view.type("\r");
  await settle();
  assert.equal(pty.of("create").length, 2);
  view.type("pwd\r");
  assert.deepEqual(pty.of("write"), [["write", "p2", "pwd\r"]]);
});

test("a refused shell (eight already open) says the limit is reached; Enter tries again", async () => {
  const pty = fakePty([null, "p9"]);
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  assert.match(view.shown.at(-1) ?? "", /too many terminals are open in this window/);
  view.type("ls");
  assert.deepEqual(pty.of("write"), []);
  view.type("\r");
  await settle();
  assert.equal(pty.of("create").length, 2);
  view.type("ls\r");
  assert.deepEqual(pty.of("write"), [["write", "p9", "ls\r"]]);
});

test("a create that fails says the shell could not start, never throws", async () => {
  const pty = fakePty([new Error("sender refused")]);
  const view = fakeTerm();
  createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  assert.match(view.shown.at(-1) ?? "", /could not start a shell — press Enter to try again/);
});

test("dispose kills the shell, unsubscribes everything, and calls the pty no more", async () => {
  const pty = fakePty();
  const view = fakeTerm();
  const session = createLocalTerminalSession({ api: pty.api, term: view.term });
  await settle();
  pty.emit("p1", "late");
  session.dispose();
  assert.deepEqual(pty.of("kill"), [["kill", "p1"]]);
  assert.equal(pty.listeners(), 0);
  assert.equal(view.subscribers(), 0);
  const before = pty.calls.length;
  view.render();
  view.type("x");
  session.dispose();
  assert.equal(pty.calls.length, before);
});

test("a shell created after dispose (an unmount mid-start) is killed at once", async () => {
  const pty = fakePty();
  const view = fakeTerm();
  const session = createLocalTerminalSession({ api: pty.api, term: view.term });
  session.dispose();
  await settle();
  assert.deepEqual(pty.of("kill"), [["kill", "p1"]]);
  assert.equal(pty.listeners(), 0);
  assert.equal(view.focused(), 0);
});

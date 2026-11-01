// The core behind VS Code's terminal on the desktop's local shell (groot ADR 0038): it starts the
// pty at VS Code's size, carries keystrokes and resizes only, acknowledges what VS Code rendered
// (C7 flow control), and a shell that exits, a refused create or a failed one ends cleanly.
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PTY_WRITE } from "../../src/features/ide/model/localPty.ts";
import { createLocalPtyProcess } from "../../src/features/ide/model/localPtyProcess.ts";
import { fakePty } from "./support/local-pty-fakes.ts";

function world(created: Array<string | null | Error> = ["p1"]) {
  const pty = fakePty(created);
  const out: string[] = [];
  const exits: number[] = [];
  const proc = createLocalPtyProcess(pty.api, { data: (d) => out.push(d), exit: (c) => exits.push(c) });
  return { pty, proc, out, exits };
}

test("starts the shell at the size VS Code asked for and streams its output", async () => {
  const w = world();
  assert.equal(await w.proc.start(120, 30), "started");
  assert.deepEqual(w.pty.calls, [["create", 120, 30]]);
  w.pty.emit("p1", "hello");
  assert.deepEqual(w.out, ["hello"]);
});

test("keystrokes go to the shell in chunks the shell accepts", async () => {
  const w = world();
  await w.proc.start(80, 24);
  w.proc.input("ls\r");
  w.proc.input("x".repeat(MAX_PTY_WRITE * 2 + 5));
  assert.deepEqual(w.pty.of("write").map((c) => (c[2] as string).length), [3, MAX_PTY_WRITE, MAX_PTY_WRITE, 5]);
});

test("resize and acknowledgements reach the shell", async () => {
  const w = world();
  await w.proc.start(80, 24);
  w.proc.resize(100, 40);
  w.proc.ack(4096);
  w.proc.ack(0);
  assert.deepEqual(w.pty.calls.slice(1), [["resize", "p1", 100, 40], ["ack", "p1", 4096]]);
});

test("sizes reach the shell as integers from 1 to 1000", async () => {
  const w = world();
  await w.proc.start(80.6, 0);
  w.proc.resize(1001, 12.4);
  assert.deepEqual(w.pty.calls, [["create", 80, 1], ["resize", "p1", 1000, 12]]);
});

// VS Code marks the process ready on the next tick and sends keystrokes from then on, before the
// desktop has answered create.
test("what is typed and the size set while the shell starts reach it once it runs", async () => {
  const w = world();
  const started = w.proc.start(80, 24);
  w.proc.input("e");
  w.proc.input("cho hi\r");
  w.proc.resize(100, 40);
  w.proc.ack(10);
  assert.deepEqual(w.pty.calls, [["create", 80, 24]]);
  await started;
  assert.deepEqual(w.pty.calls.slice(1), [["resize", "p1", 100, 40], ["write", "p1", "echo hi\r"]]);
});

test("a size set while starting that matches the created one sends no resize", async () => {
  const w = world();
  const started = w.proc.start(80, 24);
  w.proc.resize(80, 24);
  await started;
  assert.deepEqual(w.pty.calls, [["create", 80, 24]]);
});

test("a refused create reports it and drops what was typed meanwhile", async () => {
  const w = world([null]);
  const started = w.proc.start(80, 24);
  w.proc.input("typed early");
  assert.equal(await started, "refused");
  w.proc.input("x");
  assert.equal(w.pty.calls.length, 1);
});

test("a create that fails reports it, never throws", async () => {
  const w = world([new Error("pty host gone")]);
  assert.equal(await w.proc.start(80, 24), "failed");
  w.proc.input("x");
  assert.equal(w.pty.calls.length, 1);
});

test("the shell's exit ends the process once and stops listening", async () => {
  const w = world();
  await w.proc.start(80, 24);
  w.pty.exit("p1", 0);
  assert.deepEqual(w.exits, [0]);
  assert.equal(w.pty.listeners(), 0);
  w.proc.input("after");
  w.proc.ack(10);
  assert.deepEqual(w.pty.calls, [["create", 80, 24]]);
});

test("shutdown kills the shell and stops listening", async () => {
  const w = world();
  await w.proc.start(80, 24);
  w.proc.shutdown();
  assert.deepEqual(w.pty.calls.at(-1), ["kill", "p1"]);
  assert.equal(w.pty.listeners(), 0);
  w.proc.shutdown();
  assert.equal(w.pty.of("kill").length, 1);
});

test("a shell created after shutdown (VS Code closed it mid-start) is killed at once", async () => {
  const w = world();
  const answer = w.pty.deferCreate();
  const started = w.proc.start(80, 24);
  w.proc.shutdown();
  answer("p7");
  assert.equal(await started, "failed");
  assert.deepEqual(w.pty.calls, [["kill", "p7"]]);
  assert.equal(w.pty.listeners(), 0);
});

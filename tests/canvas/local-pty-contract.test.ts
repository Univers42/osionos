// The preload's `pty` contract (devil verdict 2026-10-31, desktop local terminal): the desktop
// terminal exists only when every method is there, and writes and sizes stay inside the limits
// the desktop shell enforces (C5).
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PTY_WRITE, chunkPtyInput, hasLocalTerminal, localPtyApi, ptyDimension } from "../../src/features/ide/model/localPty.ts";
import { fakePty } from "./support/local-pty-fakes.ts";

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

test("a paste over 64 KiB goes in chunks the preload accepts", () => {
  const paste = "x".repeat(MAX_PTY_WRITE * 2 + 5);
  const chunks = chunkPtyInput(paste);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [MAX_PTY_WRITE, MAX_PTY_WRITE, 5]);
  assert.equal(chunks.join(""), paste);
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

test("a size reaches the shell as an integer from 1 to 1000", () => {
  assert.deepEqual([ptyDimension(0), ptyDimension(12.7), ptyDimension(1001), ptyDimension(Number.NaN)], [1, 12, 1000, 1]);
});

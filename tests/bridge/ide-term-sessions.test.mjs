// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-term-sessions.test.mjs                         :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";
import { Duplex } from "node:stream";

/** A docker-exec-shaped duplex: writes (stdin) collect into `written`; output
 *  (stdout) is injected with `emit()` — the two directions never loop. */
function fakeDuplex() {
  const written = [];
  const stream = new Duplex({
    write(chunk, _enc, cb) { written.push(Buffer.from(chunk)); cb(); },
    read() {},
  });
  return { stream, written, emit: (text) => stream.push(Buffer.from(text)) };
}

import {
  createReplayRing, getOrCreateSession, attachClient, detachClient, writeStdin,
  disposeSessionsFor, bumpContainerSockets, containerHasActivity,
} from "../../scripts/ide-term-sessions.mjs";

function fakeClient() {
  return {
    received: [], closes: [],
    sendBinary(chunk) { this.received.push(Buffer.from(chunk)); return true; },
    sendClose(code, reason) { this.closes.push({ code, reason }); },
    onDrain() {},
    text() { return Buffer.concat(this.received).toString(); },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("replay ring: appends, trims whole chunks past the cap", () => {
  const ring = createReplayRing(10);
  ring.push(Buffer.from("aaaa"));
  ring.push(Buffer.from("bbbb"));
  ring.push(Buffer.from("cccc")); // 12 bytes → "aaaa" dropped
  assert.equal(ring.snapshot().toString(), "bbbbcccc");
  assert.ok(ring.sizeBytes <= 10);
});

test("session: broadcast to attached clients, replay to late joiners, detach keeps the shell", async () => {
  const { stream, emit } = fakeDuplex();
  const session = await getOrCreateSession({
    key: "u|ide-x|0", containerName: "ide-x",
    spawn: async () => ({ stream, execId: "e1" }),
  });
  const first = fakeClient();
  attachClient(session, first);
  emit("hello ");
  await tick();
  assert.equal(first.text(), "hello ");

  const late = fakeClient();
  attachClient(session, late);
  assert.equal(late.text(), "hello ", "late joiner gets the replay ring first");
  emit("world");
  await tick();
  assert.equal(first.text(), "hello world");
  assert.equal(late.text(), "hello world");

  detachClient(session, first);
  emit("!");
  await tick();
  assert.equal(first.text(), "hello world", "detached client receives nothing more");
  assert.equal(late.text(), "hello world!");
  assert.deepEqual(first.closes, [], "detach never closes the SESSION");

  // same key reattaches to the SAME live session (the reload survival)
  const again = await getOrCreateSession({ key: "u|ide-x|0", containerName: "ide-x", spawn: async () => { throw new Error("must not respawn"); } });
  assert.equal(again, session);
});

test("session: stdin reaches the stream and bumps activity", async () => {
  const { stream, written } = fakeDuplex();
  const session = await getOrCreateSession({ key: "u|ide-y|0", containerName: "ide-y", spawn: async () => ({ stream, execId: "e2" }) });
  const before = session.lastActivityMs;
  await tick();
  writeStdin(session, Buffer.from("ls\n"));
  assert.equal(Buffer.concat(written).toString(), "ls\n");
  assert.ok(session.lastActivityMs >= before);
});

test("session end (stream close) notifies clients with 1000 and forgets the key", async () => {
  const { stream } = fakeDuplex();
  const session = await getOrCreateSession({ key: "u|ide-z|0", containerName: "ide-z", spawn: async () => ({ stream, execId: "e3" }) });
  const client = fakeClient();
  attachClient(session, client);
  stream.destroy();
  await tick();
  assert.deepEqual(client.closes, [{ code: 1000, reason: "process ended" }]);
  let respawned = false;
  await getOrCreateSession({ key: "u|ide-z|0", containerName: "ide-z", spawn: async () => { respawned = true; return { stream: fakeDuplex().stream, execId: "e4" }; } });
  assert.ok(respawned, "an ended key spawns a FRESH session");
});

test("disposeSessionsFor kills matching sessions with a reason", async () => {
  const { stream } = fakeDuplex();
  const session = await getOrCreateSession({ key: "u2|ide-w|0", containerName: "ide-w", spawn: async () => ({ stream, execId: "e5" }) });
  const client = fakeClient();
  attachClient(session, client);
  assert.equal(disposeSessionsFor("u2|ide-w"), 1);
  assert.deepEqual(client.closes, [{ code: 1000, reason: "session disposed" }]);
});

test("container activity: sockets, attached clients, and recent output all count", async () => {
  assert.equal(containerHasActivity("ide-idle", 0), false);
  bumpContainerSockets("ide-sock", 1);
  assert.equal(containerHasActivity("ide-sock", 0), true);
  bumpContainerSockets("ide-sock", -1);
  assert.equal(containerHasActivity("ide-sock", 0), false);

  const { stream } = fakeDuplex();
  const session = await getOrCreateSession({ key: "u3|ide-act|0", containerName: "ide-act", spawn: async () => ({ stream, execId: "e6" }) });
  assert.equal(containerHasActivity("ide-act", 60_000), true, "fresh session counts as recent activity");
  assert.equal(containerHasActivity("ide-act", 0), false, "no clients + zero idle window = inactive");
  const client = fakeClient();
  attachClient(session, client);
  assert.equal(containerHasActivity("ide-act", 0), true, "an attached client is activity regardless of idle");
});

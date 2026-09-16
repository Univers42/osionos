/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-sync-engine.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import {
  decideInboundWrite, recordSyncedHash, clearSyncedHash, syncedHashOf,
} from "../../src/features/ide/model/ideSyncEngine.ts";
import { publishFsEvent, subscribeFsEvents } from "../../src/features/ide/model/ideFsEvents.ts";
import { createSandboxProvider } from "../../src/features/ide/vfs/sandboxProvider.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { searchVfs } from "../../src/features/ide/vfs/vfsSearch.ts";
import { createMemProvider } from "../../src/features/ide/vfs/memProvider.ts";
import { joinV } from "../../src/features/ide/vfs/vpath.ts";
import { textToBytes } from "../../src/features/ide/vfs/bytes.ts";
import type { WatchEvent } from "../../src/features/ide/vfs/types.ts";

const never = () => false;

test("sync engine: echo, ignore, create, fast-forward, conflict — the full matrix", () => {
  // our own write bouncing back
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h1", isEcho: (h) => h === "h1", localContent: "x", localHash: "lx", inboundContent: "y", lastSyncedHash: null }),
    { action: "echo" },
  );
  // contents already identical
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h2", isEcho: never, localContent: "same", localHash: "ls", inboundContent: "same", lastSyncedHash: null }),
    { action: "ignore" },
  );
  // no local page yet — shell/git created a file
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h3", isEcho: never, localContent: null, localHash: null, inboundContent: "new", lastSyncedHash: null }),
    { action: "create" },
  );
  // local unchanged since the last agreement → fast-forward
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h4", isEcho: never, localContent: "v1", localHash: "H(v1)", inboundContent: "v2", lastSyncedHash: "H(v1)" }),
    { action: "apply" },
  );
  // BOTH sides moved → surfaced conflict, never silent LWW
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h5", isEcho: never, localContent: "mine", localHash: "H(mine)", inboundContent: "theirs", lastSyncedHash: "H(v1)" }),
    { action: "conflict" },
  );
  // no ledger (fresh reload) + non-empty differing local → the SAFE direction
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h6", isEcho: never, localContent: "mine", localHash: "H(mine)", inboundContent: "theirs", lastSyncedHash: null }),
    { action: "conflict" },
  );
  // empty local (freshly seeded page) with no ledger → apply, not conflict
  assert.deepEqual(
    decideInboundWrite({ inboundHash: "h7", isEcho: never, localContent: "", localHash: "H()", inboundContent: "theirs", lastSyncedHash: null }),
    { action: "apply" },
  );
});

test("sync ledger: record / read / clear round-trip, workspace-scoped", () => {
  recordSyncedHash("ws1", "a/b.c", "hash1");
  assert.equal(syncedHashOf("ws1", "a/b.c"), "hash1");
  assert.equal(syncedHashOf("ws2", "a/b.c"), null);
  clearSyncedHash("ws1", "a/b.c");
  assert.equal(syncedHashOf("ws1", "a/b.c"), null);
});

test("fs-event bus fans out per workspace and unsubscribes cleanly", () => {
  const seen: string[] = [];
  const off = subscribeFsEvents("wsA", (e) => seen.push(`A:${e.event}:${e.path}`));
  publishFsEvent("wsA", { event: "write", path: "x.c", hash: "h", content: null });
  publishFsEvent("wsB", { event: "write", path: "y.c", hash: "h", content: null });
  off();
  publishFsEvent("wsA", { event: "delete", path: "x.c", hash: null, content: null });
  assert.deepEqual(seen, ["A:write:x.c"]);
});

test("sandbox provider watch: rides an injected feed, scopes to the watched subtree", async () => {
  const listeners = new Set<(e: { event: string; path: string }) => void>();
  const feed = { subscribe: (l: (e: { event: string; path: string }) => void) => { listeners.add(l); return () => listeners.delete(l); } };
  const provider = createSandboxProvider("sandbox", async () => ({ exitCode: 0, output: "" }), feed);
  assert.equal(provider.capabilities().watch, "native");

  const events: WatchEvent[] = [];
  const controller = new AbortController();
  const done = provider.watch(buildVPath("sandbox", "ws", ["src"]), (e) => events.push(e), controller.signal);
  for (const l of listeners) {
    l({ event: "write", path: "src/main.c" });
    l({ event: "write", path: "elsewhere/other.c" }); // out of scope
    l({ event: "delete", path: "src/old.c" });
    l({ event: "ready", path: "" }); // not a file event
  }
  controller.abort();
  await done;
  assert.equal(listeners.size, 0, "abort must unsubscribe from the feed");
  assert.deepEqual(events.map((e) => `${e.type}:${e.path.segments.join("/")}`), ["write:src/main.c", "delete:src/old.c"]);
});

test("vfs search: bounded case-insensitive matches across a mount", async () => {
  const p = createMemProvider("mem");
  const root = buildVPath("mem", "t", []);
  await p.mkdir(joinV(root, "src"));
  await p.write(joinV(root, "src", "main.c"), textToBytes("int main() {\n  Greet();\n}"));
  await p.write(joinV(root, "notes.md"), textToBytes("greet the user\nagain: GREET"));
  const matches = await searchVfs(p, root, "greet");
  assert.deepEqual(
    matches.map((m) => `${m.relPath}:${m.lineNumber}`),
    ["notes.md:1", "notes.md:2", "src/main.c:2"],
  );
});

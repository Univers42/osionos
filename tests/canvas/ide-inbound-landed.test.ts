/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-landed.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The landed memo (C3b5 P3') and the stale-own-write record (C3.3) on their own:
// valid only while the ledger holds the remembered shell text, never for a write
// of ours the ledger moved past.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { isStaleOwnWrite, recordOutboundWrite, recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { createLandedMemo } from "../../src/features/ide/model/inboundLanded.ts";

let spaces = 0;
const freshWs = (): string => `ws-landed-${(spaces += 1)}`;

test("landed memo: the page hash while the ledger holds the shell text; none once it moved; again when it is back", async () => {
  const workspaceId = freshWs();
  const memo = createLandedMemo({ workspaceId, readText: async () => "canonical" });
  recordSyncedHash(workspaceId, "a.omd", "h-shell");
  await memo.remember("a.omd", "h-shell", "P");
  assert.equal(memo.pageHashAt("a.omd", "h-next"), await sha16("canonical"));
  assert.equal(memo.pageHashAt("b.omd", "h-next"), null, "another path has no memo");
  recordSyncedHash(workspaceId, "a.omd", "h-writer");
  assert.equal(memo.pageHashAt("a.omd", "h-next"), null, "every other ledger writer invalidates it");
  recordSyncedHash(workspaceId, "a.omd", "h-shell");
  assert.equal(memo.pageHashAt("a.omd", "h-next"), await sha16("canonical"));
});

test("landed memo: a page that cannot be read leaves no memo, and drops an older one", async () => {
  const workspaceId = freshWs();
  let readable = true;
  const memo = createLandedMemo({ workspaceId, readText: async () => { if (!readable) throw new Error("gone"); return "t"; } });
  recordSyncedHash(workspaceId, "a.omd", "h1");
  await memo.remember("a.omd", "h1", "P");
  readable = false;
  await memo.remember("a.omd", "h1", "P");
  assert.equal(memo.pageHashAt("a.omd", "h2"), null);
});

test("C3.3: a write of ours the ledger moved past is stale — the memo never accepts it; any other hash still is", async () => {
  const workspaceId = freshWs();
  const memo = createLandedMemo({ workspaceId, readText: async () => "canonical" });
  recordOutboundWrite(workspaceId, "a.omd", "h-ours");
  assert.equal(isStaleOwnWrite(workspaceId, "a.omd", "h-ours"), false, "the ledger still holds it: not stale");
  recordSyncedHash(workspaceId, "a.omd", "h-shell");
  await memo.remember("a.omd", "h-shell", "P");
  assert.equal(isStaleOwnWrite(workspaceId, "a.omd", "h-ours"), true);
  assert.equal(isStaleOwnWrite(workspaceId, "b.omd", "h-ours"), false, "per path");
  assert.equal(memo.pageHashAt("a.omd", "h-ours"), null);
  assert.equal(memo.pageHashAt("a.omd", "h-shell-2"), await sha16("canonical"));
});

test("C3.3: the record keeps the last 8 writes per path, with no TTL", () => {
  const workspaceId = freshWs();
  for (let at = 0; at < 9; at += 1) recordOutboundWrite(workspaceId, "a.omd", `h${at}`);
  recordSyncedHash(workspaceId, "a.omd", "h-shell");
  assert.equal(isStaleOwnWrite(workspaceId, "a.omd", "h0"), false, "the 9th write forgot the first (the Ponytail)");
  assert.equal(isStaleOwnWrite(workspaceId, "a.omd", "h1"), true);
  assert.equal(isStaleOwnWrite(workspaceId, "a.omd", "h8"), true);
});

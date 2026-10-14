/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-lead-attach.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { acquireInboundLeadership, leadAndAttachOnGain } from "../../src/features/ide/model/inboundPipeline.ts";
import { createFakeLocks } from "./fixtures/fakeLocks.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function tabB(workspaceId: string, locks: ReturnType<typeof createFakeLocks>["locks"]) {
  let attaches = 0;
  const wired = leadAndAttachOnGain(workspaceId, locks, (task) => { void task(); }, async () => { attaches += 1; });
  return { ...wired, attaches: () => attaches };
}

test("T1: a tab that saw ready and gains the lead when the leader closes attaches exactly once", async () => {
  const { locks } = createFakeLocks();
  const tabA = acquireInboundLeadership("ws-gain-1", locks);
  await flush();
  const b = tabB("ws-gain-1", locks);
  b.readySeen();
  await flush();
  assert.equal(b.attaches(), 0, "B must not attach while A leads");
  tabA.release();
  await flush();
  assert.equal(b.leadership.isLeader(), true);
  assert.equal(b.attaches(), 1);
  b.leadership.release();
});

test("T2: a tab that gains the lead before its socket's ready attaches nothing on the gain", async () => {
  const { locks } = createFakeLocks();
  const tabA = acquireInboundLeadership("ws-gain-2", locks);
  await flush();
  const b = tabB("ws-gain-2", locks);
  tabA.release();
  await flush();
  assert.equal(b.leadership.isLeader(), true);
  assert.equal(b.attaches(), 0);
  b.leadership.release();
});

test("T3: a sole tab gains at once, then sees ready: the gain did not attach (its ready does)", async () => {
  const { locks } = createFakeLocks();
  const b = tabB("ws-gain-3", locks);
  await flush();
  assert.equal(b.leadership.isLeader(), true);
  b.readySeen();
  await flush();
  assert.equal(b.attaches(), 0);
  b.leadership.release();
});

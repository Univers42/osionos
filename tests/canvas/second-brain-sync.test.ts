/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-sync.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { type SyncLedger, computeSyncActions } from "../../src/features/second-brain/sync/noteSyncLedger.ts";

test("outbox diff: new + changed notes are pending, unchanged skipped, deleted unpublished", () => {
  const desired = new Map([["a", "s1"], ["b", "s2"], ["c", "s3"]]);
  const ledger: SyncLedger = { a: "s1", b: "OLD", x: "gone" };

  const { toPublish, toUnpublish } = computeSyncActions(desired, ledger);
  assert.deepEqual([...toPublish].sort(), ["b", "c"], "b changed (OLD≠s2) + c is new → publish; a unchanged → skip");
  assert.deepEqual(toUnpublish, ["x"], "x was confirmed-synced but is gone now → unpublish");
});

test("outbox survives an outage: a failed write stays pending until the server confirms it", () => {
  const desired = new Map([["note", "v2"]]);
  const ledger: SyncLedger = {}; // never synced yet

  // Server DOWN: the orchestrator attempts the write, it fails → ledger NOT advanced.
  assert.deepEqual(computeSyncActions(desired, ledger).toPublish, ["note"], "pending while offline");

  // Reload during the outage: the ledger persisted as-is → still pending (not lost).
  assert.deepEqual(computeSyncActions(desired, { ...ledger }).toPublish, ["note"], "still pending after a reload");

  // Server BACK: the write succeeds → the orchestrator advances the ledger.
  ledger.note = "v2";
  assert.deepEqual(computeSyncActions(desired, ledger).toPublish, [], "flushed once confirmed — no longer pending");
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-outbox-recovery.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// S5U6 — an edit the bridge refused must be recovered, not forgotten. Tested through
// the pure decisions (outboxRecovery.ts) and the write gate (pageAccess.ts); the parts
// that need the bridge client or the stores are wired in ./refusedEditDeps and follow
// the contracts exercised here.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import type { PageAccessContext } from "../../src/shared/lib/auth/pageAccess.ts";
import { canWritePage } from "../../src/shared/lib/auth/pageAccess.ts";
import {
  MAX_RECOVERIES_PER_FLUSH,
  applyRecoveryOutcome,
  clearRecoveringMarks,
  ignoredWarning,
  recoveringIds,
} from "../../src/store/sync/outboxRecovery.ts";

const OWNER = "b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2";
const OTHER_USER = "a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1";
const PAGE = "507f1f77bcf86cd799439011";
const OTHER_PAGE = "507f1f77bcf86cd799439012";
const OWNER_WORDING = "Only the page owner can move it to another workspace or change who can see it.";

function page(overrides: Partial<PageEntry> = {}): PageEntry {
  return { _id: PAGE, title: "Plan", workspaceId: "ws", ownerId: OWNER, ...overrides };
}

function context(overrides: Partial<PageAccessContext> = {}): PageAccessContext {
  return {
    userId: OWNER,
    workspaceIds: ["ws"],
    privateWorkspaceIds: ["ws"],
    sharedWorkspaceIds: [],
    ...overrides,
  };
}

test("MAX_RECOVERIES_PER_FLUSH: more than one page, never unbounded", () => {
  assert.ok(MAX_RECOVERIES_PER_FLUSH > 1, "a flush may recover a batch, not just the first");
  assert.ok(MAX_RECOVERIES_PER_FLUSH <= 10, "a bounded budget, so a flush still terminates");
});

test("ignoredWarning: nothing declined, no toast", () => {
  assert.equal(ignoredWarning("Plan", []), null);
});

test("ignoredWarning: a vanished parent reads as the parent", () => {
  assert.deepEqual(ignoredWarning("Plan", ["parentPageId"]), {
    kind: "warning",
    title: "Some changes to “Plan” were not saved",
    description: "The new parent page is not available.",
  });
});

test("ignoredWarning: a declined workspace/visibility reads as owner-only", () => {
  for (const ignored of [["visibility"], ["parentPageId", "visibility"], ["workspaceId"]]) {
    const warning = ignoredWarning("Plan", ignored);
    assert.equal(warning?.description, OWNER_WORDING, `ignored=[${ignored.join(",")}]`);
  }
});

test("ignoredWarning: an empty title is reported as Untitled", () => {
  assert.equal(ignoredWarning("", ["visibility"])?.title, "Some changes to “Untitled” were not saved");
});

function ledgers(): { ledger: Record<string, string>; recovering: Record<string, string> } {
  return {
    ledger: { [PAGE]: "stamp-1", [OTHER_PAGE]: "stamp-2" },
    recovering: { [PAGE]: "2026-10-13T00:00:00.000Z" },
  };
}

function markRecorder(): { calls: string[]; mark: (id: string) => void } {
  const calls: string[] = [];
  return { calls, mark: (id) => calls.push(id) };
}

test("applyRecoveryOutcome: a recovered or evicted edit clears both marks and moves on", () => {
  for (const outcome of ["recovered", "evicted"] as const) {
    const { ledger, recovering } = ledgers();
    const { calls, mark } = markRecorder();
    assert.equal(applyRecoveryOutcome(ledger, recovering, PAGE, outcome, mark), "continue");
    assert.equal(ledger[PAGE], undefined, "the refused edit leaves the publish ledger");
    assert.equal(recovering[PAGE], undefined, "the recovering mark is released");
    assert.equal(ledger[OTHER_PAGE], "stamp-2", "an unrelated page keeps its ledger entry");
    assert.deepEqual(calls, [PAGE]);
  }
});

test("applyRecoveryOutcome: a failed recovery changes nothing and stops the flush", () => {
  const { ledger, recovering } = ledgers();
  const before = JSON.stringify([ledger, recovering]);
  const { calls, mark } = markRecorder();
  assert.equal(applyRecoveryOutcome(ledger, recovering, PAGE, "failed", mark), "stop");
  assert.equal(JSON.stringify([ledger, recovering]), before, "both ledgers byte-identical");
  assert.deepEqual(calls, []);
});

test("canWritePage: a refusal closes the page to its own owner", () => {
  const own = page({ ownerId: OWNER });
  assert.equal(canWritePage(own, context({ refusedPageIds: new Set([PAGE]) }), "update"), false);
  assert.equal(canWritePage(own, context(), "update"), true);
});

test("canWritePage: a hand-built context without refusedPageIds keeps its verdict", () => {
  const shared = context({ privateWorkspaceIds: [], sharedWorkspaceIds: ["ws"] });
  const theirs = page({ _id: OTHER_PAGE, ownerId: OTHER_USER, visibility: "shared" });
  // Writable through the shared membership, NOT through ownership — so the owner
  // fast-path cannot be what answers either way.
  assert.equal(canWritePage(theirs, shared, "update"), true);
  assert.equal(canWritePage(theirs, { ...shared, refusedPageIds: new Set([OTHER_PAGE]) }, "update"), false);
});

test("recoveringIds: the guard hydrate's merge applies to a recovering id", () => {
  // applyServerPages reads this set once per merge and mergeServerPages keeps the
  // local copy of every id in it (tests/canvas/merge-server-pages.test.ts covers
  // that rule) — this pins the set itself.
  const recovering = recoveringIds({ [PAGE]: "2026-10-13T00:00:00.000Z" });
  assert.equal(recovering.has(PAGE), true, "a page under recovery is protected");
  assert.equal(recovering.has(OTHER_PAGE), false, "an ordinary page still merges");
  assert.equal(recovering.size, 1);
  const planted = JSON.parse(
    `{"__proto__":"2026-10-13T00:00:00.000Z","${OTHER_PAGE}":"x"}`,
  ) as Record<string, string>;
  assert.deepEqual([...recoveringIds(planted)], ["__proto__", OTHER_PAGE]);
  assert.equal(
    Object.hasOwn(Object.prototype, OTHER_PAGE),
    false,
    "a stored key never reaches the prototype",
  );
});

test("clearRecoveringMarks: a settled page loses its mark; others and inherited keys stay", () => {
  const recovering: Record<string, string> = { [PAGE]: "t1", [OTHER_PAGE]: "t2" };
  assert.equal(clearRecoveringMarks(recovering, [PAGE, "constructor"]), true);
  assert.deepEqual(recovering, { [OTHER_PAGE]: "t2" });
  assert.equal(clearRecoveringMarks(recovering, ["absent"]), false);
  assert.deepEqual(recovering, { [OTHER_PAGE]: "t2" });
});

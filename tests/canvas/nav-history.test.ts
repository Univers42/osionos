/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   nav-history.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Go back / Go forward: the history records page changes only, caps at 50,
// dedupes consecutive visits, and steps over pages that no longer exist.

import assert from "node:assert/strict";
import test from "node:test";

import {
  NAV_HISTORY_CAP, canStep, emptyHistory, recordVisit, stepHistory,
} from "../../src/widgets/workspace-grid/model/navHistoryCore.ts";
import type { WorkspaceTab } from "../../src/widgets/workspace-grid/model/layoutTree.ts";

function tab(pageId: string): WorkspaceTab {
  return { tabId: `t-${pageId}`, pageId, workspaceId: "w", kind: "page" };
}

const alive = () => true;

function visit(ids: string[]) {
  return ids.reduce((history, id) => recordVisit(history, tab(id)), emptyHistory());
}

test("recording appends and moves the cursor to the newest entry", () => {
  const history = visit(["a", "b", "c"]);
  assert.deepEqual(history.entries.map((e) => e.pageId), ["a", "b", "c"]);
  assert.equal(history.index, 2);
});

test("a consecutive repeat of the current page is not recorded", () => {
  const history = visit(["a", "b", "b"]);
  assert.deepEqual(history.entries.map((e) => e.pageId), ["a", "b"]);
});

test("the cap keeps the newest 50 entries", () => {
  const history = visit(Array.from({ length: NAV_HISTORY_CAP + 10 }, (_, i) => `p${i}`));
  assert.equal(history.entries.length, NAV_HISTORY_CAP);
  assert.equal(history.entries[0].pageId, "p10");
  assert.equal(history.index, NAV_HISTORY_CAP - 1);
});

test("back and forward walk the entries, and stepping to the current page records nothing", () => {
  const start = visit(["a", "b", "c"]);
  const back = stepHistory(start, -1, alive);
  assert.equal(back.tab?.pageId, "b");
  assert.equal(recordVisit(back.history, tab("b")), back.history, "arriving on b adds nothing");
  const forward = stepHistory(back.history, 1, alive);
  assert.equal(forward.tab?.pageId, "c");
  assert.equal(stepHistory(forward.history, 1, alive).tab, null, "nowhere forward of the newest");
  assert.equal(stepHistory(visit(["a"]), -1, alive).tab, null, "nowhere back of the oldest");
});

test("visiting a new page after stepping back drops the forward entries", () => {
  const back = stepHistory(visit(["a", "b", "c"]), -1, alive).history;
  const next = recordVisit(back, tab("d"));
  assert.deepEqual(next.entries.map((e) => e.pageId), ["a", "b", "d"]);
});

test("a page that no longer exists is skipped and dropped when stepping", () => {
  const exists = (t: WorkspaceTab) => t.pageId !== "b";
  const result = stepHistory(visit(["a", "b", "c"]), -1, exists);
  assert.equal(result.tab?.pageId, "a");
  assert.deepEqual(result.history.entries.map((e) => e.pageId), ["a", "c"]);
  assert.equal(result.history.index, 0);
});

test("canStep is true only when an existing entry lies in that direction", () => {
  const history = visit(["a", "b", "c"]);
  assert.equal(canStep(history, -1, alive), true);
  assert.equal(canStep(history, 1, alive), false);
  assert.equal(canStep(history, -1, (t) => t.pageId === "c"), false, "a and b are gone");
  assert.equal(canStep(emptyHistory(), -1, alive), false);
});

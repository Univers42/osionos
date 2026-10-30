/**
 * #228: rows → threads. Replies go under their root, a deleted root with no reply left
 * disappears, and open suggestions that overlap on one block sit together, the most
 * 👍 first, then the oldest. The clustering sweep is checked against the pairwise rule.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { suggestionsOverlap } from "@/features/comments/model/suggestionAnchor";
import { threads, type DiscussionRow } from "@/features/comments/model/threads";

let clock = 0;

function row(id: string, extra: Partial<DiscussionRow> = {}): DiscussionRow {
  clock += 1;
  return {
    id,
    pageId: "p",
    blockId: "b",
    authorId: "u",
    content: id,
    resolvedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 30, 0, 0, clock)).toISOString(),
    ...extra,
  };
}

function proposal(id: string, start: number, end: number, likes = 0, extra: Partial<DiscussionRow> = {}): DiscussionRow {
  return row(id, {
    kind: "suggestion",
    status: "open",
    anchor: { start, end, quote: "x".repeat(end - start), prefix: "", suffix: "" },
    suggestion: { insert: "y" },
    reactions: likes ? [{ emoji: "👍", count: likes, mine: false }] : [],
    ...extra,
  });
}

const ids = (rows: DiscussionRow[]) => threads(rows).map((thread) => thread.root.id);

test("replies sit under their root, oldest first; an orphan reply is dropped", () => {
  const root = row("root");
  const late = row("late", { parentId: "root" });
  const early = row("early", { parentId: "root", createdAt: "2000-01-01T00:00:00.000Z" });
  const orphan = row("orphan", { parentId: "held-root" });
  const list = threads([late, root, orphan, early]);
  assert.equal(list.length, 1);
  const [only] = list;
  assert.deepEqual(only.replies.map((reply) => reply.id), ["early", "late"]);
});

test("a deleted root stays while it has a reply, and goes without one", () => {
  const kept = row("kept", { deleted: true, content: "" });
  const gone = row("gone", { deleted: true, content: "" });
  assert.deepEqual(ids([kept, row("r", { parentId: "kept" }), gone]), ["kept"]);
});

test("rows from an older bridge (no #228 fields) are plain threads", () => {
  assert.deepEqual(ids([row("a"), row("b")]), ["a", "b"]);
});

test("competing proposals: most 👍 first, then oldest; the rest point at the leader", () => {
  const old = proposal("old", 0, 5);
  const liked = proposal("liked", 2, 7, 3);
  const tie = proposal("tie", 4, 9, 3);
  const apart = proposal("apart", 20, 25, 9);
  const list = threads([old, liked, tie, apart]);
  assert.deepEqual(list.map((thread) => thread.root.id), ["liked", "tie", "old", "apart"]);
  assert.deepEqual(list.map((thread) => thread.rivalOf), [null, "liked", "liked", null]);
});

test("only open, live suggestions on the same block compete", () => {
  const list = threads([
    proposal("open", 0, 5),
    proposal("decided", 0, 5, 9, { status: "accepted" }),
    proposal("deleted", 0, 5, 9, { deleted: true }),
    proposal("other-block", 0, 5, 9, { blockId: "c" }),
    row("comment"),
  ]);
  assert.ok(list.every((thread) => thread.rivalOf === null));
});

test("an insertion on the edge joins both ranges it touches", () => {
  const list = threads([proposal("left", 0, 5), proposal("caret", 5, 5, 1), proposal("right", 5, 8)]);
  assert.deepEqual(list.map((thread) => thread.rivalOf), [null, "caret", "caret"]);
});

/** The clusters pairwise: union-find over every overlapping pair. */
function pairwiseClusters(rows: DiscussionRow[]): Set<string> {
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  for (const left of rows) {
    for (const right of rows) {
      if (left.id < right.id && suggestionsOverlap(left.anchor!, right.anchor!)) parent.set(find(left.id), find(right.id));
    }
  }
  const groups = new Map<string, string[]>();
  for (const r of rows) groups.set(find(r.id), [...(groups.get(find(r.id)) ?? []), r.id]);
  return new Set([...groups.values()].map((group) => group.sort().join(",")));
}

test("the sweep finds the same clusters as the pairwise rule (500 random blocks)", () => {
  let seed = 228;
  const next = (max: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };
  for (let round = 0; round < 500; round += 1) {
    const rows = Array.from({ length: 2 + next(8) }, (_, n) => {
      const start = next(12);
      return proposal(`s${round}-${n}`, start, start + next(4));
    });
    const leaderOf = new Map(threads(rows).map((thread) => [thread.root.id, thread.rivalOf ?? thread.root.id]));
    const groups = new Map<string, string[]>();
    for (const [id, leader] of leaderOf) groups.set(leader, [...(groups.get(leader) ?? []), id]);
    const swept = new Set([...groups.values()].map((group) => group.sort().join(",")));
    assert.deepEqual(swept, pairwiseClusters(rows), `round ${round}`);
  }
});

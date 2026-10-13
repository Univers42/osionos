/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-writer.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import { planOutbound } from "../../src/features/page-file/model/outboundPlan.ts";
import { page, generatedTree } from "./page-tree-fixtures.ts";
import { block, cp, freshWs, snap } from "./page-file-writer-fixtures.ts";

test("planner baseline: no prev → an empty plan (the attach reconcile owns the full pass)", () => {
  const ws = freshWs();
  const pages = [cp("p1", "One", null), cp("p2", "Two", null, "page", [block("x")])];
  assert.deepEqual(planOutbound(null, snap(ws, pages)), { moves: [], removes: [], changed: [] });
});
test("identical snapshots → no moves, no removes, no writes", () => {
  const ws = freshWs();
  const s = snap(ws, [cp("p1", "One", null)]);
  assert.deepEqual(planOutbound(s, s), { moves: [], removes: [], changed: [] });
});
test("body edit on a shared index → positional fast path, index.entries never read", () => {
  const ws = freshWs();
  const before = [cp("p1", "One", null), cp("p2", "Two", null, "page", [block("v1")])];
  const after = [before[0], { ...before[1], content: [block("v2")] }];
  const guard = new Proxy(pageIndexFor(ws, before), { get(target, key) { if (key === "entries") throw new Error("fast path must not read index.entries"); return Reflect.get(target, key); } });
  assert.deepEqual(planOutbound({ index: guard, pages: before }, { index: guard, pages: after }), { moves: [], removes: [], changed: ["p2"] });
});
test("code pages never enter `changed`, even with content", () => {
  const ws = freshWs();
  const prev = snap(ws, []);
  const pages = [cp("p1", "main.ts", null, "code", [block("x")]), cp("p2", "Notes", null)];
  assert.deepEqual(planOutbound(prev, snap(ws, pages)).changed, ["p2"]);
});
test("content-less pages never enter `changed` (their body is not loaded)", () => {
  const ws = freshWs();
  const prev = snap(ws, []);
  assert.deepEqual(planOutbound(prev, snap(ws, [page("p1", "Notes", null)])).changed, []);
});
test("retitle a 3-level page with a child → exactly 2 moves, the child is covered", () => {
  const ws = freshWs();
  const prev = [cp("pA", "Alpha", null), cp("pB", "Beta", "pA"), cp("pC", "Gamma", "pB"), cp("pD", "Delta", "pC")];
  const next = [prev[0], prev[1], { ...prev[2], title: "Gamma2" }, prev[3]];
  const plan = planOutbound(snap(ws, prev), snap(ws, next));
  assert.deepEqual(plan.moves, [
    { id: "pC", from: "Alpha/Beta/Gamma.omd", to: "Alpha/Beta/Gamma2.omd", dir: false },
    { id: "pC", from: "Alpha/Beta/Gamma", to: "Alpha/Beta/Gamma2", dir: true },
  ]);
});
test("retitle a folder → one dir move, its subtree covered", () => {
  const ws = freshWs();
  const prev = [cp("pF", "Hub", null, "folder"), cp("pG", "Goal", "pF")];
  const next = [{ ...prev[0], title: "Hub2" }, prev[1]];
  assert.deepEqual(planOutbound(snap(ws, prev), snap(ws, next)).moves, [{ id: "pF", from: "Hub", to: "Hub2", dir: true }]);
});
test("reparent a page with a child → 2 moves, the child is covered", () => {
  const ws = freshWs();
  const prev = [cp("pA", "Team", null, "folder"), cp("pB", "Archive", null, "folder"), cp("pC", "C", "pA"), cp("pD", "D", "pC")];
  const next = [prev[0], prev[1], { ...prev[2], parentPageId: "pB" }, prev[3]];
  const plan = planOutbound(snap(ws, prev), snap(ws, next));
  assert.deepEqual(plan.moves, [
    { id: "pC", from: "Team/C.omd", to: "Archive/C.omd", dir: false },
    { id: "pC", from: "Team/C", to: "Archive/C", dir: true },
  ]);
});
test("archiving a subtree → every prev path is a remove, nothing is written", () => {
  const ws = freshWs();
  const prev = [cp("pA", "A", null), cp("pB", "B", "pA"), cp("pC", "C", "pB")];
  const next = prev.map((p) => ({ ...p, archivedAt: "2026-10-13T00:00:00Z" }));
  const plan = planOutbound(snap(ws, prev), snap(ws, next));
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.removes, [{ id: "pA", path: "A.omd" }, { id: "pB", path: "A/B.omd" }, { id: "pC", path: "A/B/C.omd" }]);
  assert.deepEqual(plan.changed, []);
});
test("2000-page replay: applying the plan to a path map reproduces next's index", () => {
  const ws = freshWs();
  const prev = generatedTree(2_000);
  const next = [...prev.map((p) => (p.parentPageId == null ? { ...p, parentPageId: "pwr" } : p)), cp("pwr", "root", null, "folder")];
  const prevIndex = snap(ws, prev).index;
  const nextSnap = snap(ws, next);
  const plan = planOutbound({ index: prevIndex, pages: prev }, nextSnap);
  assert.equal(plan.removes.length, 0);
  const fs = new Map(prevIndex.entries.map((e) => [e.id, e.path]));
  for (const m of plan.moves) {
    if (!m.dir) {
      const id = [...fs].find(([, p]) => p === m.from)?.[0];
      if (id) fs.set(id, m.to);
    } else for (const [id, path] of [...fs]) if (path === m.from || path.startsWith(`${m.from}/`)) fs.set(id, m.to + path.slice(m.from.length));
  }
  for (const entry of nextSnap.index.entries) {
    if (!fs.has(entry.id)) fs.set(entry.id, entry.path);
    assert.equal(fs.get(entry.id), entry.path);
  }
  assert.equal(fs.size, nextSnap.index.entries.length);
});

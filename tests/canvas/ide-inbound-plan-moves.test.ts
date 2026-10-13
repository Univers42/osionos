/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-plan-moves.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shell commands as the fs-agent reports them (a delete, then writes; no rename event),
// replayed with the executor's effects applied between events. Exact step lists throughout.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import {
  apply, cancel, conflict, copy, deletedDir, drop, expectPlan, loud, move, noFolder, pageText, record, replay, schedule, temp,
  viewOf, write,
} from "./fixtures/inboundFakeView.ts";
import type { FakeView } from "./fixtures/inboundFakeView.ts";

const page = (id: string, path: string, parentId?: string) => ({ id, path, parentId, text: pageText(id) });
const folder = (id: string, path: string, parentId?: string) => ({ ...page(id, path, parentId), folder: true });
const roadmap = [page("Roadmap", "Roadmap.omd"), page("c1", "Roadmap/c1.omd", "Roadmap")];
const src = [folder("F", "src"), page("a", "src/a.omd", "F"), page("b", "src/b.omd", "F"), page("c", "src/c.omd", "F")];
const where = (view: FakeView) => view.table.pages.map((row) => `${row.pageId}@${row.path}`);

const orderings = <T>(items: readonly T[]): T[][] => (items.length <= 1 ? [[...items]]
  : items.flatMap((item, at) => orderings(items.filter((_, other) => other !== at)).map((rest) => [item, ...rest])));

test("A6: mv A.omd B.omd ⇒ schedule A, then cancel + move (fromPath A.omd) + record at the EVENT path B", async () => {
  assert.deepStrictEqual(await replay(viewOf([page("A", "A.omd")]), [drop("A.omd"), write("B.omd", "h", pageText("A"))]),
    [[schedule("A", "A.omd")], [cancel("A"), move("A", "A.omd", "B.omd"), record("B.omd", "h")]]);
});

test("R2: mv right after the app wrote A ⇒ the write at B is no echo (B's ledger is empty), it is a move", async () => {
  const text = pageText("A", "fresh from the app");
  const hash = await sha16(text);
  const view = viewOf([{ id: "A", path: "A.omd", text, synced: hash, echoHash: hash }]);
  assert.deepStrictEqual(await replay(view, [drop("A.omd"), write("B.omd", hash, text)]),
    [[schedule("A", "A.omd")], [cancel("A"), move("A", "A.omd", "B.omd"), record("B.omd", hash)]]);
});

test("R5: vim save ⇒ schedule, quiet skip, cancel + apply, quiet skip — no create, no move", async () => {
  const [v1, v2] = [pageText("R", "v1"), pageText("R", "v2")];
  const view = viewOf([{ id: "R", path: "Roadmap.omd", text: v1, synced: await sha16(v1) }]);
  const events = [drop("Roadmap.omd"), write("Roadmap.omd~", "hb", v1), write("Roadmap.omd", "h2", v2), drop("Roadmap.omd~")];
  assert.deepStrictEqual(await replay(view, events), [[schedule("R", "Roadmap.omd")], [temp("Roadmap.omd~", true)],
    [cancel("R"), apply("R", "Roadmap.omd", v2, "h2")], [temp("Roadmap.omd~", true)]]);
  assert.deepStrictEqual(view.table.pending, new Set());
});

test("R6: cp A.omd B.omd ⇒ a copy without the id; ten alternating writes (B still holding A's id) make zero moves", async () => {
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A", "v0"), synced: await sha16(pageText("A", "v0")) }]);
  assert.deepStrictEqual(await replay(view, [write("B.omd", "hB", pageText("A", "v0"))]), [[copy("B.omd", "hB", "v0")]]);
  const copyId = view.table.pages[1].pageId;
  for (let round = 1; round <= 10; round++) {
    const [path, text] = [round % 2 === 1 ? "A.omd" : "B.omd", pageText("A", `edit ${round}`)];
    const hash = await sha16(text);
    const expected = path === "A.omd" ? apply("A", path, text, hash) : conflict(copyId, path, text, hash);
    assert.deepStrictEqual(await replay(view, [write(path, hash, text)]), [[expected]], `round ${round}`);
  }
});

test("R5: mv B.omd A.omd over a live A ⇒ conflict on A, B's pending archive cancelled", async () => {
  const view = viewOf([page("A", "A.omd"), page("B", "B.omd")]);
  assert.deepStrictEqual(await replay(view, [drop("B.omd"), write("A.omd", "h", pageText("B"))]),
    [[schedule("B", "B.omd")], [cancel("B"), conflict("A", "A.omd", pageText("B"), "h")]]);
});

test("R13: rm -r Roadmap/ ⇒ every child scheduled once (the directory delete adds none), never Roadmap", async () => {
  const view = viewOf([...roadmap, page("c2", "Roadmap/c2.omd", "Roadmap")]);
  assert.deepStrictEqual(await replay(view, [drop("Roadmap/c1.omd"), drop("Roadmap/c2.omd"), drop("Roadmap")]),
    [[schedule("c1", "Roadmap/c1.omd")], [schedule("c2", "Roadmap/c2.omd")], [deletedDir("Roadmap", "children-dir", "Roadmap")]]);
  assert.deepStrictEqual(view.table.pending, new Set(["c1", "c2"]));
});

test("A1: rm Roadmap.omd, then c1's id written elsewhere ⇒ a copy, never a move (a file delete is no evidence)", async () => {
  assert.deepStrictEqual(await replay(viewOf(roadmap), [drop("Roadmap.omd"), write("elsewhere/c1.omd", "h", pageText("c1"))]),
    [[schedule("Roadmap", "Roadmap.omd")], [copy("elsewhere/c1.omd", "h")]]);
});

test("R6/R6b: after rm src, F's id in a page file or a page whose tail changed is a copy, never a move", async () => {
  const events = [drop("src"), write("x/notes.omd", "h", pageText("F")), write("lib/renamed.omd", "h", pageText("a"))];
  assert.deepStrictEqual(await replay(viewOf(src), events),
    [[deletedDir("src", "folder-dir", "F"), schedule("F", "src")], [copy("x/notes.omd", "h")], [copy("lib/renamed.omd", "h")]]);
});

test("R7: a _folder.omd whose tail matches no move is a loud skip, never turned into a page", async () => {
  const view = viewOf([folder("G", "G"), folder("F", "G/F", "G")]);
  assert.deepStrictEqual(await replay(view, [drop("G"), write("H/Z/_folder.omd", "h", pageText("F"))]),
    [[deletedDir("G", "folder-dir", "G"), schedule("G", "G")], [noFolder("H/Z/_folder.omd")]]);
});

test("A2: mv src lib — all 24 write orders move the folder once; zero create, zero conflict, every id kept", async () => {
  const orders = orderings(["_folder.omd", "a.omd", "b.omd", "c.omd"]);
  assert.equal(orders.length, 24);
  for (const order of orders) {
    const view = viewOf(src);
    const writes = order.map((name) => write(`lib/${name}`, `h-${name}`, pageText(name === "_folder.omd" ? "F" : name.slice(0, 1))));
    assert.deepStrictEqual(await replay(view, [drop("src"), ...writes]), [[deletedDir("src", "folder-dir", "F"), schedule("F", "src")],
      [cancel("F"), move("F", "src", "lib", true), record(`lib/${order[0]}`, `h-${order[0]}`)],
      ...order.slice(1).map((name) => [record(`lib/${name}`, `h-${name}`)])], order.join(" "));
    assert.deepStrictEqual(where(view), ["F@lib", "a@lib/a.omd", "b@lib/b.omd", "c@lib/c.omd"], order.join(" "));
    assert.deepStrictEqual(view.table.pending, new Set(), order.join(" "));
  }
});

test("A2: mv Roadmap Plans (c1 holds grandchild g) — both write orders move c1 once; zero create, zero conflict", async () => {
  const files = [["Plans/c1.omd", "c1"], ["Plans/c1/g.omd", "g"]];
  for (const [first, second] of [files, [...files].reverse()]) {
    const view = viewOf([...roadmap, page("g", "Roadmap/c1/g.omd", "c1")]);
    const writes = [first, second].map(([path, id]) => write(path, `h-${id}`, pageText(id)));
    assert.deepStrictEqual(await replay(view, [drop("Roadmap"), ...writes]), [
      [deletedDir("Roadmap", "children-dir", "Roadmap"), schedule("c1", "Roadmap/c1.omd")],
      [cancel("c1"), move("c1", "Roadmap/c1.omd", "Plans/c1.omd"), record(first[0], `h-${first[1]}`)],
      [record(second[0], `h-${second[1]}`)]], first[0]);
    assert.deepStrictEqual(where(view), ["Roadmap@Roadmap.omd", "c1@Plans/c1.omd", "g@Plans/c1/g.omd"], first[0]);
    assert.deepStrictEqual(view.table.pending, new Set(), first[0]);
  }
});

test("A2: lib is already a folder ⇒ src never moves onto it; pending a moves alone, b (not pending) is a copy", async () => {
  const view = viewOf([...src, folder("L", "lib")]);
  const events = [drop("src/a.omd"), drop("src"), write("lib/a.omd", "ha", pageText("a")), write("lib/b.omd", "hb", pageText("b"))];
  assert.deepStrictEqual(await replay(view, events), [[schedule("a", "src/a.omd")], [deletedDir("src", "folder-dir", "F"),
    schedule("F", "src")], [cancel("a"), move("a", "src/a.omd", "lib/a.omd"), record("lib/a.omd", "ha")], [copy("lib/b.omd", "hb")]]);
});

test("A2 Ponytail: mv Roadmap Roadmap.omd X/ (directory first) moves c1 alone into X/Roadmap, then Roadmap", async () => {
  const events = [drop("Roadmap"), write("X/Roadmap/c1.omd", "h1", pageText("c1")), drop("Roadmap.omd"),
    write("X/Roadmap.omd", "hR", pageText("Roadmap"))];
  assert.deepStrictEqual(await replay(viewOf(roadmap), events), [
    [deletedDir("Roadmap", "children-dir", "Roadmap"), schedule("c1", "Roadmap/c1.omd")],
    [cancel("c1"), move("c1", "Roadmap/c1.omd", "X/Roadmap/c1.omd"), record("X/Roadmap/c1.omd", "h1")],
    [schedule("Roadmap", "Roadmap.omd")], [cancel("Roadmap"), move("Roadmap", "Roadmap.omd", "X/Roadmap.omd"), record("X/Roadmap.omd", "hR")]]);
});

test("A2: mv Roadmap.omd Roadmap X/ (file first) is exact — one move carries c1 along", async () => {
  const view = viewOf(roadmap);
  const events = [drop("Roadmap.omd"), write("X/Roadmap.omd", "hR", pageText("Roadmap")), drop("Roadmap"),
    write("X/Roadmap/c1.omd", "h1", pageText("c1"))];
  assert.deepStrictEqual(await replay(view, events), [[schedule("Roadmap", "Roadmap.omd")],
    [cancel("Roadmap"), move("Roadmap", "Roadmap.omd", "X/Roadmap.omd"), record("X/Roadmap.omd", "hR")], [], [record("X/Roadmap/c1.omd", "h1")]]);
  assert.deepStrictEqual(where(view), ["Roadmap@X/Roadmap.omd", "c1@X/Roadmap/c1.omd"]);
});

test("A3: mv readme.omd README.omd ⇒ schedule, then cancel + move + record (a case-only rename)", async () => {
  assert.deepStrictEqual(await replay(viewOf([page("r", "readme.omd")]), [drop("readme.omd"), write("README.omd", "h", pageText("r"))]),
    [[schedule("r", "readme.omd")], [cancel("r"), move("r", "readme.omd", "README.omd"), record("README.omd", "h")]]);
});

test("A3: mv Src src, _folder.omd first ⇒ the folder moves on it, a.omd then records — zero create, zero conflict", async () => {
  const view = viewOf([folder("F", "Src"), page("a", "Src/a.omd", "F")]);
  const events = [drop("Src"), write("src/_folder.omd", "hF", pageText("F")), write("src/a.omd", "ha", pageText("a"))];
  assert.deepStrictEqual(await replay(view, events), [[deletedDir("Src", "folder-dir", "F"), schedule("F", "Src")],
    [cancel("F"), move("F", "Src", "src", true), record("src/_folder.omd", "hF")], [record("src/a.omd", "ha")]]);
});

test("A3: mv Src src, _folder.omd last ⇒ a.omd is one loud case skip, then the folder moves — zero create, zero conflict", async () => {
  const view = viewOf([folder("F", "Src"), page("a", "Src/a.omd", "F")]);
  const events = [drop("Src"), write("src/a.omd", "ha", pageText("a")), write("src/_folder.omd", "hF", pageText("F"))];
  assert.deepStrictEqual(await replay(view, events), [[deletedDir("Src", "folder-dir", "F"), schedule("F", "Src")],
    [loud("src/a.omd: differs only in letter case from an existing file")],
    [cancel("F"), move("F", "Src", "src", true), record("src/_folder.omd", "hF")]]);
  assert.deepStrictEqual(where(view), ["F@src", "a@src/a.omd"]);
});

test("A8: own evidence on a page the user may not delete ⇒ cancel its archive and copy", async () => {
  const view = viewOf([{ ...page("A", "A.omd"), canDelete: false as const }]);
  view.table.pending.add("A");
  await expectPlan(view, write("B.omd", "h", pageText("A")), [cancel("A"), copy("B.omd", "h")]);
});

test("A8: directory evidence on a page the user may not delete (nothing pending) ⇒ a copy, no cancel", async () => {
  const view = viewOf([folder("F", "src"), { ...page("a", "src/a.omd", "F"), canDelete: false as const }]);
  assert.deepStrictEqual(await replay(view, [drop("src"), write("lib/a.omd", "h", pageText("a"))]),
    [[deletedDir("src", "folder-dir", "F"), schedule("F", "src")], [copy("lib/a.omd", "h")]]);
});

test("R6: an id from another workspace, or a page trashed in the UI ⇒ a copy, never a restore", async () => {
  await expectPlan(viewOf([page("A", "A.omd")]), write("Elsewhere.omd", "h", pageText("other-ws")), [copy("Elsewhere.omd", "h")]);
  await expectPlan(viewOf([{ ...page("A", "A.omd"), archived: true }]), write("A.omd", "h", pageText("A")), [copy("A.omd", "h")]);
});

test("R6: a page this flow archived ⇒ restore + move + decide on the REMEMBERED hash; canDelete false ⇒ copy", async () => {
  const old = pageText("A", "old");
  const archived = { id: "A", path: "notes/A.omd", text: old, archived: true, inboundArchive: { syncedHash: await sha16(old), path: "notes/A.omd" } };
  const inbound = pageText("A", "new");
  assert.deepStrictEqual(await replay(viewOf([archived]), [write("A.omd", "h", inbound)]),
    [[{ op: "restore", pageId: "A" }, move("A", "notes/A.omd", "A.omd"), apply("A", "A.omd", inbound, "h")]]);
  await expectPlan(viewOf([{ ...archived, canDelete: false }]), write("A.omd", "h", inbound), [copy("A.omd", "h", "new")]);
});

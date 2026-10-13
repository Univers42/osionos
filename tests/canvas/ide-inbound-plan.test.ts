/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-plan.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inbound decision table one row at a time (R1-R14, A4, A5, A7). Every test
// asserts the EXACT step list: a table this size is reviewed by diffing, not by
// reading. Multi-event shell commands live in ide-inbound-plan-moves.test.ts.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import {
  apply, cancel, conflict, deletedDir, drop, expectPlan, loud, noFolder, pageText, readOnly, record, replay, schedule, temp,
  viewOf, write,
} from "./fixtures/inboundFakeView.ts";

const invalid = (path: string) => loud(`"${path}" is not a valid name here`);
const roadmap = [
  { id: "Roadmap", path: "Roadmap.omd", text: pageText("Roadmap") },
  { id: "c1", path: "Roadmap/c1.omd", parentId: "Roadmap", text: pageText("c1") },
  { id: "c2", path: "Roadmap/c2.omd", parentId: "Roadmap", text: pageText("c2") },
];
/** Page A whose local text is `body` and whose ledger already holds that text's hash. */
const syncedA = async (body: string) => viewOf([{ id: "A", path: "A.omd", text: pageText("A", body), synced: await sha16(pageText("A", body)) }]);

test("R1: a path the app could never own (.., ., empty) is one loud skip, and records nothing", async () => {
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A") }]);
  await expectPlan(view, write("a/../b.omd", "h", pageText("B")), [invalid("a/../b.omd")]);
  await expectPlan(view, drop(".."), [invalid("..")]);
  await expectPlan(view, write("a/./b.omd", "h", pageText("B")), [invalid("a/./b.omd")]);
  await expectPlan(view, drop("/"), [invalid("/")]);
  assert.equal(view.table.ledger.size, 0, "a skipped path never reaches the ledger");
});

test("R1: Ponytail — a stale etc..omd (a page titled \"etc.\" before the Q1 trim) is refused loudly, never misread", async () => {
  const view = viewOf([{ id: "E", path: "etc..omd", text: pageText("E") }]);
  await expectPlan(view, write("etc..omd", "h", pageText("E", "edit")), [invalid("etc..omd")]);
});

test("A5: 4913 written where a code page owns 4913 is loud; every other scratch name is quiet", async () => {
  const view = viewOf([{ id: "c", path: "4913", code: true, text: "int main()" }]);
  await expectPlan(view, write("4913", "h", "int main()"), [temp("4913", false)]);
  for (const name of ["x.omd~", ".Roadmap.omd.swp", ".Roadmap.omd.swo", ".Roadmap.omd.swx", ".#lock", "#autosave#"]) {
    await expectPlan(view, write(name, "h", "junk"), [temp(name, true)], name);
  }
});

test("R9: deleting a scratch file no page owns is a quiet skip, and one a page owns is loud", async () => {
  const view = viewOf([{ id: "c", path: "4913", code: true, text: "int main()" }]);
  await expectPlan(view, drop("x.omd~"), [temp("x.omd~", true)]);
  await expectPlan(view, drop("4913"), [temp("4913", false)]);
});

test("R2: our own write at its own path is a cancel plus a record, never an apply", async () => {
  const text = pageText("A", "hello");
  const hash = await sha16(text);
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A", "older"), synced: hash, echoHash: hash }]);
  view.table.pending.add("A");
  await expectPlan(view, write("A.omd", hash, text), [cancel("A"), record("A.omd", hash)]);
});

test("R2: an echo hash the ledger does not hold at this path is not an echo", async () => {
  const text = pageText("A", "hello");
  const hash = await sha16(text);
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A", "older"), echoHash: hash }]);
  await expectPlan(view, write("A.omd", hash, text), [conflict("A", "A.omd", text, hash)], "R5 decides it");
});

test("R3: a name differing only in letter case is a loud skip unless it is that page's pending rename", async () => {
  const view = viewOf([{ id: "r", path: "README.omd", text: pageText("r") }]);
  const skip = loud("readme.omd: differs only in letter case from an existing file");
  await expectPlan(view, write("readme.omd", "h", pageText("r")), [skip], "not pending");
  view.table.pending.add("r");
  await expectPlan(view, write("readme.omd", "h", pageText("other")), [skip], "another id");
});

test("R4: a write landing on a directory is a loud skip, never a page", async () => {
  await expectPlan(viewOf(roadmap), write("Roadmap", "h", "nope"), [loud("Roadmap: a directory, not a file")]);
});

test("R5: a write onto the page's own file with an unchanged local side applies", async () => {
  await expectPlan(await syncedA("old"), write("A.omd", "h2", pageText("A", "new")), [apply("A", "A.omd", pageText("A", "new"), "h2")]);
});

test("R5: identical content records instead of applying", async () => {
  await expectPlan(await syncedA("same"), write("A.omd", "h2", pageText("A", "same")), [record("A.omd", "h2")]);
});

test("R5: both sides changed is a surfaced conflict, never a silent overwrite", async () => {
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A", "mine"), synced: await sha16(pageText("A", "yours")) }]);
  await expectPlan(view, write("A.omd", "h2", pageText("A", "theirs")), [conflict("A", "A.omd", pageText("A", "theirs"), "h2")]);
});

test("R5: the pending archive is cancelled before the content is decided", async () => {
  const view = await syncedA("old");
  view.table.pending.add("A");
  await expectPlan(view, write("A.omd", "h2", pageText("A", "new")), [cancel("A"), apply("A", "A.omd", pageText("A", "new"), "h2")]);
});

test("R5: a code page's own file follows the same three-way decision", async () => {
  const view = viewOf([{ id: "c", path: "src/main.c", code: true, text: "int main() {}", synced: await sha16("int main() {}") }]);
  await expectPlan(view, write("src/main.c", "h2", "int x;"), [apply("c", "src/main.c", "int x;", "h2")]);
});

test("R6: a page file with no id becomes a page with its text untouched", async () => {
  const text = `---\ntitle: "Fresh"\n---\nbody\n`;
  await expectPlan(viewOf([]), write("Notes.omd", "h", text), [{ op: "create", path: "Notes.omd", text, hash: "h", kind: "page" }]);
});

test("R6: a copy drops ONLY the id line — every other front-matter line stays (LF and CRLF)", async () => {
  const lf = `---\nid: "A"\ntitle: "T"\nicon: null\nupdated: "2026"\n---\nbody\nid: "kept in the body"\n`;
  await expectPlan(viewOf([]), write("Copy.omd", "h", lf), [{ op: "create", path: "Copy.omd",
    text: `---\ntitle: "T"\nicon: null\nupdated: "2026"\n---\nbody\nid: "kept in the body"\n`, hash: "h", kind: "page" }]);
  await expectPlan(viewOf([]), write("Copy.omd", "h", `---\r\nid: "A"\r\ntitle: "T"\r\n---\r\nbody`),
    [{ op: "create", path: "Copy.omd", text: `---\r\ntitle: "T"\r\n---\r\nbody`, hash: "h", kind: "page" }]);
});

test("R7: a _folder.omd with no live folder behind it is a loud skip", async () => {
  await expectPlan(viewOf([]), write("X/_folder.omd", "h", pageText("nobody")), [noFolder("X/_folder.omd")]);
});

test("R7: a _folder.omd carrying a page's (not a folder's) id is a loud skip, never a move", async () => {
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A") }]);
  view.table.pending.add("A");
  await expectPlan(view, write("X/_folder.omd", "h", pageText("A")), [noFolder("X/_folder.omd")]);
});

test("R8: a file no page owns becomes a code page; one a code page owns is decided", async () => {
  await expectPlan(viewOf([]), write("src/util.py", "h", "print(1)"),
    [{ op: "create", path: "src/util.py", text: "print(1)", hash: "h", kind: "code" }]);
  const view = viewOf([{ id: "c", path: "src/util.py", code: true, text: "print(1)", synced: await sha16("print(1)") }]);
  await expectPlan(view, write("src/util.py", "h", "print(1)"), [record("src/util.py", "h")]);
});

test("A4: a .omd whose front matter does not parse is one loud skip, owned or not, and no record", async () => {
  const view = viewOf([{ id: "A", path: "Roadmap.omd", text: pageText("A") }]);
  for (const path of ["Roadmap.omd", "Fresh.omd", "X/_folder.omd"]) {
    await expectPlan(view, write(path, "h", "---\nid: \"A\"\nbroken\n---\nbody"),
      [loud(`${path}: front matter not read: front-matter line 3: missing ": "`)], path);
  }
  assert.equal(view.table.ledger.size, 0, "A4 records nothing");
});

test("R10: a delete whose name differs only in case (or names nothing) touches nothing", async () => {
  const view = viewOf(roadmap);
  await expectPlan(view, drop("roadmap.omd"), []);
  await expectPlan(view, drop("nothing-here.omd"), []);
});

test("R11: deleting a page's own file schedules its archive; a pending one schedules nothing", async () => {
  const view = viewOf([{ id: "A", path: "A.omd", text: pageText("A") }]);
  assert.deepStrictEqual(await replay(view, [drop("A.omd"), drop("A.omd")]), [[schedule("A", "A.omd")], []]);
});

test("A7: R11 on a page the user may not delete is a loud skip and no timer", async () => {
  await expectPlan(viewOf([{ id: "A", path: "A.omd", text: pageText("A"), canDelete: false }]), drop("A.omd"), [readOnly("A.omd")]);
});

test("R12: deleting _folder.omd alone leaves the folder to its directory delete", async () => {
  await expectPlan(viewOf([{ id: "F", path: "src", folder: true, text: pageText("F") }]), drop("src/_folder.omd"), []);
});

test("R13: a children directory never touches its owner and skips a child already pending", async () => {
  const view = viewOf(roadmap);
  view.table.pending.add("c1");
  await expectPlan(view, drop("Roadmap"), [deletedDir("Roadmap", "children-dir", "Roadmap"), schedule("c2", "Roadmap/c2.omd")]);
});

test("A7: R13 with a child the user may not delete is a loud skip for it, and the rest still archive", async () => {
  const view = viewOf(roadmap.map((spec) => (spec.id === "c1" ? { ...spec, canDelete: false as const } : spec)));
  await expectPlan(view, drop("Roadmap"),
    [deletedDir("Roadmap", "children-dir", "Roadmap"), readOnly("Roadmap/c1.omd"), schedule("c2", "Roadmap/c2.omd")]);
});

test("R14: a folder directory registers the move evidence and queues the folder's archive", async () => {
  await expectPlan(viewOf([{ id: "F", path: "src", folder: true, text: pageText("F") }]), drop("src"),
    [deletedDir("src", "folder-dir", "F"), schedule("F", "src")]);
});

test("A7: R14 twice queues ONE archive; a folder the user may not delete is a loud skip, nothing registered", async () => {
  const view = viewOf([{ id: "F", path: "src", folder: true, text: pageText("F") }]);
  assert.deepStrictEqual(await replay(view, [drop("src"), drop("src")]),
    [[deletedDir("src", "folder-dir", "F"), schedule("F", "src")], [deletedDir("src", "folder-dir", "F")]]);
  const locked = viewOf([{ id: "F", path: "src", folder: true, text: pageText("F"), canDelete: false }]);
  await expectPlan(locked, drop("src"), [readOnly("src")]);
  assert.deepStrictEqual(locked.table.deletedDirs, []);
});

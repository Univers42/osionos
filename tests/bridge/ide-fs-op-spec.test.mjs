// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-fs-op-spec.test.mjs                            :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import { buildFsOpSpec, buildWriteSpecs, assertRelPath, WRITE_PIECE_B64, MAX_HASH_PATHS } from "../../scripts/ide-sandbox-spec.mjs";

test("fs-op specs: argv shape, sh placeholder, no client string in the script", () => {
  const spec = buildFsOpSpec("read", { path: "src/main.c", offset: 2, length: 3 });
  assert.equal(spec.Cmd[0], "sh");
  assert.equal(spec.Cmd[1], "-c");
  assert.equal(spec.Cmd[3], "sh"); // $0 placeholder — client values are ARGV only
  assert.deepEqual(spec.Cmd.slice(4), ["src/main.c", "2", "3"]);
  assert.ok(!spec.Cmd[2].includes("main.c"), "path must never be interpolated into the script");
  assert.equal(spec.AttachStderr, false);
  assert.equal("User" in spec, false); // an exec with no User inherits the box's (ADR 0011)
});

test("fs-op specs: traversal, absolute paths and parse-breaking characters are refused", () => {
  for (const bad of ["../etc/passwd", "/abs", "a/../../b", "line\nbreak", "tab\there"]) {
    assert.throws(() => buildFsOpSpec("stat", { path: bad }), /status|invalid|unrepresentable/i);
    assert.throws(() => assertRelPath(bad));
  }
  assertRelPath("ok/nested/file.c");
  assertRelPath("-dash-start.c"); // legal — scripts prefix ./ so it can't read as an option
});

test("fs-op specs: unknown op, missing rename target, missing write content refused", () => {
  assert.throws(() => buildFsOpSpec("chmod", { path: "x" }), /unknown fs op/);
  assert.throws(() => buildFsOpSpec("rename", { path: "a" }), /rename needs a target/);
  assert.throws(() => buildFsOpSpec("write", { path: "a" }), /base64/);
  assert.throws(() => buildFsOpSpec("read", { path: "" }), /missing path/);
});

test("fs-op specs: rename/delete flags ride as argv '1'/'' — never booleans in shell", () => {
  const rename = buildFsOpSpec("rename", { path: "a", to: "b", overwrite: true });
  assert.deepEqual(rename.Cmd.slice(4), ["a", "b", "1"]);
  const del = buildFsOpSpec("delete", { path: "a" });
  assert.deepEqual(del.Cmd.slice(4), ["a", ""]);
});

test("write specs: content past one argv item (128 KiB) is staged in pieces under one token", () => {
  assert.deepEqual(buildWriteSpecs("a.c", "aGk=").map((spec) => spec.Cmd.slice(4)), [["a.c", "aGk="]], "small content: one exec, no part");
  const b64 = "QUJD".repeat(Math.ceil((WRITE_PIECE_B64 * 2.5) / 4));
  const specs = buildWriteSpecs("big.c", b64);
  assert.deepEqual(specs.map((spec) => spec.Cmd[7]), ["first", "more", "last"]);
  assert.equal(new Set(specs.map((spec) => spec.Cmd[6])).size, 1, "every piece names the same stage");
  // osio-fs-agent.mjs TRANSIENT_FILE (/\.vfstmp\d+$/) keeps the staged file out of the pages:
  // a token with a letter in it would sync every piece back as a page.
  assert.match(`big.c.vfstmp${specs[0].Cmd[6]}`, /\.vfstmp\d+$/);
  assert.equal(specs.map((spec) => spec.Cmd[5]).join(""), b64, "the pieces are the content, in order");
  assert.ok(specs.every((spec) => spec.Cmd[5].length <= WRITE_PIECE_B64 && spec.Cmd[5].length % 4 === 0), "each piece decodes alone");
});

test("write specs: an oversize piece is a 413, a part without a valid stage a 400", () => {
  const big = "A".repeat(WRITE_PIECE_B64 + 4);
  assert.throws(() => buildFsOpSpec("write", { path: "a.c", contentBase64: big }), (e) => e.status === 413);
  assert.throws(() => buildFsOpSpec("write", { path: "a.c", contentBase64: "aGk=", part: "first", stage: "x;rm" }), (e) => e.status === 400);
  assert.throws(() => buildFsOpSpec("write", { path: "a.c", contentBase64: "aGk=", part: "append", stage: "0123456789" }), (e) => e.status === 400);
});

test("hashes spec: every path rides argv after the sh placeholder; 1-1000 valid paths or a 400", () => {
  const spec = buildFsOpSpec("hashes", { paths: ["a.c", "src/with space.c", "-n.c"] });
  assert.deepEqual(spec.Cmd.slice(0, 2), ["sh", "-c"]);
  assert.deepEqual(spec.Cmd.slice(3), ["sh", "a.c", "src/with space.c", "-n.c"]);
  assert.equal("User" in spec, false); // an exec with no User inherits the box's (ADR 0011)
  assert.ok(!spec.Cmd[2].includes("a.c"), "no client string in the script");
  const refused = (paths) => assert.throws(() => buildFsOpSpec("hashes", { paths }), (e) => e.status === 400, JSON.stringify(paths)?.slice(0, 40));
  refused(undefined);
  refused("a.c");
  refused([]);
  refused([""]);
  refused(["../etc/passwd"]);
  refused(["/etc/passwd"]);
  refused(["a\nb"]);
  refused(Array.from({ length: MAX_HASH_PATHS + 1 }, (_, i) => `f${i}.c`));
  assert.equal(buildFsOpSpec("hashes", { paths: Array.from({ length: MAX_HASH_PATHS }, (_, i) => `f${i}.c`) }).Cmd.length, 4 + MAX_HASH_PATHS);
});

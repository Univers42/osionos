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

import { buildFsOpSpec, assertRelPath } from "../../scripts/ide-sandbox-spec.mjs";

test("fs-op specs: argv shape, sh placeholder, no client string in the script", () => {
  const spec = buildFsOpSpec("read", { path: "src/main.c", offset: 2, length: 3 });
  assert.equal(spec.Cmd[0], "sh");
  assert.equal(spec.Cmd[1], "-c");
  assert.equal(spec.Cmd[3], "sh"); // $0 placeholder — client values are ARGV only
  assert.deepEqual(spec.Cmd.slice(4), ["src/main.c", "2", "3"]);
  assert.ok(!spec.Cmd[2].includes("main.c"), "path must never be interpolated into the script");
  assert.equal(spec.AttachStderr, false);
  assert.equal(spec.User, "10001:10001");
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

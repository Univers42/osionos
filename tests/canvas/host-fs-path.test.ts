/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-path.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { pathRefusal, isInsideRoot, WIN32_RESERVED } from "../../scripts/host-fs-path.mjs";

test("pathRefusal: empty/dot segments and absolute paths are ECONFINE", () => {
  const bad = ["a//b", "a/", "./x", "a/../b", ".", "..", "/x"];
  for (const p of bad) assert.equal(pathRefusal(p, { platform: "linux", mutating: false }), "ECONFINE", p);
  assert.equal(pathRefusal("", { platform: "linux", mutating: true }), "ECONFINE");
  assert.equal(pathRefusal("", { platform: "linux", mutating: false }), null);
  assert.equal(pathRefusal("C:\\x", { platform: "win32", mutating: false }), "ECONFINE");
  assert.equal(pathRefusal("\\\\srv\\x", { platform: "win32", mutating: false }), "ECONFINE");
});

test("pathRefusal: control characters are EUNSUP on every platform", () => {
  for (const c of ["a\nb", "a\rb", "a\tb", "a\0b"]) {
    assert.equal(pathRefusal(c, { platform: "linux", mutating: false }), "EUNSUP", JSON.stringify(c));
    assert.equal(pathRefusal(c, { platform: "win32", mutating: false }), "EUNSUP", JSON.stringify(c));
  }
});

test("pathRefusal: win32 reserved and punctuation rules", () => {
  const deny = ["a:b", "a\\b", "x.", "x ", "CON", "con.txt", "Aux.tar.gz", "COM1", "lpt¹", "CONIN$", "conout$.log"];
  for (const p of deny) assert.equal(pathRefusal(p, { platform: "win32", mutating: false }), "EUNSUP", p);
  const allow = ["console.txt", "COM10", "nul_file", ".hidden"];
  for (const p of allow) assert.equal(pathRefusal(p, { platform: "win32", mutating: false }), null, p);
  assert.ok(WIN32_RESERVED.test("con") && WIN32_RESERVED.test("COM1") && !WIN32_RESERVED.test("console"));
});

test("pathRefusal: linux allows win32-only names", () => {
  for (const p of ["a:b", "dot.end.", "CON"]) assert.equal(pathRefusal(p, { platform: "linux", mutating: false }), null, p);
});

test("isInsideRoot: separator stops the sibling-prefix slip", () => {
  assert.equal(isInsideRoot("/t/root", "/t/root", "/"), true);
  assert.equal(isInsideRoot("/t/root", "/t/root/a", "/"), true);
  assert.equal(isInsideRoot("/t/root", "/t/root-evil", "/"), false);
  assert.equal(isInsideRoot("/t/root", "/t/root-evil/s", "/"), false);
  assert.equal(isInsideRoot("/", "/etc", "/"), true);
});

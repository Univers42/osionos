/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-frame-protocol.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The messages between the app and the framed IDE page are the boundary an app XSS reaches
// (devil verdict 2026-10-30, C0-F2): exact origins both ways, and nothing that runs code.

import assert from "node:assert/strict";
import test from "node:test";

import { isSafeRelativePath, newNonce, readAppMessage, readIdeMessage } from "../../src/features/ide/vscode/ideFrameProtocol.ts";

const APP = "https://app.example:3001";
const IDE = "https://ide.example:4100";
const TOKEN = "osionos_ide1.eyJzdWIiOiJ4In0.c2ln";

test("the IDE page accepts a session token and an open request from the exact app origin", () => {
  assert.deepEqual(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, APP, [APP]), { type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(readAppMessage({ type: "osionos-ide/open", path: "src/app.py" }, APP, [APP]), { type: "osionos-ide/open", path: "src/app.py" });
});

test("a message from any other origin is ignored", () => {
  for (const origin of ["https://evil.example", "https://app.example:3002", "http://app.example:3001", "null", ""]) {
    assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, origin, [APP]), null, origin);
  }
});

test("nothing that runs code is accepted: terminal input, tasks, debug, extensions, settings", () => {
  for (const type of ["osionos-ide/terminal", "osionos-ide/sendText", "osionos-ide/task", "osionos-ide/debug", "osionos-ide/install", "osionos-ide/settings", "osionos-ide/command", "osionos-ide/write"]) {
    assert.equal(readAppMessage({ type, text: "rm -rf ~\n" }, APP, [APP]), null, type);
  }
});

test("open refuses a path into .git, a dotfile, a parent or an absolute path", () => {
  for (const path of [".git/hooks/post-checkout", "a/.git/config", ".env", "../x", "a/../../x", "/etc/passwd", "a\\b", "a//b", "", "a/./b", "a\u0000b"]) {
    assert.equal(readAppMessage({ type: "osionos-ide/open", path }, APP, [APP]), null, JSON.stringify(path));
    assert.equal(isSafeRelativePath(path), false, JSON.stringify(path));
  }
  assert.equal(isSafeRelativePath("notes/today.omd"), true);
});

test("a malformed token, an extra field or a non-object is refused", () => {
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: "Bearer x" }, APP, [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: `${TOKEN}.extra` }, APP, [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN, run: "x" }, APP, [APP]), null);
  assert.equal(readAppMessage("osionos-ide/session", APP, [APP]), null);
  assert.equal(readAppMessage(null, APP, [APP]), null);
});

test("the app accepts only state reports from the exact IDE origin", () => {
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/ready", node: "laptop" }, IDE, IDE), { type: "osionos-ide/ready", node: "laptop" });
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/state", state: "connected" }, IDE, IDE), { type: "osionos-ide/state", state: "connected" });
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/need-session" }, IDE, IDE), { type: "osionos-ide/need-session" });
  assert.equal(readIdeMessage({ type: "osionos-ide/state", state: "pwned" }, IDE, IDE), null);
  assert.equal(readIdeMessage({ type: "osionos-ide/ready", node: "Laptop/../x" }, IDE, IDE), null);
  assert.equal(readIdeMessage({ type: "osionos-ide/ready", node: "laptop" }, APP, IDE), null);
});

// The desktop app (app://osionos) and the web app share one node; each is accepted, nothing else.
test("an app message is read from any listed app origin and from no other", () => {
  const apps = [APP, "app://osionos"];
  for (const origin of apps) {
    assert.deepEqual(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, origin, apps), { type: "osionos-ide/session", token: TOKEN }, origin);
  }
  for (const origin of ["app://other", "null", IDE, ""]) {
    assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, origin, apps), null, origin);
  }
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, APP, []), null, "no listed origin");
});

// Own machines (devil verdict 2026-10-31, condition 5): before any token, the app sends a nonce and
// the page answers with its machine id and a signature the bridge checks against the paired key.
const MACHINE = "m-abcdefghijklmnop";
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
const SIG = "s".repeat(86);

test("hello carries one base64url nonce of at least 16 bytes, and nothing else", () => {
  assert.deepEqual(readAppMessage({ type: "osionos-ide/hello", nonce: NONCE }, APP, [APP]), { type: "osionos-ide/hello", nonce: NONCE });
  for (const nonce of ["short", "A".repeat(21), "A".repeat(129), `${"A".repeat(22)}=`, `${"A".repeat(22)}/`, 7]) {
    assert.equal(readAppMessage({ type: "osionos-ide/hello", nonce }, APP, [APP]), null, String(nonce));
  }
  assert.equal(readAppMessage({ type: "osionos-ide/hello", nonce: NONCE, extra: 1 }, APP, [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/hello", nonce: NONCE }, "https://evil.example", [APP]), null);
});

test("identity is one machine id and one Ed25519 signature, from the exact IDE origin", () => {
  const identity = { type: "osionos-ide/identity", machineId: MACHINE, sig: SIG };
  assert.deepEqual(readIdeMessage(identity, IDE, IDE), identity);
  assert.equal(readIdeMessage(identity, APP, IDE), null);
  assert.equal(readIdeMessage({ ...identity, machineId: "laptop" }, IDE, IDE), null);
  assert.equal(readIdeMessage({ ...identity, sig: "s".repeat(85) }, IDE, IDE), null);
  assert.equal(readIdeMessage({ ...identity, sig: `${"s".repeat(85)}+` }, IDE, IDE), null);
  assert.equal(readIdeMessage({ ...identity, extra: 1 }, IDE, IDE), null);
});

test("a session may carry a bridge-signed machine token", () => {
  const token = "osionos_mc1.abcdefgh.eyJzdWIiOiJ4In0.c2ln";
  assert.deepEqual(readAppMessage({ type: "osionos-ide/session", token }, APP, [APP]), { type: "osionos-ide/session", token });
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: "osionos_mc1.ABCDEFGH.eyJ4.c2ln" }, APP, [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: "osionos_mc1.eyJ4.c2ln" }, APP, [APP]), null);
});

test("a nonce is 16 random bytes in base64url and never repeats", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 64; index += 1) {
    const nonce = newNonce();
    assert.match(nonce, /^[A-Za-z0-9_-]{22}$/);
    assert.deepEqual(readAppMessage({ type: "osionos-ide/hello", nonce }, APP, [APP]), { type: "osionos-ide/hello", nonce });
    seen.add(nonce);
  }
  assert.equal(seen.size, 64);
});

// The app tells the page why it will not send a token, so the page shows words, not "Connecting…".
test("refused carries one known reason, from a listed app origin only", () => {
  for (const reason of ["mismatch", "unavailable", "other-account"] as const) {
    assert.deepEqual(readAppMessage({ type: "osionos-ide/refused", reason }, APP, [APP]), { type: "osionos-ide/refused", reason });
  }
  assert.equal(readAppMessage({ type: "osionos-ide/refused", reason: "mismatch" }, "https://evil.example", [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/refused", reason: "<b>pwned</b>" }, APP, [APP]), null);
  assert.equal(readAppMessage({ type: "osionos-ide/refused", reason: "mismatch", text: "x" }, APP, [APP]), null);
});

test("Amendment 1: the page may say remembered, need-resume and forgotten; the app may send resume and forget, each bare or exact", () => {
  const NODE_ORIGIN = "http://127.0.0.1:4100";
  const APP = "https://baas.tail10f2ea.ts.net:8443";
  for (const type of ["osionos-ide/remembered", "osionos-ide/need-resume", "osionos-ide/forgotten"]) {
    assert.deepEqual(readIdeMessage({ type }, NODE_ORIGIN, NODE_ORIGIN), { type });
    assert.equal(readIdeMessage({ type, device: "D".repeat(43) }, NODE_ORIGIN, NODE_ORIGIN), null);
  }
  const assertion = "osionos_mr1.abcdefgh.payload.sig";
  assert.deepEqual(readAppMessage({ type: "osionos-ide/resume", assertion }, APP, [APP]), { type: "osionos-ide/resume", assertion });
  assert.equal(readAppMessage({ type: "osionos-ide/resume", assertion: "osionos_mc1.abcdefgh.payload.sig" }, APP, [APP]), null);
  assert.deepEqual(readAppMessage({ type: "osionos-ide/forget" }, APP, [APP]), { type: "osionos-ide/forget" });
  assert.equal(readAppMessage({ type: "osionos-ide/forget", device: "D".repeat(43) }, APP, [APP]), null);
});

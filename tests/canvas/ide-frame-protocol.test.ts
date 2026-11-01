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

import { isSafeRelativePath, readAppMessage, readIdeMessage } from "../../src/features/ide/vscode/ideFrameProtocol.ts";

const APP = "https://app.example:3001";
const IDE = "https://ide.example:4100";
const TOKEN = "osionos_ide1.eyJzdWIiOiJ4In0.c2ln";

test("the IDE page accepts a session token and an open request from the exact app origin", () => {
  assert.deepEqual(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, APP, APP), { type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(readAppMessage({ type: "osionos-ide/open", path: "src/app.py" }, APP, APP), { type: "osionos-ide/open", path: "src/app.py" });
});

test("a message from any other origin is ignored", () => {
  for (const origin of ["https://evil.example", "https://app.example:3002", "http://app.example:3001", "null", ""]) {
    assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN }, origin, APP), null, origin);
  }
});

test("nothing that runs code is accepted: terminal input, tasks, debug, extensions, settings", () => {
  for (const type of ["osionos-ide/terminal", "osionos-ide/sendText", "osionos-ide/task", "osionos-ide/debug", "osionos-ide/install", "osionos-ide/settings", "osionos-ide/command", "osionos-ide/write"]) {
    assert.equal(readAppMessage({ type, text: "rm -rf ~\n" }, APP, APP), null, type);
  }
});

test("open refuses a path into .git, a dotfile, a parent or an absolute path", () => {
  for (const path of [".git/hooks/post-checkout", "a/.git/config", ".env", "../x", "a/../../x", "/etc/passwd", "a\\b", "a//b", "", "a/./b", "a\u0000b"]) {
    assert.equal(readAppMessage({ type: "osionos-ide/open", path }, APP, APP), null, JSON.stringify(path));
    assert.equal(isSafeRelativePath(path), false, JSON.stringify(path));
  }
  assert.equal(isSafeRelativePath("notes/today.omd"), true);
});

test("a malformed token, an extra field or a non-object is refused", () => {
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: "Bearer x" }, APP, APP), null);
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: `${TOKEN}.extra` }, APP, APP), null);
  assert.equal(readAppMessage({ type: "osionos-ide/session", token: TOKEN, run: "x" }, APP, APP), null);
  assert.equal(readAppMessage("osionos-ide/session", APP, APP), null);
  assert.equal(readAppMessage(null, APP, APP), null);
});

test("the app accepts only state reports from the exact IDE origin", () => {
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/ready", node: "laptop" }, IDE, IDE), { type: "osionos-ide/ready", node: "laptop" });
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/state", state: "connected" }, IDE, IDE), { type: "osionos-ide/state", state: "connected" });
  assert.deepEqual(readIdeMessage({ type: "osionos-ide/need-session" }, IDE, IDE), { type: "osionos-ide/need-session" });
  assert.equal(readIdeMessage({ type: "osionos-ide/state", state: "pwned" }, IDE, IDE), null);
  assert.equal(readIdeMessage({ type: "osionos-ide/ready", node: "Laptop/../x" }, IDE, IDE), null);
  assert.equal(readIdeMessage({ type: "osionos-ide/ready", node: "laptop" }, APP, IDE), null);
});

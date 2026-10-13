// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-allowed-subjects.test.mjs                      :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { requireIdeSubject, requireSandboxIdentity } from "../../scripts/ide-sandbox-spec.mjs";
import { createIdeSandboxHandler } from "../../scripts/bridge-ide-sandbox.mjs";
import { createIdeOpsHandler, createIdePreviewHandler } from "../../scripts/bridge-ide-ops.mjs";
import { createIdeExecUpgradeHandler, extractWsAuth } from "../../scripts/bridge-ide-exec.mjs";
import { createRunnerHandler } from "../../scripts/bridge-runner.mjs";

const CONFIG = { allowedOrigin: "https://localhost:3001" };

// Fixed UUIDs for testing
const L = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"; // Listed subject
const U = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"; // Unlisted subject
const W = "cccccccc-3333-4333-8333-cccccccccccc"; // Workspace both sessions have

function fakeRes() {
  return {
    statusCode: 0, headers: null, body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = String(body ?? ""); },
  };
}

function mockRequest(method, { body, auth = "Bearer tok" } = {}) {
  const req = Readable.from(body != null ? [typeof body === 'string' ? body : JSON.stringify(body)] : []);
  req.method = method;
  req.headers = auth ? { authorization: auth } : {};
  return req;
}

function sessionUrl(pathname, search = "") {
  return new URL(`http://x${pathname}${search}`);
}

// No docker stub: each handler builds its client from OSIONOS_IDE_DOCKER_HOST, which is
// unreachable here, so a 403 (not a 5xx) proves the request stopped before any docker call.

test("requireIdeSubject: listed subject passes, unlisted throws 403", () => {
  const envListed = { OSIONOS_IDE_ALLOWED_SUBJECTS: L };
  const envUnlisted = { OSIONOS_IDE_ALLOWED_SUBJECTS: "other-uuid" };
  const envEmpty = { OSIONOS_IDE_ALLOWED_SUBJECTS: "" };
  const envOnlyCommas = { OSIONOS_IDE_ALLOWED_SUBJECTS: " , , " };
  const envUnset = {};

  // Listed (exact case match)
  assert.doesNotThrow(() => requireIdeSubject(L, envListed));

  // Listed (upper-case in list matches lower-case subject)
  const envUpper = { OSIONOS_IDE_ALLOWED_SUBJECTS: L.toUpperCase() };
  assert.doesNotThrow(() => requireIdeSubject(L.toLowerCase(), envUpper));

  // Unlisted throws 403
  let errUnlisted;
  try { requireIdeSubject(U, envListed); } catch (e) { errUnlisted = e; }
  assert.ok(errUnlisted, "expected requireIdeSubject to throw for unlisted subject");
  assert.match(errUnlisted.message, /The IDE is not enabled for this account/);
  assert.equal(errUnlisted.status, 403);

  // Empty list → 403
  let errEmpty;
  try { requireIdeSubject(L, envEmpty); } catch (e) { errEmpty = e; }
  assert.ok(errEmpty, "expected requireIdeSubject to throw for empty list");
  assert.match(errEmpty.message, /The IDE is not enabled for this account/);
  assert.equal(errEmpty.status, 403);

  let errCommas;
  try { requireIdeSubject(L, envOnlyCommas); } catch (e) { errCommas = e; }
  assert.ok(errCommas);
  assert.equal(errCommas.status, 403);

  let errUnset;
  try { requireIdeSubject(L, envUnset); } catch (e) { errUnset = e; }
  assert.ok(errUnset);
  assert.equal(errUnset.status, 403);

  let errOther;
  try { requireIdeSubject(L, envUnlisted); } catch (e) { errOther = e; }
  assert.ok(errOther);
  assert.equal(errOther.status, 403);
});

test("requireSandboxIdentity: subject check runs before workspace check", () => {
  const sessionListed = { userId: L, workspaceIds: [W] };
  const sessionUnlisted = { userId: U, workspaceIds: [W] };
  const envListed = { OSIONOS_IDE_ALLOWED_SUBJECTS: L };

  // Listed subject, bad workspace → workspace error (403, "No access")
  let errWorkspace;
  try { requireSandboxIdentity(sessionListed, "dddddddd-4444-4444-4444-dddddddddddd", envListed); } catch (e) { errWorkspace = e; }
  assert.ok(errWorkspace, "expected requireSandboxIdentity to throw for bad workspace");
  assert.match(errWorkspace.message, /No access/);
  assert.equal(errWorkspace.status, 403);

  // Unlisted subject, bad workspace → account error (403, "IDE is not enabled")
  let errAccount;
  try { requireSandboxIdentity(sessionUnlisted, "dddddddd-4444-4444-4444-dddddddddddd", envListed); } catch (e) { errAccount = e; }
  assert.ok(errAccount, "expected requireSandboxIdentity to throw for unlisted subject");
  assert.match(errAccount.message, /The IDE is not enabled for this account/);
  assert.equal(errAccount.status, 403);
});

test("/api/ide/session POST → 403 for unlisted subject", async () => {
  const handler = createIdeSandboxHandler({
    config: CONFIG,
    verifySession: (token) => token === "good-listed" ? { userId: L, workspaceIds: [W] } : { userId: U, workspaceIds: [W] },
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_ALLOWED_SUBJECTS: L },
  });

  const res = fakeRes();
  await handler(sessionUrl("/api/ide/session"), mockRequest("POST", { auth: "Bearer bad-unlisted", body: { workspaceId: W } }), res, CONFIG);
  assert.equal(res.statusCode, 403);
});

test("/api/ide/fs POST → 403 for unlisted subject", async () => {
  const handler = createIdeOpsHandler({
    config: CONFIG,
    verifySession: (token) => token === "good-listed" ? { userId: L, workspaceIds: [W] } : { userId: U, workspaceIds: [W] },
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_ALLOWED_SUBJECTS: L },
  });

  const res = fakeRes();
  await handler(sessionUrl("/api/ide/fs"), mockRequest("POST", { auth: "Bearer bad-unlisted", body: { workspaceId: W } }), res, CONFIG);
  assert.equal(res.statusCode, 403);
});

test("/api/ide/preview/session POST → 403 for unlisted subject", async () => {
  const handler = createIdePreviewHandler({
    config: CONFIG,
    verifySession: (token) => token === "good-listed" ? { userId: L, workspaceIds: [W] } : { userId: U, workspaceIds: [W] },
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_ALLOWED_SUBJECTS: L },
  });

  const res = fakeRes();
  await handler(sessionUrl("/api/ide/preview/session"), mockRequest("POST", { auth: "Bearer bad-unlisted", body: { workspaceId: W } }), res, CONFIG);
  assert.equal(res.statusCode, 403);
});

test("WebSocket upgrade /api/ide/pty → refused with 403 for unlisted subject", async () => {
  const handler = createIdeExecUpgradeHandler({
    config: CONFIG,
    verifySession: (token) => token === "good-listed" ? { userId: L, workspaceIds: [W] } : { userId: U, workspaceIds: [W] },
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_ALLOWED_SUBJECTS: L },
    allowOrigin: () => true,
  });

  const socket = {
    destroyed: false,
    write(chunk) { this.lastWrite = chunk; },
    destroy() { this.destroyed = true; },
    on() {},
    once() {},
  };
  const request = {
    url: "/api/ide/pty?workspaceId=" + W,
    headers: {
      origin: "https://localhost:3001",
      "sec-websocket-protocol": "osio-ide.v1, osio-token.test",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  };

  const result = handler(request, socket);
  assert.equal(result, true);
  assert.equal(socket.destroyed, true);
  assert.match(socket.lastWrite, /^HTTP\/1\.1 403 Forbidden\r\n/);
});

test("/api/ide/run POST with OSIONOS_RUNNER_URL → 403 JSON for unlisted subject", async () => {
  const handler = createRunnerHandler({
    config: CONFIG,
    verifySession: (token) => token === "good-listed" ? { userId: L, workspaceIds: [W] } : { userId: U, workspaceIds: [W] },
    env: { OSIONOS_RUNNER_URL: "http://runner:7900", OSIONOS_IDE_ALLOWED_SUBJECTS: L },
    fetchImpl: async () => { throw new Error("should not fetch"); },
  });

  const res = fakeRes();
  await handler(sessionUrl("/api/ide/run"), mockRequest("POST", { auth: "Bearer bad-unlisted" }), res, CONFIG);
  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
});

test("extractWsAuth with only ?token=abc → token === undefined", () => {
  const request = { url: "/api/ide/pty?token=abc", headers: {} };
  const result = extractWsAuth(request);
  assert.equal(result.token, undefined);
});

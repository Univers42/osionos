// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-sandbox-handler.test.mjs                       :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import { createIdeSandboxHandler } from "../../scripts/bridge-ide-sandbox.mjs";

const CONFIG = { allowedOrigin: "https://localhost:3001" };
const U = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const ENABLED = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375" };

function fakeRes() {
  return { statusCode: 0, body: null,
    writeHead(status) { this.statusCode = status; },
    end(text) { try { this.body = JSON.parse(text); } catch { this.body = text; } } };
}
const req = (method) => ({ method, headers: { authorization: "Bearer tok" } });
const sessionUrl = (ws) => new URL(`http://x/api/ide/session${ws ? `?workspaceId=${ws}` : ""}`);

test("double-gate: env unset → 404 before any auth (never leaks the route)", async () => {
  const handler = createIdeSandboxHandler({ config: CONFIG, verifySession: () => { throw new Error("should not run"); }, env: {} });
  const res = fakeRes();
  assert.equal(await handler(sessionUrl(W), req("GET"), res, CONFIG), true);
  assert.equal(res.statusCode, 404);
});

test("auth-first: a bad token → 401 before any docker call", async () => {
  const handler = createIdeSandboxHandler({
    config: CONFIG,
    verifySession: () => { throw Object.assign(new Error("bad token"), { status: 401 }); },
    env: ENABLED,
  });
  const res = fakeRes();
  await handler(sessionUrl(W), req("GET"), res, CONFIG);
  assert.equal(res.statusCode, 401);
});

test("ownership: a workspace the session does not hold → 403 (devil #11)", async () => {
  const handler = createIdeSandboxHandler({
    config: CONFIG,
    verifySession: () => ({ userId: U, workspaceIds: [W] }),
    env: ENABLED,
  });
  const res = fakeRes();
  await handler(sessionUrl("33333333-3333-4333-8333-333333333333"), req("GET"), res, CONFIG);
  assert.equal(res.statusCode, 403);
});

test("validation: a malformed workspace id → 400, never provisions", async () => {
  const handler = createIdeSandboxHandler({
    config: CONFIG,
    verifySession: () => ({ userId: U, workspaceIds: [W] }),
    env: ENABLED,
  });
  const res = fakeRes();
  await handler(sessionUrl("mini-baas-postgres"), req("GET"), res, CONFIG);
  assert.equal(res.statusCode, 400);
});

test("route scoping: a non-session path is not owned by this handler", async () => {
  const handler = createIdeSandboxHandler({ config: CONFIG, verifySession: () => ({ userId: U, workspaceIds: [W] }), env: ENABLED });
  const res = fakeRes();
  assert.equal(await handler(new URL("http://x/api/other"), req("GET"), res, CONFIG), false);
});

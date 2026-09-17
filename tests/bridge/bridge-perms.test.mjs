// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-perms.test.mjs                              :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //
// /api/perms/* used to answer anyone: measured without a credential, GET rules → 200,
// and POST/DELETE policies are proxied to the permission engine with the bridge's
// SERVICE key. Every route now needs an app session; engine-policy writes need an admin;
// share rules follow live workspace membership (requireWorkspaceAccess), not the
// workspace list frozen into the token at login.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createPermsHandler } from "../../scripts/bridge-perms.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const WS_A = "22222222-2222-4222-8222-222222222222";
const WS_B = "33333333-3333-4333-8333-333333333333";
const LATE = "44444444-4444-4444-8444-444444444444"; // joined after login: not in the token
const CONFIG = { appSessionSecret: "s" };

function setup({ isAdmin = false, access = {}, rules = [], people = "missing", secretUnset = false, upstreamDown = false, upstreamStatus = 200 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "perms-"));
  const rulesFile = join(dir, "rules.json");
  writeFileSync(rulesFile, JSON.stringify(rules));
  const peopleEnv = join(dir, "people.env");
  if (people === "dir") mkdirSync(peopleEnv);
  if (people === "file") writeFileSync(peopleEnv, `AGENCY_PERSON_1=${USER}|a@b.c|Ann|analyst|intel|secret|eu|member\n`);
  const upstream = [];
  const handler = createPermsHandler({
    verifySession: (token) => {
      if (secretUnset) throw Object.assign(new Error("osionos app session secret is not configured."), { status: 503 });
      if (token !== "good") throw Object.assign(new Error("App session token is invalid."), { status: 401 });
      return { userId: USER, workspaceIds: [WS_A], roles: {}, isAdmin };
    },
    requireWorkspaceAccess: async (request, workspaceId, permission) => {
      if (request.headers.authorization !== "Bearer good") throw Object.assign(new Error("x"), { status: 401 });
      const granted = access[workspaceId] ?? [];
      if (!granted.includes(permission)) throw Object.assign(new Error("Workspace permission denied."), { status: 403 });
      return { userId: USER, workspaceId };
    },
    fetchImpl: async (url, init) => {
      upstream.push({ url, init });
      if (upstreamDown) throw new Error("connect ECONNREFUSED 10.0.0.7:8002");
      return new Response(JSON.stringify({ ok: upstreamStatus < 400, message: "Unauthorized", request_id: "kong-1" }), { status: upstreamStatus });
    },
    settings: {
      kongUrl: "http://kong.test", serviceApikey: "svc-key", serviceToken: "svc-token", tenantId: "agency",
      peopleEnv, rulesFile, allowedOrigin: "https://localhost:3001",
    },
  });
  const call = async (method, path, { token = "good", body } = {}) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    request.method = method;
    request.headers = token ? { authorization: `Bearer ${token}` } : {};
    const res = { status: 0, body: null, writeHead(s) { this.status = s; }, end(t) { try { this.body = JSON.parse(t); } catch { this.body = t; } } };
    const handled = await handler(new URL(`http://bridge${path}`), request, res, CONFIG);
    return { handled, ...res };
  };
  const storedRules = () => JSON.parse(readFileSync(rulesFile, "utf8"));
  return { call, upstream, storedRules, rulesFile };
}

const ROUTES = [
  ["GET", "/api/perms/people"], ["GET", "/api/perms/roles"], ["GET", "/api/perms/policies"],
  ["POST", "/api/perms/policies"], ["DELETE", `/api/perms/policies/${WS_A}`], ["GET", "/api/perms/bundle"],
  ["POST", "/api/perms/decide"], ["GET", `/api/perms/rules?workspaceId=${WS_A}`], ["POST", "/api/perms/rules"],
  ["DELETE", "/api/perms/rules/r1"],
];

test("not a perms path → untouched", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/api/pages")).handled, false);
});

test("every route refuses a caller without a session, before touching anything", async () => {
  const { call, upstream, storedRules } = setup({ rules: [{ _id: "r1", workspaceId: WS_A }] });
  for (const [method, path] of ROUTES) {
    for (const token of [null, "forged"]) {
      const res = await call(method, path, { token, body: { workspaceId: WS_A } });
      assert.equal(res.status, 401, `${method} ${path} token=${token}`);
      assert.doesNotMatch(JSON.stringify(res.body), /invalid|bearer|token/i, "401 body stays generic");
    }
  }
  assert.equal(upstream.length, 0);
  assert.deepEqual(storedRules(), [{ _id: "r1", workspaceId: WS_A }]);
});

test("an unconfigured session secret is a generic 503", async () => {
  const { call, upstream } = setup({ secretUnset: true });
  const res = await call("GET", "/api/perms/roles");
  assert.equal(res.status, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /secret/i);
  assert.equal(upstream.length, 0);
});

test("engine-policy writes need an admin; the engine is never called otherwise", async () => {
  const member = setup();
  assert.equal((await member.call("POST", "/api/perms/policies", { body: { role_id: "x" } })).status, 403);
  assert.equal((await member.call("DELETE", `/api/perms/policies/${WS_A}`)).status, 403);
  assert.equal(member.upstream.length, 0);
  const admin = setup({ isAdmin: true });
  assert.equal((await admin.call("POST", "/api/perms/policies", { body: { role_id: "x" } })).status, 200);
  assert.equal(admin.upstream.length, 1);
  assert.equal(admin.upstream[0].init.headers["X-Service-Token"], "svc-token");
});

test("reads for any signed-in user are proxied", async () => {
  const { call, upstream } = setup();
  for (const path of ["/api/perms/roles", "/api/perms/policies", "/api/perms/bundle"]) {
    assert.equal((await call("GET", path)).status, 200, path);
  }
  assert.equal((await call("POST", "/api/perms/decide", { body: { action: "read" } })).status, 200);
  assert.equal(upstream.length, 4);
});

test("an unreachable engine is a 502 without the error text", async () => {
  const { call } = setup({ upstreamDown: true });
  const res = await call("GET", "/api/perms/roles");
  assert.equal(res.status, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED|10\.0\.0\.7/);
});

test("an engine that refuses the bridge's own credentials is a 503, never the caller's 401", async () => {
  for (const upstreamStatus of [401, 403]) {
    const { call } = setup({ upstreamStatus });
    const res = await call("GET", "/api/perms/roles");
    assert.equal(res.status, 503, `upstream ${upstreamStatus}`);
    assert.doesNotMatch(JSON.stringify(res.body), /request_id|kong/i);
  }
});

test("engine validation errors pass through; engine crashes are a 502", async () => {
  const invalid = setup({ isAdmin: true, upstreamStatus: 422 });
  assert.equal((await invalid.call("POST", "/api/perms/policies", { body: {} })).status, 422);
  const crashed = setup({ upstreamStatus: 500 });
  const res = await crashed.call("GET", "/api/perms/bundle");
  assert.equal(res.status, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /request_id/);
});

test("GET rules needs a workspaceId and read access to it", async () => {
  const { call } = setup({
    access: { [WS_A]: ["read"] },
    rules: [{ _id: "a", workspaceId: WS_A, resourceId: "p" }, { _id: "b", workspaceId: WS_B, resourceId: "p" }],
  });
  assert.equal((await call("GET", "/api/perms/rules")).status, 400);
  const own = await call("GET", `/api/perms/rules?workspaceId=${WS_A}`);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.rules.map((r) => r._id), ["a"]);
  assert.equal((await call("GET", `/api/perms/rules?workspaceId=${WS_B}`)).status, 403);
});

test("a read-only member cannot write share rules", async () => {
  const { call, storedRules } = setup({ access: { [WS_A]: ["read"] } });
  const res = await call("POST", "/api/perms/rules", { body: { workspaceId: WS_A, resourceId: "p", permission: "can_view" } });
  assert.equal(res.status, 403);
  assert.deepEqual(storedRules(), []);
});

test("a member added after login can write share rules", async () => {
  const { call, storedRules } = setup({ access: { [LATE]: ["read", "update"] } });
  const res = await call("POST", "/api/perms/rules", { body: { workspaceId: LATE, resourceId: "p", permission: "can_view" } });
  assert.equal(res.status, 200);
  assert.equal(storedRules().length, 1);
});

test("the server owns rule ids: a client _id is ignored, and cannot reach another workspace's rule", async () => {
  const victim = { _id: "shared-id", workspaceId: WS_B, resourceId: "p", resourceType: "page", target: { type: "workspace" } };
  const { call, storedRules } = setup({ access: { [WS_A]: ["read", "update"] }, rules: [victim] });
  const created = await call("POST", "/api/perms/rules", { body: { _id: "shared-id", workspaceId: WS_A, resourceId: "p" } });
  assert.equal(created.status, 200);
  assert.notEqual(created.body.rule._id, "shared-id");
  const del = await call("DELETE", "/api/perms/rules/shared-id");
  assert.equal(del.status, 404);
  assert.deepEqual(storedRules().find((r) => r.workspaceId === WS_B), victim);
  const own = await call("DELETE", `/api/perms/rules/${encodeURIComponent(created.body.rule._id)}`);
  assert.equal(own.status, 200);
  assert.deepEqual(storedRules(), [victim]);
});

test("replacing a rule keeps its stored id", async () => {
  const { call, storedRules } = setup({ access: { [WS_A]: ["read", "update"] } });
  const first = await call("POST", "/api/perms/rules", { body: { workspaceId: WS_A, resourceId: "p", permission: "can_view" } });
  const second = await call("POST", "/api/perms/rules", { body: { workspaceId: WS_A, resourceId: "p", permission: "can_edit" } });
  assert.equal(second.body.rule._id, first.body.rule._id);
  assert.equal(storedRules().length, 1);
  assert.equal(storedRules()[0].permission, "can_edit");
});

test("a roster path that is a directory (docker-created) means no roster", async () => {
  const { call } = setup({ people: "dir" });
  const res = await call("GET", "/api/perms/people");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.people, []);
  const withFile = setup({ people: "file" });
  assert.equal((await withFile.call("GET", "/api/perms/people")).body.people[0].email, "a@b.c");
});

test("a malformed body is a generic 400", async () => {
  const { call } = setup({ access: { [WS_A]: ["read", "update"] } });
  const res = await call("POST", "/api/perms/rules", { body: { resourceId: "p" } });
  assert.equal(res.status, 400);
});

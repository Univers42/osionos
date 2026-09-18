// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-perms-rules.test.mjs                        :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //
// Share rules used to live in /tmp inside the bridge container — gone on every recreate and
// absent from the vault's database dump. They now live in public.osionos_share_rules through
// PostgREST. These tests pin the store: what the bridge accepts, the exact queries it sends,
// and how PostgREST failures surface (a missing table is the NORMAL state on a machine
// restored from an older snapshot, so it must read as "unavailable", not as "not found").
import test from "node:test";
import assert from "node:assert/strict";
import { createShareRuleStore, normalizeShareRule, toApiRule } from "../../scripts/bridge-perms-rules.mjs";

const WS = "22222222-2222-4222-8222-222222222222";
const RULE_ID = "55555555-5555-4555-8555-555555555555";
const CONFIG = { baasUrl: "http://kong.test", serviceKey: "svc-key" };
const row = (over = {}) => ({
  id: RULE_ID, workspace_id: WS, resource_type: "page", resource_id: "p1",
  target: { type: "user", userId: "u1" }, target_key: "user:u1:", permission: "can_view", explicit: true,
  created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z", ...over,
});

function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: new URL(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = respond(calls.at(-1));
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

test("a rule is normalized: only known levels, types and target shapes; the key is server-computed", () => {
  const rule = normalizeShareRule({
    workspaceId: WS, resourceId: "p1", resourceType: "page", permission: "can_edit", explicit: true,
    target: { type: "user", userId: "u1", sneaky: "x".repeat(10_000) }, _id: "client-id", target_key: "forged",
  });
  assert.deepEqual(rule, {
    workspace_id: WS, resource_type: "page", resource_id: "p1", target: { type: "user", userId: "u1" },
    target_key: "user:u1:", permission: "can_edit", explicit: true,
  });
  assert.equal(normalizeShareRule({ workspaceId: WS, target: { type: "workspace" }, permission: "no_access" }).resource_id, "");
  for (const bad of [
    { permission: "owner" }, { resourceType: "table" }, { target: { type: "everyone" } },
    { target: { type: "user" } }, { target: { type: "role", role: "r".repeat(200) } }, { resourceId: "p".repeat(300) },
    { workspaceId: "" },
  ]) {
    assert.throws(() => normalizeShareRule({ workspaceId: WS, target: { type: "workspace" }, permission: "can_view", ...bad }),
      (error) => error.status === 400, JSON.stringify(bad).slice(0, 60));
  }
});

test("the API shape is unchanged: _id, camelCase, a workspace-wide rule has resourceId null", () => {
  assert.deepEqual(toApiRule(row({ resource_id: "" })), {
    _id: RULE_ID, workspaceId: WS, resourceId: null, resourceType: "page", target: { type: "user", userId: "u1" },
    permission: "can_view", explicit: true, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z",
  });
});

test("list filters by workspace (and resource), encodes values, orders and limits", async () => {
  const { calls, fetchImpl } = fakeFetch(() => [200, [row()]]);
  const store = createShareRuleStore({ fetchImpl });
  const rules = await store.list(CONFIG, WS, "p1&x=y");
  assert.equal(rules[0]._id, RULE_ID);
  const { url, headers } = calls[0];
  assert.equal(url.pathname, "/rest/v1/osionos_share_rules");
  assert.equal(url.searchParams.get("workspace_id"), `eq.${WS}`);
  assert.equal(url.searchParams.get("resource_id"), "eq.p1&x=y");
  assert.ok(url.searchParams.get("order"));
  assert.ok(Number(url.searchParams.get("limit")) > 0);
  assert.equal(headers.apikey, "svc-key");
});

test("upsert merges on the rule identity and never sends id or created_at", async () => {
  const { calls, fetchImpl } = fakeFetch(() => [201, [row()]]);
  const store = createShareRuleStore({ fetchImpl });
  await store.upsert(CONFIG, normalizeShareRule({ workspaceId: WS, resourceId: "p1", target: { type: "user", userId: "u1" }, permission: "can_view" }));
  const { url, method, headers, body } = calls[0];
  assert.equal(method, "POST");
  assert.equal(url.searchParams.get("on_conflict"), "workspace_id,resource_type,resource_id,target_key");
  assert.match(headers.Prefer, /resolution=merge-duplicates/);
  assert.equal("id" in body, false);
  assert.equal("created_at" in body, false);
  assert.ok(body.updated_at, "an update must refresh updated_at");
});

test("byId and remove: a non-UUID id never reaches the database; delete is scoped to the workspace", async () => {
  const { calls, fetchImpl } = fakeFetch((call) => [200, call.method === "DELETE" ? [row()] : [row()]]);
  const store = createShareRuleStore({ fetchImpl });
  assert.equal(await store.byId(CONFIG, "not-a-uuid"), null);
  assert.equal(await store.remove(CONFIG, "not-a-uuid", WS), false);
  assert.equal(calls.length, 0);
  assert.equal((await store.byId(CONFIG, RULE_ID))._id, RULE_ID);
  assert.equal(await store.remove(CONFIG, RULE_ID, WS), true);
  const del = calls.at(-1);
  assert.equal(del.method, "DELETE");
  assert.equal(del.url.searchParams.get("id"), `eq.${RULE_ID}`);
  assert.equal(del.url.searchParams.get("workspace_id"), `eq.${WS}`);
});

test("a missing table (older snapshot) is a 503 that names the migration in the log", async () => {
  const logged = [];
  const { fetchImpl } = fakeFetch(() => [404, { code: "42P01", message: 'relation "public.osionos_share_rules" does not exist' }]);
  const store = createShareRuleStore({ fetchImpl, log: (line) => logged.push(line) });
  await assert.rejects(store.list(CONFIG, WS), (error) => error.status === 503);
  assert.match(logged.join("\n"), /osionos-share-rules-migration\.sql/);
  assert.match(logged.join("\n"), /psql/);
});

test("refused credentials are a 503, anything else a 502 — never the database's message", async () => {
  for (const [status, expected] of [[401, 503], [403, 503], [409, 502], [500, 502]]) {
    const { fetchImpl } = fakeFetch(() => [status, { code: "XX", message: "internal detail" }]);
    const store = createShareRuleStore({ fetchImpl, log: () => {} });
    await assert.rejects(store.list(CONFIG, WS), (error) => error.status === expected && !/internal detail/.test(error.message), `upstream ${status}`);
  }
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sudo-required.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A 403 {code:'sudo_required'} reaches the listener with method and path and
// the response is returned untouched; a 403 with another code, or a 401, does
// not. Unsubscribing stops delivery. Composed with the revocation wrapper, a
// session_revoked 401 still reaches its own handler.

import assert from "node:assert/strict";
import test from "node:test";

import {
  bearerOf,
  revocationAwareFetch,
  SESSION_REVOKED_CODE,
} from "../../src/shared/api/sessionRevocation.ts";
import {
  onSudoRequired,
  sudoRequiredAwareFetch,
  SUDO_REQUIRED_CODE,
} from "../../src/shared/api/sudoRequired.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function run(response: Response, init: RequestInit = { method: "GET", headers: { Authorization: "Bearer osionos_v1.tok-B" } }) {
  const sudoEvents: Array<{ method: string; path: string }> = [];
  const revoked: string[] = [];
  const off = onSudoRequired((e) => sudoEvents.push(e));
  const send = sudoRequiredAwareFetch(revocationAwareFetch(async () => response, (token) => revoked.push(token)));
  return send("https://bridge/api/account/password", init).then((res) => ({ res, sudoEvents, revoked, off }));
}

test("403 sudo_required reports method and path to the listener", async () => {
  const { sudoEvents, off } = await run(json(403, { ok: false, code: "sudo_required" }));
  off();
  assert.deepEqual(sudoEvents, [{ method: "GET", path: "/api/account/password" }]);
});

test("the response is handed back readable, with the same status", async () => {
  const { res, off } = await run(json(403, { ok: false, code: "sudo_required" }));
  off();
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "sudo_required");
});

for (const [name, response, init] of [
  ["a 403 with another code", json(403, { ok: false, code: "forbidden" }), { method: "POST" }],
  ["a 403 with no body", new Response("", { status: 403 }), { method: "PUT" }],
  ["a 401 session_revoked", json(401, { ok: false, code: "session_revoked" }), { method: "PATCH" }],
  ["a 401 with another code", json(401, { code: "bad_token" }), { method: "DELETE" }],
  ["a 401 with no body", new Response("", { status: 401 }), { method: "GET" }],
  ["a 200", json(200, { code: "sudo_required" }), { method: "GET" }],
] as const) {
  test(`${name} does not trigger sudo`, async () => {
    const { sudoEvents, off } = await run(response, init);
    off();
    assert.deepEqual(sudoEvents, []);
  });
}

test("unsubscribing stops delivery", async () => {
  const events: Array<{ method: string; path: string }> = [];
  const off = onSudoRequired((e) => events.push(e));
  const send = sudoRequiredAwareFetch(async () => json(403, { code: "sudo_required" }));
  await send("https://bridge/api/x", { method: "POST" });
  off();
  await send("https://bridge/api/y", { method: "POST" });
  assert.equal(events.length, 1);
  assert.equal(events[0].path, "/api/x");
});

test("composed with revocation wrapper: session_revoked 401 still reaches its handler", async () => {
  const revoked: string[] = [];
  const send = sudoRequiredAwareFetch(revocationAwareFetch(async () => json(401, { code: SESSION_REVOKED_CODE }), (token) => revoked.push(token)));
  await send("https://bridge/api/x", { headers: { Authorization: "Bearer osionos_v1.tok-A" } });
  assert.deepEqual(revoked, ["osionos_v1.tok-A"]);
});

test("bearerOf reads the token from plain objects and Headers", () => {
  assert.equal(bearerOf({ headers: { Authorization: "Bearer abc" } }), "abc");
  assert.equal(bearerOf({ headers: new Headers({ authorization: "Bearer def" }) }), "def");
  assert.equal(bearerOf({ headers: { Authorization: "Basic abc" } }), null);
  assert.equal(bearerOf(), null);
});
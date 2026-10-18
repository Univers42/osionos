// L9: only a 401 whose body says session_revoked signs the session out; every other 401 is a plain failure.

import assert from "node:assert/strict";
import test from "node:test";

import { bearerOf, revocationAwareFetch } from "../../src/shared/api/sessionRevocation.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function run(response: Response, headers: Record<string, string> = { Authorization: "Bearer osionos_v1.tok-B" }) {
  const revoked: string[] = [];
  const send = revocationAwareFetch(async () => response, (token) => revoked.push(token));
  return send("http://bridge/api/pages/p1", { method: "PATCH", headers }).then((res) => ({ res, revoked }));
}

test("401 session_revoked reports the token that was used", async () => {
  const { revoked } = await run(json(401, { ok: false, code: "session_revoked", message: "App session was signed out." }));
  assert.deepEqual(revoked, ["osionos_v1.tok-B"]);
});

test("the response is handed back readable, with the same status", async () => {
  const { res } = await run(json(401, { ok: false, code: "session_revoked" }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "session_revoked");
});

for (const [name, response] of [
  ["a 401 with another code", json(401, { ok: false, code: "token_expired" })],
  ["a 401 with no body", new Response("", { status: 401 })],
  ["a 401 with an HTML body", new Response("<html>", { status: 401 })],
  ["a 403 carrying session_revoked", json(403, { code: "session_revoked" })],
  ["a 200", json(200, { code: "session_revoked" })],
] as const) {
  test(`${name} is not a revocation`, async () => {
    const { revoked } = await run(response);
    assert.deepEqual(revoked, []);
  });
}

test("a revoked 401 on a call that carried no token reports nothing", async () => {
  const { revoked } = await run(json(401, { code: "session_revoked" }), {});
  assert.deepEqual(revoked, []);
});

test("a throwing handler does not break the response", async () => {
  const send = revocationAwareFetch(async () => json(401, { code: "session_revoked" }), () => { throw new Error("boom"); });
  const res = await send("http://b/x", { headers: { Authorization: "Bearer t" } });
  assert.equal(res.status, 401);
});

test("bearerOf reads the token from plain objects and Headers", () => {
  assert.equal(bearerOf({ headers: { Authorization: "Bearer abc" } }), "abc");
  assert.equal(bearerOf({ headers: new Headers({ authorization: "Bearer def" }) }), "def");
  assert.equal(bearerOf({ headers: { Authorization: "Basic abc" } }), null);
  assert.equal(bearerOf(), null);
});

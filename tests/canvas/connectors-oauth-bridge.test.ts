/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-oauth-bridge.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

// @ts-expect-error — bridge module is plain JS (Node built-ins only), no types.
import { createOAuthHandler } from "../../scripts/bridge-oauth.mjs";

const config = { allowedOrigin: "*" };
const okSession = () => ({ userId: "u" });
const reqUrl = (p: string) => new URL(`http://localhost${p}`);
const b64url = (buf: Buffer) => buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const s256 = (v: string) => b64url(createHash("sha256").update(v).digest());

function fakeRes() {
  const out: { status: number; body: any } = { status: 0, body: undefined };
  const res = {
    writeHead(status: number) { out.status = status; return res; },
    end(body?: string) { out.body = body ? JSON.parse(body) : undefined; },
  };
  return { res, out };
}
function getReq() {
  return { method: "GET", headers: {} };
}
function postReq(body: unknown) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" } });
}

test("oauth bridge: authorize → exchange (PKCE ok) → validate → disconnect; token never returned", async () => {
  const handler = createOAuthHandler({ config, verifySession: okSession });
  const verifier = "verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
  const challenge = s256(verifier);

  const a = fakeRes();
  await handler(reqUrl(`/api/connector/oauth/mock/authorize?state=st&code_challenge=${challenge}`), getReq(), a.res, config);
  const code = a.out.body.code as string;
  assert.ok(code, "authorize issues a code");

  const e = fakeRes();
  await handler(reqUrl("/api/connector/oauth/exchange"), postReq({ providerKey: "mockoauth", code, codeVerifier: verifier }), e.res, config);
  assert.equal(e.out.body.ok, true);
  const ref = e.out.body.credentialRef;
  assert.ok(String(ref.handle).startsWith("oauth:mockoauth:"));
  assert.ok(!JSON.stringify(e.out.body).includes("mock-access"), "access token must not be returned to the client");
  assert.ok(!JSON.stringify(e.out.body).includes("mock-refresh"), "refresh token must not be returned to the client");

  const v = fakeRes();
  await handler(reqUrl("/api/connector/oauth/validate"), postReq({ credentialRef: ref }), v.res, config);
  assert.equal(v.out.body.ok, true);

  const d = fakeRes();
  await handler(reqUrl("/api/connector/oauth/disconnect"), postReq({ credentialRef: ref }), d.res, config);
  assert.equal(d.out.body.ok, true);

  const v2 = fakeRes();
  await handler(reqUrl("/api/connector/oauth/validate"), postReq({ credentialRef: ref }), v2.res, config);
  assert.equal(v2.out.body.ok, false, "validate fails after disconnect");
});

test("oauth bridge: wrong verifier → invalid_credential (PKCE enforced)", async () => {
  const handler = createOAuthHandler({ config, verifySession: okSession });
  const a = fakeRes();
  await handler(reqUrl(`/api/connector/oauth/mock/authorize?state=st&code_challenge=${s256("right-verifier")}`), getReq(), a.res, config);
  const e = fakeRes();
  await handler(reqUrl("/api/connector/oauth/exchange"), postReq({ providerKey: "mockoauth", code: a.out.body.code, codeVerifier: "wrong-verifier" }), e.res, config);
  assert.equal(e.out.body.ok, false);
  assert.equal(e.out.body.code, "invalid_credential");
});

test("oauth bridge: unknown/used code → invalid_credential", async () => {
  const handler = createOAuthHandler({ config, verifySession: okSession });
  const e = fakeRes();
  await handler(reqUrl("/api/connector/oauth/exchange"), postReq({ providerKey: "mockoauth", code: "nope", codeVerifier: "x" }), e.res, config);
  assert.equal(e.out.body.ok, false);
  assert.equal(e.out.body.code, "invalid_credential");
});

test("oauth bridge: bad session → 401; non-matching path → false", async () => {
  const handler = createOAuthHandler({ config, verifySession: () => { throw Object.assign(new Error("no"), { status: 401 }); } });
  const e = fakeRes();
  await handler(reqUrl("/api/connector/oauth/exchange"), postReq({ code: "c", codeVerifier: "v" }), e.res, config);
  assert.equal(e.out.status, 401);

  const ok = createOAuthHandler({ config, verifySession: okSession });
  const handled = await ok(reqUrl("/api/pages/all"), postReq({}), fakeRes().res, config);
  assert.equal(handled, false);
});

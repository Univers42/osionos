/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-bridge.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error — bridge module is plain JS (Node built-ins only), no types.
import { createConnectorHandler } from "../../scripts/bridge-connector.mjs";

const config = { allowedOrigin: "*" };
const okSession = () => ({ userId: "u" });
const reqUrl = (p: string) => new URL(`http://localhost${p}`);

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    writeHead(status: number) { out.status = status; return res; },
    end(body?: string) { out.body = body ? JSON.parse(body) : undefined; },
  };
  return { res, out };
}

const POST = { method: "POST", headers: { authorization: "Bearer t" } };

test("bridge validate: valid key + upstream ok → { ok: true }, no secret echoed", async () => {
  const handler = createConnectorHandler({ config, verifySession: okSession, env: { ANTHROPIC_API_KEY: "secret-key" }, fetchImpl: async () => ({ ok: true, status: 200 }) });
  const { res, out } = fakeRes();
  const handled = await handler(reqUrl("/api/connector/anthropic/validate"), POST, res, config);
  assert.equal(handled, true);
  assert.deepEqual(out.body, { ok: true });
  assert.ok(!JSON.stringify(out.body).includes("secret-key"));
});

test("bridge validate: missing key → invalid_credential", async () => {
  const handler = createConnectorHandler({ config, verifySession: okSession, env: {}, fetchImpl: async () => ({ ok: true }) });
  const { res, out } = fakeRes();
  await handler(reqUrl("/api/connector/anthropic/validate"), POST, res, config);
  assert.equal((out.body as { code: string }).code, "invalid_credential");
});

test("bridge validate: upstream 401 → invalid_credential (no upstream body echoed)", async () => {
  const handler = createConnectorHandler({ config, verifySession: okSession, env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: async () => ({ ok: false, status: 401, text: async () => "key sk-leak" }) });
  const { res, out } = fakeRes();
  await handler(reqUrl("/api/connector/anthropic/validate"), POST, res, config);
  assert.equal((out.body as { code: string }).code, "invalid_credential");
  assert.ok(!JSON.stringify(out.body).includes("sk-leak"));
});

test("bridge validate: unknown provider → unknown", async () => {
  const handler = createConnectorHandler({ config, verifySession: okSession, env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: async () => ({ ok: true }) });
  const { res, out } = fakeRes();
  await handler(reqUrl("/api/connector/notreal/validate"), POST, res, config);
  assert.equal((out.body as { code: string }).code, "unknown");
});

test("bridge validate: bad session → 401", async () => {
  const handler = createConnectorHandler({ config, verifySession: () => { throw Object.assign(new Error("nope"), { status: 401 }); }, env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: async () => ({ ok: true }) });
  const { res, out } = fakeRes();
  await handler(reqUrl("/api/connector/anthropic/validate"), POST, res, config);
  assert.equal(out.status, 401);
  assert.equal((out.body as { ok: boolean }).ok, false);
});

test("bridge validate: non-matching path → returns false (not handled)", async () => {
  const handler = createConnectorHandler({ config, verifySession: okSession, env: {}, fetchImpl: async () => ({ ok: true }) });
  const { res } = fakeRes();
  const handled = await handler(reqUrl("/api/pages/all"), POST, res, config);
  assert.equal(handled, false);
});

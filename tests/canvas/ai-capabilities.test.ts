// #293: a flag-gated AI route that is off answers 404, and Chrome logs every 404 as a console
// error (the beta: agents/settings, web/settings, access-tokens). The client now reads
// GET /api/ai/capabilities once per session and answers an off feature's 404 itself.

import assert from "node:assert/strict";
import test from "node:test";

import { aiCapabilityFor, capabilityGatedFetch } from "../../src/features/ai/api/aiCapabilities.ts";

const BASE = "https://ai.invalid/api/ai";

test("each flag-gated path names the switch that adds it to the service's route table", () => {
  assert.equal(aiCapabilityFor("GET", `${BASE}/access-tokens`), "accessTokens");
  assert.equal(aiCapabilityFor("DELETE", `${BASE}/access-tokens/abc`), "accessTokens");
  assert.equal(aiCapabilityFor("GET", `${BASE}/mcp-servers`), "mcpServers");
  assert.equal(aiCapabilityFor("POST", `${BASE}/mcp-servers/s1/discover`), "mcpServers");
  assert.equal(aiCapabilityFor("GET", `${BASE}/workspaces/w1/agents/settings`), "customAgents");
  assert.equal(aiCapabilityFor("GET", `${BASE}/agents/a1`), "customAgents");
  assert.equal(aiCapabilityFor("POST", `${BASE}/agents`), "customAgents");
  assert.equal(aiCapabilityFor("PUT", `${BASE}/workspaces/w1/web/settings`), "web");
  assert.equal(aiCapabilityFor("POST", `${BASE}/thread-runs`), "threadAnswers");
});

test("an ungated path has no switch: the agents list, providers, skills, usage", () => {
  assert.equal(aiCapabilityFor("GET", `${BASE}/agents`), null);
  assert.equal(aiCapabilityFor("GET", `${BASE}/providers`), null);
  assert.equal(aiCapabilityFor("GET", `${BASE}/skills?scope=user`), null);
  assert.equal(aiCapabilityFor("GET", `${BASE}/usage`), null);
});

function harness(serves: boolean | null) {
  const sent: string[] = [];
  const inner = async (input: string) => { sent.push(input); return new Response("{}", { status: 200 }); };
  const gated = capabilityGatedFetch(inner, { serves: async () => serves });
  return { sent, gated };
}

test("an off feature is answered 404 not_found locally, with the service's own body", async () => {
  const { sent, gated } = harness(false);
  const response = await gated(`${BASE}/workspaces/w1/web/settings`, { method: "GET" });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: "not_found", error: { code: "not_found" } });
  assert.deepEqual(sent, [], "nothing reached the network");
});

test("an on feature, an unknown answer (older service) or an ungated path goes through", async () => {
  for (const serves of [true, null]) {
    const { sent, gated } = harness(serves);
    assert.equal((await gated(`${BASE}/access-tokens`)).status, 200);
    assert.deepEqual(sent, [`${BASE}/access-tokens`]);
  }
  const { sent, gated } = harness(false);
  await gated(`${BASE}/providers`);
  assert.deepEqual(sent, [`${BASE}/providers`]);
});

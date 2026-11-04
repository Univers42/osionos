// #293: Chrome logs every 4xx response as a console error, so asking the bridge for a step-up
// gated action without the step-up (its 403 sudo_required) logged one in a normal flow, as when
// Terminal > New Terminal minted a machine token before the step-up. The client reads the grant
// first (GET /api/account/sudo, a 200 either way) and answers the 403 itself.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { isStepUpGated, STEP_UP_GATED, stepUpFirstFetch } from "../../src/shared/api/stepUpFirst.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function bridge(active: boolean | "down") {
  const calls: string[] = [];
  const inner = async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/account/sudo") return active === "down" ? json(503, { code: "sudo_unavailable" }) : json(200, { active });
    return json(200, { ok: true });
  };
  return { calls, send: stepUpFirstFetch(inner) };
}

const AUTH = { Authorization: "Bearer osionos_v1.tok" };

test("a gated request without a step-up never reaches the bridge and reads as sudo_required", async () => {
  const { calls, send } = bridge(false);
  const response = await send("https://bridge.test/api/machines/m-abcdefghijklmnop/token", { method: "POST", headers: AUTH, body: "{}" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "sudo_required");
  assert.deepEqual(calls, ["GET /api/account/sudo"]);
});

test("with the step-up active the request goes through, after one status read", async () => {
  const { calls, send } = bridge(true);
  const response = await send("https://bridge.test/api/account/password", { method: "POST", headers: AUTH, body: "{}" });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["GET /api/account/sudo", "POST /api/account/password"]);
});

test("an unreadable status leaves the decision to the bridge, as before", async () => {
  const { calls, send } = bridge("down");
  await send("https://bridge.test/api/account/export", { method: "POST", headers: AUTH, body: "{}" });
  assert.deepEqual(calls, ["GET /api/account/sudo", "POST /api/account/export"]);
});

test("an ungated request is sent untouched, with no status read", async () => {
  const { calls, send } = bridge(false);
  await send("https://bridge.test/api/account/export", { method: "GET", headers: AUTH });
  await send("https://bridge.test/api/machines/m-abcdefghijklmnop/identity", { method: "POST", headers: AUTH, body: "{}" });
  assert.deepEqual(calls, ["GET /api/account/export", "POST /api/machines/m-abcdefghijklmnop/identity"]);
});

test("the IDE token is gated only for a machine (scope node)", () => {
  assert.equal(isStepUpGated("POST", "/api/ide/token", JSON.stringify({ scope: "node" })), true);
  assert.equal(isStepUpGated("POST", "/api/ide/token", JSON.stringify({ workspaceId: "w" })), false);
  assert.equal(isStepUpGated("POST", "/api/ide/token", undefined), false);
});

// Caveat: a coarse cross-check. Every bridge file that calls requireSudo and names a route must
// have at least one client entry whose path prefix appears in it. A new gated route in an
// already-listed file, or behind a helper that names no route (bridge-account-email-flow.mjs), is
// not caught (it under-reports), so the table still has to follow scripts/ by hand.
test("every bridge module that requires a step-up has a client entry", () => {
  const scripts = new URL("../../scripts/", import.meta.url);
  const gatedFiles = readdirSync(scripts).filter((name) => name.endsWith(".mjs") && name !== "bridge-guard.mjs" && name !== "bridge-account-sudo.mjs")
    .filter((name) => /\brequireSudo\(/.test(readFileSync(new URL(name, scripts), "utf8")));
  assert.ok(gatedFiles.length >= 10, `only ${gatedFiles.length} gated modules found`);
  const missing = gatedFiles.filter((name) => {
    const source = readFileSync(new URL(name, scripts), "utf8").replaceAll("\\/", "/");
    return source.includes("/api/") && !STEP_UP_GATED.some((entry) => source.includes(entry.prefix));
  });
  assert.deepEqual(missing, []);
});

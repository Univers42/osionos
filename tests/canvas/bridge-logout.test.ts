// L7/L8: the logout sends the TARGET persona's token before local state is cleared, clears it
// whatever the result, and says so when the other devices were not signed out.

import assert from "node:assert/strict";
import test from "node:test";

import {
  noticeFor,
  requestBridgeLogout,
  signOutEverywhere,
  type BridgeLogoutOutcome,
  type LogoutNotice,
} from "../../src/features/auth/model/bridgeLogout.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const stub = (response: Response | Error) => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, fetchImpl };
};

test("posts to the logout route with the bearer and no body", async () => {
  const { calls, fetchImpl } = stub(new Response(null, { status: 204 }));
  const outcome = await requestBridgeLogout("http://bridge", "tok-A", fetchImpl);
  assert.deepEqual(outcome, { kind: "signed_out_everywhere" });
  assert.equal(calls[0][0], "http://bridge/api/auth/bridge/logout");
  assert.equal(calls[0][1]?.method, "POST");
  assert.equal(new Headers(calls[0][1]?.headers).get("authorization"), "Bearer tok-A");
  assert.equal(calls[0][1]?.body, undefined);
});

for (const [name, response, kind] of [
  ["401 session_revoked", json(401, { ok: false, code: "session_revoked" }), "already_revoked"],
  ["503 session_cutoffs_unavailable", json(503, { ok: false, code: "session_cutoffs_unavailable" }), "cutoffs_unavailable"],
  ["409 user_not_found", json(409, { ok: false, code: "user_not_found" }), "user_not_found"],
  ["404 (older bridge)", new Response("", { status: 404 }), "unsupported"],
  ["500", json(500, {}), "rejected"],
  ["401 with another code", json(401, { code: "bad_token" }), "rejected"],
] as const) {
  test(`${name} -> ${kind}`, async () => {
    const outcome = await requestBridgeLogout("http://bridge", "t", stub(response).fetchImpl);
    assert.equal(outcome.kind, kind);
  });
}

test("a network error is unreachable, not a throw", async () => {
  const outcome = await requestBridgeLogout("http://bridge", "t", stub(new TypeError("fetch failed")).fetchImpl);
  assert.deepEqual(outcome, { kind: "unreachable" });
});

test("a bridge that never answers is cut off by the timeout", async () => {
  const hang = (_: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  assert.deepEqual(await requestBridgeLogout("http://bridge", "t", hang, 20), { kind: "unreachable" });
});

function harness(outcome: BridgeLogoutOutcome | Error) {
  const events: string[] = [];
  const notices: LogoutNotice[] = [];
  return {
    events,
    notices,
    deps: {
      request: async (token: string) => {
        events.push(`request:${token}`);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      clearLocal: (userId: string) => { events.push(`clear:${userId}`); },
      notify: (notice: LogoutNotice) => { notices.push(notice); },
    },
  };
}
const sessions = { A: { accessToken: "tok-A" }, B: { accessToken: "tok-B" } };

test("signs out persona B with B's own token before clearing", async () => {
  const h = harness({ kind: "signed_out_everywhere" });
  await signOutEverywhere("B", sessions, h.deps);
  assert.deepEqual(h.events, ["request:tok-B", "clear:B"]);
});

test("204 tells the user it was every device", async () => {
  const h = harness({ kind: "signed_out_everywhere" });
  await signOutEverywhere("A", sessions, h.deps);
  assert.match(h.notices[0].title, /all devices/i);
});

for (const outcome of [
  { kind: "already_revoked" },
  { kind: "cutoffs_unavailable" },
  { kind: "user_not_found" },
  { kind: "unsupported" },
  { kind: "rejected", status: 500 },
  { kind: "unreachable" },
] as const) {
  test(`${outcome.kind}: local state is still cleared, and the user is told`, async () => {
    const h = harness(outcome);
    await signOutEverywhere("A", sessions, h.deps);
    assert.deepEqual(h.events, ["request:tok-A", "clear:A"]);
    assert.equal(h.notices.length, 1);
  });
}

test("a request that throws still clears local state", async () => {
  const h = harness(new Error("boom"));
  const outcome = await signOutEverywhere("A", sessions, h.deps);
  assert.deepEqual(h.events, ["request:tok-A", "clear:A"]);
  assert.equal(outcome.kind, "unreachable");
});

test("404 says this device only; failures say the other devices were not signed out", () => {
  assert.match(noticeFor({ kind: "unsupported" })?.title ?? "", /this device only/i);
  for (const kind of ["cutoffs_unavailable", "user_not_found", "unreachable"] as const) {
    assert.match(noticeFor({ kind })?.description ?? "", /this device only/i);
  }
});

test("a persona with no session sends nothing, clears, and says nothing", async () => {
  const h = harness({ kind: "signed_out_everywhere" });
  const outcome = await signOutEverywhere("ghost", sessions, h.deps);
  assert.deepEqual(h.events, ["clear:ghost"]);
  assert.equal(outcome.kind, "not_applicable");
  assert.equal(h.notices.length, 0);
});

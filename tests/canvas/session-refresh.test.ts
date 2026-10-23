/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-refresh.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-3-b: the client keeps the session alive. The pure half: when a token is due, what the
// refresh route's answers mean, the one-in-flight rule, the cross-tab lease and the 401 replay.

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

// The auth helpers read `import.meta.env`, which only Vite defines, and the seed JSON is a
// module node reads on its own (see platform-role.test.ts, which stubs both the same way).
const LOADER = `
const EMPTY_SEED = JSON.stringify({ users: [], workspaces: [] });
export async function resolve(specifier, context, nextResolve) {
	const resolved = await nextResolve(specifier, context);
	if (resolved.url.endsWith("seedUsers.json")) {
		return { url: "data:application/json," + encodeURIComponent(EMPTY_SEED), shortCircuit: true };
	}
	return resolved;
}
export async function load(url, context, nextLoad) {
	const loaded = await nextLoad(url, context);
	if (loaded.source == null) return loaded;
	if (!url.includes("userStore.helpers.ts") && !url.includes("shared/api/client.ts")) return loaded;
	const source = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
	return { ...loaded, source: "import.meta.env ??= { DEV: true };\\n" + source };
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const {
  REFRESH_SKEW_MS,
  createSingleFlight,
  needsRefresh,
  refreshBridgeSession,
  runRefresh,
} = await import("../../src/features/auth/model/sessionRefresh.ts");
const { refreshAwareFetch } = await import("../../src/shared/api/sessionRefreshAware.ts");

const NOW = Date.parse("2026-10-23T12:00:00Z");
const RT = "osb_rt.payload.sig";
const RT2 = "osb_rt.payload2.sig";

function bridgeToken(expSecondsFromNow: number, tag = "a"): string {
  const payload = { sub: "u1", tag, exp: Math.floor(NOW / 1000) + expSecondsFromNow };
  return `osionos_v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("needsRefresh: false with an hour left, true inside the skew, true when expired, false for a foreign token", () => {
  assert.equal(needsRefresh(bridgeToken(3600), NOW), false);
  assert.equal(needsRefresh(bridgeToken(REFRESH_SKEW_MS / 1000 - 1), NOW), true);
  assert.equal(needsRefresh(bridgeToken(REFRESH_SKEW_MS / 1000 + 60), NOW), false);
  assert.equal(needsRefresh(bridgeToken(-10), NOW), true);
  assert.equal(needsRefresh("gotrue.jwt.token", NOW), false);
  assert.equal(needsRefresh("", NOW), false);
  assert.equal(needsRefresh(null, NOW), false);
});

function recorder(response: Response | Error) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, fetchImpl };
}

test("refreshBridgeSession posts the token in the body only and reads the three fields", async () => {
  const fresh = bridgeToken(3600, "new");
  const { calls, fetchImpl } = recorder(json(200, { accessToken: fresh, refreshToken: RT2, expiresAt: NOW + 3_600_000 }));
  const result = await refreshBridgeSession({ apiBase: "http://bridge", refreshToken: RT, fetchImpl });
  assert.deepEqual(result, { ok: true, accessToken: fresh, refreshToken: RT2, expiresAt: NOW + 3_600_000 });
  assert.equal(calls[0].url, "http://bridge/api/auth/bridge/refresh");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { refreshToken: RT });
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), null);
});

for (const [status, code] of [
  [401, "refresh_token_invalid"],
  [401, "refresh_token_expired"],
  [401, "session_revoked"],
  [401, "refresh_token_reused"],
  [503, "session_records_off"],
  [429, "rate_limited"],
  [503, "session_record_unavailable"],
] as const) {
  test(`refreshBridgeSession maps ${status} ${code} to that code`, async () => {
    const { fetchImpl } = recorder(json(status, { ok: false, code }));
    assert.deepEqual(await refreshBridgeSession({ apiBase: "http://b", refreshToken: RT, fetchImpl }), { ok: false, code, status });
  });
}

test("refreshBridgeSession never throws: a network error is 'unreachable', garbage is a coded failure", async () => {
  const net = recorder(new TypeError("fetch failed"));
  assert.deepEqual(await refreshBridgeSession({ apiBase: "http://b", refreshToken: RT, fetchImpl: net.fetchImpl }), { ok: false, code: "unreachable", status: 0 });
  const html = recorder(new Response("<html>", { status: 502 }));
  assert.deepEqual(await refreshBridgeSession({ apiBase: "http://b", refreshToken: RT, fetchImpl: html.fetchImpl }), { ok: false, code: "http_502", status: 502 });
  const odd = recorder(json(200, { accessToken: 5, refreshToken: null }));
  const answer = await refreshBridgeSession({ apiBase: "http://b", refreshToken: RT, fetchImpl: odd.fetchImpl });
  assert.equal(answer.ok, false);
});

test("a token that is not the bridge's, or no bridge, never reaches the network", async () => {
  const { calls, fetchImpl } = recorder(json(200, {}));
  for (const refreshToken of ["", "gotrue-refresh-token", "osb_rt"]) {
    assert.deepEqual(await refreshBridgeSession({ apiBase: "http://b", refreshToken, fetchImpl }), { ok: false, code: "no_refresh_token", status: 0 });
  }
  assert.deepEqual(await refreshBridgeSession({ apiBase: "", refreshToken: RT, fetchImpl }), { ok: false, code: "no_refresh_token", status: 0 });
  assert.equal(calls.length, 0);
});

test("createSingleFlight: parallel calls with one key share one run, other keys and later calls run again", async () => {
  const flight = createSingleFlight<number>();
  let runs = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slow = async () => { runs += 1; await gate; return runs; };
  const a = flight("u1", slow);
  const b = flight("u1", slow);
  const other = flight("u2", async () => 99);
  release();
  assert.deepEqual(await Promise.all([a, b, other]), [1, 1, 99]);
  assert.equal(runs, 1);
  assert.equal(await flight("u1", async () => 7), 7);
});

// ---- the lease --------------------------------------------------------------------------

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const LEASE_KEY = "osionos:refresh-lease:u1";
const RESULT_KEY = "osionos:refresh-result:u1";
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

function tab(storage: MemoryStorage, rotate: (token: string) => Promise<unknown>) {
  const state = { accessToken: bridgeToken(60), refreshToken: RT, signedOut: "" };
  const deps = {
    userId: "u1",
    storage,
    wait: tick,
    readTokens: () => ({ accessToken: state.accessToken, refreshToken: state.refreshToken }),
    rotate: rotate as never,
    adopt: (tokens: { accessToken: string; refreshToken: string }) => Object.assign(state, tokens),
    signOut: (code: string) => { state.signedOut = code; },
  };
  return { state, deps };
}

const rotated = (calls: string[]) => async (token: string) => {
  calls.push(token);
  return { ok: true as const, accessToken: bridgeToken(3600, "n"), refreshToken: RT2, expiresAt: NOW + 3_600_000 };
};

test("the lease: a second tab that finds a published result adopts it and does not call the route", async () => {
  const storage = new MemoryStorage();
  const fresh = bridgeToken(3600, "other-tab");
  storage.setItem(RESULT_KEY, JSON.stringify({ prev: RT, accessToken: fresh, refreshToken: RT2, expiresAt: NOW + 3_600_000 }));
  const calls: string[] = [];
  const { state, deps } = tab(storage, rotated(calls));
  assert.equal(await runRefresh(deps), "adopted");
  assert.equal(calls.length, 0);
  assert.equal(state.accessToken, fresh);
  assert.equal(state.refreshToken, RT2);
});

test("the lease is held while the route is called, the result is published, the lease released", async () => {
  const storage = new MemoryStorage();
  let leaseDuringCall: string | null = null;
  const { state, deps } = tab(storage, async (token) => {
    leaseDuringCall = storage.getItem(LEASE_KEY);
    return rotated([])(token);
  });
  assert.equal(await runRefresh(deps), "refreshed");
  assert.ok(leaseDuringCall, "the lease was taken before the route call");
  assert.equal(storage.getItem(LEASE_KEY), null);
  assert.equal(JSON.parse(storage.getItem(RESULT_KEY) ?? "{}").prev, RT);
  assert.equal(state.refreshToken, RT2);
});

test("two tabs refreshing at once call the route once; the second adopts the first's result", async () => {
  const storage = new MemoryStorage();
  const calls: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slow = async (token: string) => { await gate; return rotated(calls)(token); };
  const first = tab(storage, slow);
  const second = tab(storage, slow);
  const a = runRefresh(first.deps);
  await tick();
  const b = runRefresh(second.deps);
  await tick();
  release();
  assert.deepEqual(await Promise.all([a, b]), ["refreshed", "adopted"]);
  assert.equal(calls.length, 1);
  assert.equal(second.state.refreshToken, RT2);
});

test("a lease left by a dead tab expires and is taken over", async () => {
  const storage = new MemoryStorage();
  storage.setItem(LEASE_KEY, JSON.stringify({ owner: "dead-tab", until: Date.now() - 1 }));
  const calls: string[] = [];
  assert.equal(await runRefresh(tab(storage, rotated(calls)).deps), "refreshed");
  assert.equal(calls.length, 1);
});

test("a failed-for-good refresh signs out and publishes nothing; a transient one keeps the session", async () => {
  for (const [code, outcome] of [["refresh_token_reused", "signed_out"], ["session_revoked", "signed_out"], ["refresh_token_invalid", "signed_out"], ["refresh_token_expired", "signed_out"], ["rate_limited", "kept"], ["session_record_unavailable", "kept"], ["unreachable", "kept"], ["http_502", "kept"]] as const) {
    const storage = new MemoryStorage();
    const { state, deps } = tab(storage, async () => ({ ok: false as const, code, status: 401 }));
    assert.equal(await runRefresh(deps), outcome, code);
    assert.equal(state.signedOut, outcome === "signed_out" ? code : "", code);
    assert.equal(storage.getItem(RESULT_KEY), null);
    assert.equal(storage.getItem(LEASE_KEY), null, "the lease is released on failure");
  }
});

test("without usable storage the refresh still runs (one tab)", async () => {
  const calls: string[] = [];
  const { deps } = tab(new MemoryStorage(), rotated(calls));
  assert.equal(await runRefresh({ ...deps, storage: null }), "refreshed");
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(await runRefresh({ ...deps, storage: broken }), "refreshed");
  assert.equal(calls.length, 2);
});

test("an account with no refresh token is skipped", async () => {
  const calls: string[] = [];
  const { deps } = tab(new MemoryStorage(), rotated(calls));
  assert.equal(await runRefresh({ ...deps, readTokens: () => ({ accessToken: bridgeToken(60), refreshToken: "" }) }), "skipped");
  assert.equal(calls.length, 0);
});

// ---- the 401 replay ---------------------------------------------------------------------

function bridge(handler: (token: string) => Response) {
  const seen: string[] = [];
  const inner = async (_input: string, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
    seen.push(token);
    return handler(token);
  };
  return { seen, inner };
}

const call = (send: ReturnType<typeof refreshAwareFetch>, token: string, init: RequestInit = {}) =>
  send("http://b/api/pages", { method: "PATCH", body: "{}", ...init, headers: { Authorization: `Bearer ${token}` } });

test("a 401 without session_revoked refreshes once and replays once with the new token", async () => {
  const { seen, inner } = bridge((token) => (token === "new" ? json(200, { ok: true }) : json(401, { code: "token_expired" })));
  const asked: string[] = [];
  const send = refreshAwareFetch(inner, async (token) => { asked.push(token); return "new"; });
  const res = await call(send, "old");
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ["old", "new"]);
  assert.deepEqual(asked, ["old"]);
});

test("a session_revoked 401 is not retried", async () => {
  const { seen, inner } = bridge(() => json(401, { code: "session_revoked" }));
  let asked = 0;
  const send = refreshAwareFetch(inner, async () => { asked += 1; return "new"; });
  const res = await call(send, "old");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "session_revoked");
  assert.deepEqual(seen, ["old"]);
  assert.equal(asked, 0);
});

test("a second 401 is handed back untouched and the replay happens once", async () => {
  const { seen, inner } = bridge(() => json(401, { code: "forbidden_token" }));
  const send = refreshAwareFetch(inner, async () => "new");
  const res = await call(send, "old");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "forbidden_token");
  assert.deepEqual(seen, ["old", "new"]);
});

test("no new token, a non-401, a call with no bearer or a streamed body are handed back as they are", async () => {
  const stuck = bridge(() => json(401, { code: "token_expired" }));
  assert.equal((await call(refreshAwareFetch(stuck.inner, async () => null), "old")).status, 401);
  assert.deepEqual(stuck.seen, ["old"]);
  const ok = bridge(() => json(500, {}));
  let asked = 0;
  const never = refreshAwareFetch(ok.inner, async () => { asked += 1; return "new"; });
  assert.equal((await call(never, "old")).status, 500);
  const bare = bridge(() => json(401, {}));
  const noBearer = refreshAwareFetch(bare.inner, async () => { asked += 1; return "new"; });
  assert.equal((await noBearer("http://b/x", { method: "GET" })).status, 401);
  const stream = bridge(() => json(401, {}));
  const streamed = refreshAwareFetch(stream.inner, async () => { asked += 1; return "new"; });
  const body = new ReadableStream();
  assert.equal((await call(streamed, "old", { body, duplex: "half" } as RequestInit)).status, 401);
  assert.equal(asked, 0);
});

test("two parallel 401s on one token share one refresh", async () => {
  const { seen, inner } = bridge((token) => (token === "new" ? json(200, {}) : json(401, { code: "token_expired" })));
  let refreshes = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const send = refreshAwareFetch(inner, async () => { refreshes += 1; await gate; return "new"; });
  const first = call(send, "old");
  const second = call(send, "old");
  await tick();
  release();
  assert.deepEqual((await Promise.all([first, second])).map((res) => res.status), [200, 200]);
  assert.equal(refreshes, 1);
  assert.deepEqual(seen.filter((token) => token === "new").length, 2);
});

test("a late 401 on an already-rotated token reuses the rotation instead of refreshing again", async () => {
  const { inner } = bridge((token) => (token === "new" ? json(200, {}) : json(401, { code: "token_expired" })));
  let refreshes = 0;
  const send = refreshAwareFetch(inner, async () => { refreshes += 1; return "new"; });
  await call(send, "old");
  assert.equal((await call(send, "old")).status, 200);
  assert.equal(refreshes, 1);
});

test("a failed refresh is not remembered: the next 401 asks again", async () => {
  const { inner } = bridge(() => json(401, { code: "token_expired" }));
  let refreshes = 0;
  const send = refreshAwareFetch(inner, async () => { refreshes += 1; return null; });
  await call(send, "old");
  await call(send, "old");
  assert.equal(refreshes, 2);
});

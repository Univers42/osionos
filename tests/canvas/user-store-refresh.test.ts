/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-refresh.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-3-b: the user store keeps a bridge session alive: refreshAccount, the boot refresh, the
// 60 s timer, and the rule that one account's failure never touches another's record.

import assert from "node:assert/strict";
import { register } from "node:module";
import test, { mock } from "node:test";

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
	return { ...loaded, source: "import.meta.env ??= { DEV: true, VITE_API_URL: 'http://bridge' };\\n" + source };
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});

const { useUserStore, refreshActiveIfDue, adoptStepUpToken, dropLocalSession } = await import("../../src/features/auth/model/useUserStore.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const STORAGE_KEY = "osionos:bridge-session";
const NOW = Date.now();
const RT = "osb_rt.one.sig";
const RT2 = "osb_rt.two.sig";

function token(expSecondsFromNow: number, tag: string): string {
  const payload = { sub: "u", tag, exp: Math.floor(NOW / 1000) + expSecondsFromNow };
  return `osionos_v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

const persona = (id: string) => ({ id, email: `${id}@example.test`, password: "", name: id, emoji: "x", roleBadge: "Member", persistInSessions: true });
const workspace = (id: string) => ({ _id: `ws-${id}`, name: `W ${id}`, ownerId: id, members: [], settings: {} }) as never;
const session = (id: string, expSeconds: number, refreshToken = RT) => ({
  userId: id,
  accessToken: token(expSeconds, `${id}-old`),
  refreshToken,
  privateWorkspaces: [workspace(id)],
  sharedWorkspaces: [],
});

function persisted(): Record<string, { session: { accessToken: string; refreshToken: string; privateWorkspaces: unknown[] }; expiresAt?: unknown }> {
  return JSON.parse(memory.get(STORAGE_KEY) ?? "{}");
}

type Handler = (refreshToken: string) => Response | Error;
function stubBridge(handler: Handler) {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)).refreshToken as string;
    calls.push(sent);
    const answer = handler(sent);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  return calls;
}

const ok = (tag: string, refreshToken = RT2) => new Response(JSON.stringify({ accessToken: token(3600, tag), refreshToken, expiresAt: NOW + 3_600_000 }), { status: 200 });
const refused = (status: number, code: string) => new Response(JSON.stringify({ ok: false, code }), { status });

function reset() {
  memory.clear();
  useToastStore.getState().clear();
  useUserStore.setState({ sessions: {}, personas: [], activeUserId: "", activeWorkspaceByUser: {}, initialized: false, loading: false, error: null });
}

function signIn(id: string, expSeconds = 30, refreshToken = RT) {
  useUserStore.getState().importBridgeSession(session(id, expSeconds, refreshToken) as never, persona(id) as never, new Date(NOW + 7 * 864e5).toISOString());
}

test("a successful refresh replaces the tokens and the expiry in memory and in the persisted record", async () => {
  reset();
  signIn("u1");
  const calls = stubBridge(() => ok("fresh"));
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.deepEqual(calls, [RT]);
  const live = useUserStore.getState().sessions.u1;
  assert.equal(live.refreshToken, RT2);
  assert.ok(live.accessToken.length > 0 && live.accessToken !== session("u1", 30).accessToken);
  const record = persisted().u1;
  assert.equal(record.session.accessToken, live.accessToken);
  assert.equal(record.session.refreshToken, RT2);
  assert.equal(record.session.privateWorkspaces.length, 1);
  assert.equal(record.expiresAt, new Date(NOW + 3_600_000).toISOString());
});

test("a reused refresh token signs that account out locally, notifies, and leaves the other account alone", async () => {
  reset();
  signIn("u1");
  signIn("u2", 30, "osb_rt.other.sig");
  const before = persisted().u2;
  stubBridge(() => refused(401, "refresh_token_reused"));
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "signed_out");
  assert.equal(useUserStore.getState().sessions.u1, undefined);
  assert.equal(persisted().u1, undefined);
  assert.deepEqual(persisted().u2, before);
  assert.ok(useUserStore.getState().sessions.u2);
  const toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].description ?? "", /used/i);
});

for (const code of ["refresh_token_invalid", "refresh_token_expired", "session_revoked"]) {
  test(`${code} ends the session: the record is dropped`, async () => {
    reset();
    signIn("u1");
    stubBridge(() => refused(401, code));
    assert.equal(await useUserStore.getState().refreshAccount("u1"), "signed_out");
    assert.equal(useUserStore.getState().sessions.u1, undefined);
    assert.equal(persisted().u1, undefined);
  });
}

for (const [name, answer] of [
  ["rate_limited", () => refused(429, "rate_limited")],
  ["session_record_unavailable", () => refused(503, "session_record_unavailable")],
  ["a network failure", () => new TypeError("fetch failed")],
] as const) {
  test(`${name} keeps the session and says nothing`, async () => {
    reset();
    signIn("u1");
    const before = persisted().u1;
    stubBridge(answer);
    assert.equal(await useUserStore.getState().refreshAccount("u1"), "kept");
    assert.deepEqual(persisted().u1, before);
    assert.ok(useUserStore.getState().sessions.u1);
    assert.equal(useToastStore.getState().toasts.length, 0);
  });
}

test("an unknown account, or one with no bridge refresh token, makes no call", async () => {
  reset();
  signIn("u1", 30, "gotrue-refresh");
  const calls = stubBridge(() => ok("x"));
  assert.equal(await useUserStore.getState().refreshAccount("nobody"), "skipped");
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "kept");
  assert.equal(calls.length, 0);
});

test("parallel refreshes of one account call the route once", async () => {
  reset();
  signIn("u1");
  const calls = stubBridge(() => ok("fresh"));
  const results = await Promise.all([useUserStore.getState().refreshAccount("u1"), useUserStore.getState().refreshAccount("u1")]);
  assert.deepEqual(results, ["refreshed", "refreshed"]);
  assert.equal(calls.length, 1);
});

test("boot: an expired-but-refreshable record is refreshed before it is restored; one refused for good is dropped; a transient one is kept", async () => {
  reset();
  const handoffExpiry = NOW - 1000;
  memory.set(STORAGE_KEY, JSON.stringify({
    u1: { ok: true, session: session("u1", -30, "osb_rt.good.sig"), persona: persona("u1"), expiresAt: handoffExpiry },
    u2: { ok: true, session: session("u2", -30, "osb_rt.dead.sig"), persona: persona("u2"), expiresAt: new Date(NOW + 864e5).toISOString() },
    u3: { ok: true, session: session("u3", -30, "osb_rt.flaky.sig"), persona: persona("u3"), expiresAt: new Date(NOW + 864e5).toISOString() },
  }));
  stubBridge((sent) => (sent.includes("good") ? ok("boot", "osb_rt.next.sig") : sent.includes("dead") ? refused(401, "refresh_token_invalid") : refused(503, "session_record_unavailable")));
  await useUserStore.getState().init();
  const { sessions } = useUserStore.getState();
  assert.equal(sessions.u1.refreshToken, "osb_rt.next.sig");
  assert.notEqual(sessions.u1.accessToken, session("u1", -30).accessToken);
  assert.equal(sessions.u2, undefined);
  assert.equal(persisted().u2, undefined);
  assert.equal(sessions.u3.refreshToken, "osb_rt.flaky.sig");
  assert.ok(persisted().u3);
});

test("boot: a record with no refresh token and an expired access token is still dropped", async () => {
  reset();
  memory.set(STORAGE_KEY, JSON.stringify({
    u1: { ok: true, session: session("u1", -30, ""), persona: persona("u1"), expiresAt: new Date(NOW - 1000).toISOString() },
  }));
  const calls = stubBridge(() => ok("x"));
  await useUserStore.getState().init();
  assert.equal(useUserStore.getState().sessions.u1, undefined);
  assert.equal(calls.length, 0);
});

test("the tick refreshes the active account only when its token is due", async () => {
  reset();
  signIn("u1", 3600);
  const calls = stubBridge(() => ok("fresh"));
  await refreshActiveIfDue();
  assert.equal(calls.length, 0);
  reset();
  signIn("u1", 30);
  const due = stubBridge(() => ok("fresh"));
  await refreshActiveIfDue();
  assert.equal(due.length, 1);
});

test("the 60 s timer runs while a bridge session exists and stops when none is left", async () => {
  reset();
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const calls = stubBridge(() => ok("timer"));
    signIn("u1", 30);
    mock.timers.tick(60_000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    useUserStore.setState({ sessions: {} });
    mock.timers.tick(120_000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
  } finally {
    mock.timers.reset();
  }
});

const STEP_AT = "osb_rt.stepped.sig";
const stepToken = () => token(3600, "stepped");

test("K1: a step-up writes the new pair to memory and to the saved record; without a refresh token the old one stays", () => {
  reset();
  signIn("u1");
  adoptStepUpToken("u1", stepToken(), STEP_AT);
  assert.deepEqual([useUserStore.getState().sessions.u1.refreshToken, persisted().u1.session.refreshToken], [STEP_AT, STEP_AT]);
  assert.equal(persisted().u1.session.accessToken, stepToken());
  adoptStepUpToken("u1", token(3600, "again"));
  assert.equal(useUserStore.getState().sessions.u1.refreshToken, STEP_AT);
  assert.equal(persisted().u1.session.refreshToken, STEP_AT);
});

/** Holds the rotation's answer until the step-up has landed, like a refresh racing a 2FA confirm. */
async function rotationRacedByStepUp(answer: Response) {
  reset();
  signIn("u1");
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async () => { await held; return answer; }) as typeof fetch;
  const rotation = useUserStore.getState().refreshAccount("u1");
  await new Promise((resolve) => setTimeout(resolve, 10));
  adoptStepUpToken("u1", stepToken(), STEP_AT);
  release();
  await rotation;
}

test("K2: a late rotation answer for the replaced family does not overwrite the new pair", async () => {
  await rotationRacedByStepUp(ok("late"));
  assert.equal(useUserStore.getState().sessions.u1.refreshToken, STEP_AT);
  assert.equal(persisted().u1.session.refreshToken, STEP_AT);
  assert.equal(useUserStore.getState().sessions.u1.accessToken, stepToken());
});

test("K3: a late refusal for the replaced family does not sign the device out", async () => {
  await rotationRacedByStepUp(refused(401, "session_revoked"));
  assert.ok(useUserStore.getState().sessions.u1);
  assert.equal(persisted().u1.session.refreshToken, STEP_AT);
  assert.equal(useToastStore.getState().toasts.length, 0);
});

test("dropLocalSession ends the local session without calling the server", () => {
  reset();
  signIn("u1");
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  dropLocalSession("u1");
  assert.equal(useUserStore.getState().sessions.u1, undefined);
  assert.equal(persisted().u1, undefined);
  assert.equal(called, false);
});

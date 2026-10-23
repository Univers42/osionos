/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessions-panel.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-3-c: the Sessions panel. The classifier groups a session by its user
// agent; the store reads the sessions the bridge really serves, fabricates no
// row when it cannot, and a revoke goes to the family-scoped DELETE route.
//
// The api client reads import.meta.env (Vite-only), so it is loaded with a shim
// env; the transport is a stubbed global fetch.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const { classifyClient, deviceName, groupSessions } = await import("../../src/features/settings/profile/sessionClient.ts");
const { useAccountDevicesStore } = await import("../../src/store/settings/useAccountDevicesStore.ts");

const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ELECTRON = `${CHROME} osionos/1.0 Electron/31.0.0`;
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, createdAt: "2026-10-22T10:00:00.000Z", expiresAt: "2026-10-29T10:00:00.000Z", lastSeenAt: null,
  authMethod: "password", ipPrefix: "203.0.113.0/24", userAgent: CHROME, current: false, ...over,
});
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function useSession(token = "osionos_v1.tok") {
  const revoked: string[] = [];
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => token, handleSessionRevoked: (t: string) => revoked.push(t) }),
    subscribe: () => () => undefined,
  });
  return revoked;
}

async function withFetch<T>(respond: (url: string, init?: RequestInit) => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return respond(String(input), init);
  }) as typeof fetch;
  try {
    return { value: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

function reset() {
  useAccountDevicesStore.setState({ data: [], status: "loading", error: null, userId: null });
  globalThis.localStorage?.clear?.();
}

test("classifier: Chrome -> web, Electron -> desktop, Android and iPhone -> mobile, empty -> web", () => {
  assert.equal(classifyClient(CHROME), "web");
  assert.equal(classifyClient(ELECTRON), "desktop");
  assert.equal(classifyClient(ANDROID), "mobile");
  assert.equal(classifyClient(IPHONE), "mobile");
  assert.equal(classifyClient(""), "web");
  assert.equal(classifyClient(null), "web");
});

test("grouping: web, desktop, mobile in that order; empty groups are left out", () => {
  const groups = groupSessions([row("m", { userAgent: ANDROID }), row("w"), row("w2")]);
  assert.deepEqual(groups.map((group) => [group.kind, group.rows.map((r) => r.id)]), [["web", ["w", "w2"]], ["mobile", ["m"]]]);
  assert.deepEqual(groupSessions([]), []);
});

test("deviceName reads the user agent and never invents one", () => {
  assert.equal(deviceName(CHROME), "Chrome on Linux");
  assert.equal(deviceName(null), "Unknown device");
});

test("hydrate reads /api/account/sessions (not /devices) and keeps the server's rows", async () => {
  reset();
  useSession();
  const rows = [row("a", { current: true }), row("b")];
  const { calls } = await withFetch(() => json(200, { sessions: rows }), () => useAccountDevicesStore.getState().hydrate("u1"));
  assert.deepEqual(calls.map((c) => c.url), ["https://bridge.test/api/account/sessions"]);
  const state = useAccountDevicesStore.getState();
  assert.equal(state.status, "ready");
  assert.deepEqual(state.data, rows);
});

test("a 503 session_records_off is unavailable and fabricates no row", async () => {
  reset();
  useSession();
  await withFetch(() => json(503, { ok: false, code: "session_records_off", message: "off" }), () => useAccountDevicesStore.getState().hydrate("u1"));
  const state = useAccountDevicesStore.getState();
  assert.equal(state.status, "unavailable");
  assert.deepEqual(state.data, []);
});

test("a failed load is an error, with no fabricated row", async () => {
  reset();
  useSession();
  await withFetch(() => json(500, { ok: false, message: "boom" }), () => useAccountDevicesStore.getState().hydrate("u1"));
  const state = useAccountDevicesStore.getState();
  assert.equal(state.status, "error");
  assert.match(state.error ?? "", /boom/);
  assert.deepEqual(state.data, []);
});

test("an empty answer is ready with no rows", async () => {
  reset();
  useSession();
  await withFetch(() => json(200, { sessions: [] }), () => useAccountDevicesStore.getState().hydrate("u1"));
  assert.equal(useAccountDevicesStore.getState().status, "ready");
  assert.deepEqual(useAccountDevicesStore.getState().data, []);
});

test("revoke calls DELETE /api/account/sessions/<id> and drops the row on 204", async () => {
  reset();
  const revoked = useSession();
  useAccountDevicesStore.setState({ data: [row("a", { current: true }), row("b")], status: "ready", userId: "u1" });
  const { calls } = await withFetch(() => json(204), () => useAccountDevicesStore.getState().revoke("b"));
  assert.deepEqual(calls, [{ url: "https://bridge.test/api/account/sessions/b", method: "DELETE" }]);
  assert.deepEqual(useAccountDevicesStore.getState().data.map((r) => r.id), ["a"]);
  assert.deepEqual(revoked, []);
});

test("a failed revoke restores the row", async () => {
  reset();
  useSession();
  useAccountDevicesStore.setState({ data: [row("a", { current: true }), row("b")], status: "ready", userId: "u1" });
  await withFetch(() => json(500, { ok: false, message: "boom" }), () => useAccountDevicesStore.getState().revoke("b"));
  assert.deepEqual(useAccountDevicesStore.getState().data.map((r) => r.id), ["a", "b"]);
  assert.match(useAccountDevicesStore.getState().error ?? "", /boom/);
});

test("revoking the current session signs this account out locally", async () => {
  reset();
  const revoked = useSession("osionos_v1.mine");
  useAccountDevicesStore.setState({ data: [row("a", { current: true }), row("b")], status: "ready", userId: "u1" });
  await withFetch(() => json(204), () => useAccountDevicesStore.getState().revoke("a"));
  assert.deepEqual(revoked, ["osionos_v1.mine"]);
});

test("a failed revoke of the current session does not sign out", async () => {
  reset();
  const revoked = useSession();
  useAccountDevicesStore.setState({ data: [row("a", { current: true })], status: "ready", userId: "u1" });
  await withFetch(() => json(500, { ok: false, message: "boom" }), () => useAccountDevicesStore.getState().revoke("a"));
  assert.deepEqual(revoked, []);
});

test("nothing is written to localStorage", async () => {
  reset();
  const writes: string[] = [];
  const store = new Map<string, string>();
  Reflect.set(globalThis, "localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); store.set(k, v); },
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
  useSession();
  await withFetch(() => json(200, { sessions: [row("a")] }), () => useAccountDevicesStore.getState().hydrate("u1"));
  assert.deepEqual(writes.filter((key) => key.includes("device") || key.includes("session")), []);
});

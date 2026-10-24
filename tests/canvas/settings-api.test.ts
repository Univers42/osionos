/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-api.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-5: the settings calls reach the bridge with the app-session token and
// report only what the server did. runAccountAction returns an outcome for
// every response; the settings-sync classification returns null for a route the
// server does not serve and throws for a real failure.
//
// The api client reads import.meta.env (Vite-only), so the module is loaded
// with a shim env; the rest of the client (http-gate, the token seam, the
// fetch) is the real one, and the transport is a stubbed global fetch.

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

const { classifySettingsError, isSettingsEndpointUnavailable, trySettingsGet } = await import("../../src/store/settings/settingsStoreUtils.ts");
const { runAccountAction, accountActionNotice } = await import("../../src/features/settings/model/settingsCalls.ts");
const { ApiError } = await import("@/shared/api/client.ts");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * A bridge-shaped session: the app-session token is what the bridge verifies.
 * `pageJwt` null means the session has no app-session token; `gotrueJwt` null
 * means the session is signed out entirely.
 */
function useSession(pageJwt: string | null, gotrueJwt: string | null = "gotrue.jwt") {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({
      activeJwt: () => gotrueJwt,
      activePageJwt: () => pageJwt,
      handleSessionRevoked: () => undefined,
    }),
    subscribe: () => () => undefined,
  });
}

/** Replaces the global fetch for one test; the api client resolves it per call. */
async function withFetch<T>(response: Response | Error, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: Array<[string, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    if (response instanceof Error) throw response;
    return response.clone();
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
    Reflect.set(globalThis, "__fetchCalls", calls);
  }
}

// --- the pure classification -------------------------------------------------

test("classifySettingsError: 404 -> unavailable", () => {
  assert.equal(classifySettingsError(404), "unavailable");
});

test("classifySettingsError: 404 by code (missing and API_ERROR are a missing route; any other code is an answer)", () => {
  assert.equal(classifySettingsError(404, "API_ERROR"), "unavailable");
  assert.equal(classifySettingsError(404, null), "unavailable");
  assert.equal(classifySettingsError(404, "team_not_found"), "failed");
  assert.equal(classifySettingsError(404, "workspace_not_found"), "failed");
});

test("classifySettingsError: 501 -> unavailable", () => {
  assert.equal(classifySettingsError(501), "unavailable");
});

test("classifySettingsError: 503 with _unavailable -> unavailable", () => {
  assert.equal(classifySettingsError(503, "feature_unavailable"), "unavailable");
});

test("classifySettingsError: 503 with _off -> unavailable", () => {
  assert.equal(classifySettingsError(503, "feature_off"), "unavailable");
});

test("classifySettingsError: 503 other -> failed", () => {
  assert.equal(classifySettingsError(503, "other_code"), "failed");
});

test("classifySettingsError: 403 sudo_required -> sudo_required", () => {
  assert.equal(classifySettingsError(403, "sudo_required"), "sudo_required");
});

test("classifySettingsError: 403 other -> failed", () => {
  assert.equal(classifySettingsError(403, "forbidden"), "failed");
});

test("classifySettingsError: 500 -> failed", () => {
  assert.equal(classifySettingsError(500), "failed");
});

test("classifySettingsError: 401 -> failed", () => {
  assert.equal(classifySettingsError(401), "failed");
});

test("classifySettingsError: 200 -> failed (a success is not a failure)", () => {
  assert.equal(classifySettingsError(200), "failed");
});

test("isSettingsEndpointUnavailable: true for 404", () => {
  assert.equal(isSettingsEndpointUnavailable(new ApiError("Not found", 404)), true);
});

test("isSettingsEndpointUnavailable: false for a 404 with a server code", () => {
  assert.equal(isSettingsEndpointUnavailable(new ApiError("Team not found", 404, "team_not_found")), false);
});

test("isSettingsEndpointUnavailable: true for 501", () => {
  assert.equal(isSettingsEndpointUnavailable(new ApiError("Not implemented", 501, "NOT_IMPLEMENTED")), true);
});

test("isSettingsEndpointUnavailable: true for 503 _unavailable", () => {
  assert.equal(isSettingsEndpointUnavailable(new ApiError("Unavailable", 503, "feature_unavailable")), true);
});

test("isSettingsEndpointUnavailable: false for 500", () => {
  assert.equal(isSettingsEndpointUnavailable(new ApiError("Server error", 500, "SERVER_ERROR")), false);
});

test("isSettingsEndpointUnavailable: false for a plain error", () => {
  assert.equal(isSettingsEndpointUnavailable(new Error("network")), false);
});

// --- runAccountAction --------------------------------------------------------

test("runAccountAction: 200 -> ok with the server's data", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(200, { ok: true }), () => runAccountAction<{ ok: boolean }>("/api/account/2fa/verify", {}));
  assert.deepEqual(outcome, { ok: true, data: { ok: true } });
});

test("runAccountAction: 204 -> ok with no data", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(new Response(null, { status: 204 }), () => runAccountAction("/api/account/2fa/disable", {}));
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome, { ok: true, data: undefined });
});

test("runAccountAction: 404 -> unavailable (the route is not served here)", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(404, { ok: false, message: "Not found" }), () => runAccountAction("/api/account/request-deletion", {}));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "unavailable");
});

test("runAccountAction: 501 -> unavailable", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(501, { ok: false }), () => runAccountAction("/api/account/2fa/enroll", {}));
  assert.equal(outcome.ok === false && outcome.reason, "unavailable");
});

test("runAccountAction: 503 with an unavailable code -> unavailable", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(503, { ok: false, code: "feature_unavailable" }), () => runAccountAction("/api/account/2fa/enroll", {}));
  assert.equal(outcome.ok === false && outcome.reason, "unavailable");
});

test("runAccountAction: 503 with another code -> failed", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(503, { ok: false, code: "upstream_busy" }), () => runAccountAction("/api/account/2fa/enroll", {}));
  assert.equal(outcome.ok === false && outcome.reason, "failed");
});

test("runAccountAction: 403 sudo_required -> sudo_required (the fetch path raises the prompt)", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(403, { ok: false, code: "sudo_required" }), () => runAccountAction("/api/account/request-deletion", {}));
  assert.equal(outcome.ok === false && outcome.reason, "sudo_required");
});

test("runAccountAction: 500 -> failed with the server's message", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(json(500, { ok: false, message: "boom" }), () => runAccountAction("/api/account/request-deletion", {}));
  assert.equal(outcome.ok === false && outcome.reason, "failed");
  assert.match(outcome.ok === false ? outcome.message : "", /boom/);
});

test("runAccountAction: a network TypeError -> failed, never a success", async () => {
  useSession("osionos_v1.tok");
  const outcome = await withFetch(new TypeError("fetch failed"), () => runAccountAction("/api/account/request-deletion", {}));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "failed");
});

test("runAccountAction: offline (no session) -> unavailable, no request goes out", async () => {
  useSession(null, null);
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return json(200, {});
  }) as typeof fetch;
  try {
    const outcome = await runAccountAction("/api/account/request-deletion", {});
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "unavailable");
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});

test("runAccountAction: sends the app-session token, not the gotrue one", async () => {
  useSession("osionos_v1.page-token");
  const calls: Array<[string, RequestInit | undefined]> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return json(200, { ok: true });
  }) as typeof fetch;
  try {
    await runAccountAction("/api/account/2fa/verify", { code: "123456" });
  } finally {
    globalThis.fetch = original;
  }
  const headers = new Headers(calls[0][1]?.headers);
  assert.equal(headers.get("authorization"), "Bearer osionos_v1.page-token");
});

test("runAccountAction: a gotrue-only session still reaches the bridge (the page jwt falls back)", async () => {
  useSession(null);
  const calls: Array<[string, RequestInit | undefined]> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return json(200, { ok: true });
  }) as typeof fetch;
  try {
    const outcome = await runAccountAction("/api/account/2fa/verify", { code: "123456" });
    assert.equal(outcome.ok, true);
  } finally {
    globalThis.fetch = original;
  }
  const headers = new Headers(calls[0][1]?.headers);
  assert.equal(headers.get("authorization"), "Bearer gotrue.jwt");
});

// --- the settings-sync classification ---------------------------------------

test("trySettingsGet: 404 -> null (the route is not served here; the store stays local)", async () => {
  useSession("osionos_v1.tok");
  const value = await withFetch(json(404, { ok: false, message: "Not found" }), () => trySettingsGet("/api/account/devices"));
  assert.equal(value, null);
});

test("trySettingsGet: 500 -> throws (a real failure still surfaces)", async () => {
  useSession("osionos_v1.tok");
  await assert.rejects(
    withFetch(json(500, { ok: false, message: "boom" }), () => trySettingsGet("/api/account/devices")),
    /boom/,
  );
});

test("trySettingsGet: 200 -> the server's data", async () => {
  useSession("osionos_v1.tok");
  const value = await withFetch(json(200, [{ _id: "d1" }]), () => trySettingsGet("/api/account/devices"));
  assert.deepEqual(value, [{ _id: "d1" }]);
});

// --- the notice ---------------------------------------------------------------

test("accountActionNotice: unavailable -> an honest info toast naming the action", () => {
  const notice = accountActionNotice({ ok: false, reason: "unavailable", message: "x" }, "Account deletion");
  assert.deepEqual(notice, { kind: "info", title: "Account deletion isn't available on this server yet" });
});

test("accountActionNotice: failed -> an error toast carrying the message", () => {
  const notice = accountActionNotice({ ok: false, reason: "failed", message: "boom" }, "Password change");
  assert.deepEqual(notice, { kind: "error", title: "Password change failed", description: "boom" });
});

test("accountActionNotice: sudo_required -> null (the fetch path raises the prompt)", () => {
  assert.equal(accountActionNotice({ ok: false, reason: "sudo_required", message: "x" }, "Anything"), null);
});

test("accountActionNotice: a success -> null", () => {
  assert.equal(accountActionNotice({ ok: true, data: {} }, "Anything"), null);
});

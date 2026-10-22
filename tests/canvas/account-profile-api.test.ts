/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-profile-api.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P2-4-d2: the one client for `/api/account/profile`.
 *
 * The shared `api` client can neither send an `If-Match` header nor hand back the 412
 * body's `version` and `profile`, so this module calls `fetch` itself. What matters here
 * is the outcome it reports: a write that carries the ETag, a conflict that carries the
 * server's row, an invalid value that carries the field, and an account plane that is
 * simply not there.
 *
 * The api client reads import.meta.env (Vite-only), so the module is loaded with a shim
 * env; the transport is a stubbed global fetch.
 */

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

const { fetchAccountProfile, saveAccountProfile } = await import("../../src/shared/api/accountProfileApi.ts");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PROFILE_ROW = {
  userId: "user-a", displayName: "Ada Lovelace", username: "ada", pronouns: "she/her",
  headline: "Mathematician", bio: "The first programmer.", location: "London",
  company: "Analytical Engines", website: "https://example.com/ada",
  links: ["https://example.com/ada/papers"], timezone: "Europe/London",
  orcid: "0000-0002-1825-0097", patreon: "ada",
  avatarUrl: null, bannerUrl: null, directoryOptOut: false,
  profession: "developer", version: 7,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};

/** A bridge-shaped session: the app-session token is what the bridge verifies. */
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

interface Call { url: string; init: RequestInit | undefined }

/** Replaces the global fetch; the answer is a function of the call. */
async function withFetch<T>(answer: (call: Call) => Response | Error, run: () => Promise<T>): Promise<{ result: T; calls: Call[] }> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const response = answer(call);
    if (response instanceof Error) throw response;
    return response.clone();
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

// --- the read -----------------------------------------------------------------

test("fetchAccountProfile: 200 -> the row and its version", async () => {
  useSession("osionos_v1.tok");
  const { result, calls } = await withFetch(() => json(200, PROFILE_ROW), () => fetchAccountProfile());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.version, 7);
  assert.equal(result.ok && result.profile.profession, "developer");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://bridge.test/api/account/profile");
  assert.equal(calls[0].init?.method, "GET");
});

test("fetchAccountProfile: it sends the app-session token", async () => {
  useSession("osionos_v1.page-token");
  const { calls } = await withFetch(() => json(200, PROFILE_ROW), () => fetchAccountProfile());
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer osionos_v1.page-token");
});

test("fetchAccountProfile: no session -> unavailable, and no request goes out", async () => {
  useSession(null, null);
  const { result, calls } = await withFetch(() => json(200, PROFILE_ROW), () => fetchAccountProfile());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "unavailable");
  assert.equal(calls.length, 0);
});

// --- the write ----------------------------------------------------------------

test("saveAccountProfile: it sends the If-Match header with the version it was given", async () => {
  useSession("osionos_v1.tok");
  const { result, calls } = await withFetch(() => json(200, { ...PROFILE_ROW, version: 8 }), () => saveAccountProfile({ profession: "teacher" }, 7));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.version, 8);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("if-match"), '"7"');
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { profession: "teacher" });
});

test("saveAccountProfile: a 412 -> a conflict carrying the server's row and version", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(
    () => json(412, { ok: false, code: "version_mismatch", message: "The profile changed since you loaded it.", version: 9, profile: { ...PROFILE_ROW, version: 9, profession: "designer" } }),
    () => saveAccountProfile({ profession: "teacher" }, 7),
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "conflict");
  assert.equal(result.ok === false && result.reason === "conflict" && result.version, 9);
  assert.equal(result.ok === false && result.reason === "conflict" && result.profile?.profession, "designer");
});

test("saveAccountProfile: a 422 -> an invalid carrying the field it names", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(
    () => json(422, { ok: false, code: "invalid_field", message: 'The field "profession" is not valid.', field: "profession" }),
    () => saveAccountProfile({ profession: "wizard" }, 7),
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "invalid");
  assert.equal(result.ok === false && result.reason === "invalid" && result.field, "profession");
});

test("saveAccountProfile: a 404 -> unavailable", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(() => json(404, { ok: false, code: "user_not_found" }), () => saveAccountProfile({ profession: "teacher" }, 7));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "unavailable");
});

test("saveAccountProfile: a 503 account_plane_unavailable -> unavailable", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(() => json(503, { ok: false, code: "account_plane_unavailable" }), () => saveAccountProfile({ profession: "teacher" }, 7));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "unavailable");
});

test("saveAccountProfile: a 500 -> failed with the server's message", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(() => json(500, { ok: false, message: "boom" }), () => saveAccountProfile({ profession: "teacher" }, 7));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "failed");
  assert.match(result.ok === false && result.reason === "failed" ? result.message : "", /boom/);
});

test("saveAccountProfile: a network error -> failed, never a success", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(() => new TypeError("fetch failed"), () => saveAccountProfile({ profession: "teacher" }, 7));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "failed");
});

test("saveAccountProfile: without a version there is no ETag to write against -> unavailable", async () => {
  useSession("osionos_v1.tok");
  const { result, calls } = await withFetch(() => json(200, PROFILE_ROW), () => saveAccountProfile({ profession: "teacher" }, Number.NaN));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "unavailable");
  assert.equal(calls.length, 0);
});

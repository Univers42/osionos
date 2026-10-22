/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profession-store.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P2-4-d2: the profession pick.
 *
 * The pick is written through the account profile route, so it carries the profile's
 * ETag. A profile that moved answers a conflict, and the store retries once with the
 * version the server handed back. Everything else keeps the value the user had, and
 * says so with one toast.
 *
 * The store holds no version of its own: the account profile store is the one holder,
 * so a pick and a profile form never carry two ETags for one row.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const TOAST_STUB = `export const useToastStore = { getState: () => ({ push(toast) { globalThis.__toasts.push(toast); } }) };`;

/** The localStorage the persisted store writes to. */
function shimLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  return store;
}

shimLocalStorage();
Reflect.set(globalThis, "__toasts", [] as unknown[]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(TOAST_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(TOAST_STUB)}`, shortCircuit: true };
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

const { useProfessionStore } = await import("@/features/professions/model/useProfessionStore");
const { useAccountProfileStore } = await import("@/store/settings/useAccountProfileStore");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PROFILE_ROW = {
  userId: "user-a", displayName: "Ada Lovelace", username: "ada", pronouns: "she/her",
  headline: "Mathematician", bio: null, location: null, company: null, website: null,
  links: [], timezone: null, orcid: null, patreon: null,
  avatarUrl: null, bannerUrl: null, directoryOptOut: false,
  profession: "designer", version: 7,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};

interface Call { url: string; init: RequestInit | undefined }

/** The bridge: a GET answers the row, every PATCH is answered by the caller. */
async function withBridge<T>(answer: (call: Call, index: number) => Response | Error, run: () => Promise<T>): Promise<{ result: T; calls: Call[] }> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const response = answer(call, calls.length - 1);
    if (response instanceof Error) throw response;
    return response.clone();
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

/** A session, a clean account store, a clean profession store and an empty toast log. */
function reset(profession: "student" | "developer" | "designer" | "data-analyst" | "researcher" | "creator" | "founder" | "teacher" | null) {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({
      activeJwt: () => "gotrue.jwt",
      activePageJwt: () => "osionos_v1.tok",
      handleSessionRevoked: () => undefined,
    }),
    subscribe: () => () => undefined,
  });
  Reflect.set(globalThis, "__toasts", []);
  useAccountProfileStore.setState({ status: "idle", profile: null, version: null, error: null });
  useProfessionStore.setState({ profession, open: false, busy: false, error: null });
}

const patches = (calls: Call[]) => calls.filter((call) => call.init?.method === "PATCH");
const toasts = () => (globalThis as unknown as { __toasts: unknown[] }).__toasts;

test("a pick that always conflicts sends exactly two PATCHes and keeps the previous value", async () => {
  reset("designer");
  const { calls } = await withBridge(
    (call) => (call.init?.method === "PATCH"
      ? json(412, { ok: false, code: "version_mismatch", version: 8, profile: { ...PROFILE_ROW, version: 8 } })
      : json(200, PROFILE_ROW)),
    () => useProfessionStore.getState().pick("teacher"),
  );
  assert.equal(patches(calls).length, 2, "one write and one retry, never more");
  assert.equal(useProfessionStore.getState().profession, "designer");
  assert.equal(toasts().length, 1, "one error toast, not one per attempt");
  assert.equal((toasts()[0] as { kind: string }).kind, "error");
});

test("a conflict then a success ends with the server's value", async () => {
  reset("designer");
  const { calls } = await withBridge(
    (call, index) => {
      if (call.init?.method !== "PATCH") return json(200, PROFILE_ROW);
      if (index === 1) return json(412, { ok: false, code: "version_mismatch", version: 8, profile: { ...PROFILE_ROW, version: 8 } });
      return json(200, { ...PROFILE_ROW, profession: "teacher", version: 9 });
    },
    () => useProfessionStore.getState().pick("teacher"),
  );
  assert.equal(patches(calls).length, 2);
  assert.equal(useProfessionStore.getState().profession, "teacher");
  assert.equal(toasts().length, 0);
  const headers = new Headers(patches(calls)[1].init?.headers);
  assert.equal(headers.get("if-match"), '"8"', "the retry carries the version the server sent");
});

test("the persisted payload holds the profession and no version", async () => {
  reset(null);
  await withBridge(
    (call) => (call.init?.method === "PATCH" ? json(200, { ...PROFILE_ROW, profession: "teacher", version: 8 }) : json(200, PROFILE_ROW)),
    () => useProfessionStore.getState().pick("teacher"),
  );
  const raw = globalThis.localStorage.getItem("osionos:profession");
  assert.ok(raw, "the store persists the profession");
  const payload = JSON.parse(raw) as { state: Record<string, unknown> };
  assert.equal(payload.state.profession, "teacher");
  assert.equal(payload.state.version, undefined);
  assert.equal("version" in useProfessionStore.getState(), false, "the profession store holds no version");
});

test("a failed pick leaves the profession unchanged and says so once", async () => {
  reset("designer");
  const { calls } = await withBridge(
    (call) => (call.init?.method === "PATCH" ? json(500, { ok: false, message: "boom" }) : json(200, PROFILE_ROW)),
    () => useProfessionStore.getState().pick("teacher"),
  );
  assert.equal(useProfessionStore.getState().profession, "designer");
  assert.equal(toasts().length, 1);
  assert.equal(patches(calls).length, 1, "a failure is not a conflict: it is not retried");
});

test("a pick the server refuses names the field it refused", async () => {
  reset("designer");
  await withBridge(
    (call) => (call.init?.method === "PATCH"
      ? json(422, { ok: false, code: "invalid_field", field: "profession" })
      : json(200, PROFILE_ROW)),
    () => useProfessionStore.getState().pick("teacher"),
  );
  assert.equal(useProfessionStore.getState().profession, "designer");
  assert.equal(toasts().length, 1);
});

test("a pick on a server that does not serve the route stays local and says nothing", async () => {
  reset("designer");
  await withBridge(
    (call) => (call.init?.method === "PATCH" ? json(404, { ok: false, code: "user_not_found" }) : json(404, { ok: false, code: "user_not_found" })),
    () => useProfessionStore.getState().pick("teacher"),
  );
  assert.equal(useProfessionStore.getState().profession, "teacher", "the offline build keeps the pick");
  assert.equal(toasts().length, 0, "an offline server is not an error");
});

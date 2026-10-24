/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-account-stores.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3: the account settings and emails stores report only what the server stated, never
// fake an edit, and never show one user's data to the next. The transport is a stubbed
// fetch; the api client and the stores are the real ones.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
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

const storage = new Map<string, string>();
// zustand's persist reads `window.localStorage`.
Reflect.set(globalThis, "window", globalThis);
// Node defines its own `localStorage` accessor, which Reflect.set cannot replace.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  },
});
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "app.jwt", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});

const { classifySettingsError } = await import("../../src/store/settings/settingsStoreUtils.ts");
const { defaultEmail, emailVerificationLabel, primaryEmailId } = await import("../../src/store/settings/defaults.ts");
const { useAccountSettingsStore } = await import("../../src/store/settings/useAccountSettingsStore.ts");
const { useAccountEmailsStore } = await import("../../src/store/settings/useAccountEmailsStore.ts");
const { resetAccountStores } = await import("../../src/store/settings/accountStoresIsolation.ts");

const SETTINGS_KEY = "osionos:settings:account";
const EMAILS_KEY = "osionos:settings:account-emails";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Sent { url: string; method: string; body: unknown }
let sent: Sent[] = [];

/** Answers every call with `respond(url, method)` and records what was sent. */
function stubFetch(respond: (url: string, method: string) => Response) {
  sent = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    sent.push({ url: input, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return respond(input, method);
  }) as typeof fetch;
}

const settledWrites = () => new Promise((resolve) => setTimeout(resolve, 600));
const baseSettings = (userId: string) => ({ userId, security: { passkeysEnabled: true, preferredMfaMethod: "totp" as const } });

beforeEach(() => {
  storage.clear();
  useAccountSettingsStore.setState({ data: null, loading: false, error: null });
  useAccountEmailsStore.setState({ data: [], loading: false, error: null });
});

test("C1 update() with no preferredMfaMethod makes no request", async () => {
  stubFetch(() => json(200, {}));
  useAccountSettingsStore.setState({ data: baseSettings("u-a") });
  useAccountSettingsStore.getState().update({ security: { hasPassword: true } });
  await settledWrites();
  assert.equal(sent.length, 0);
  assert.equal(useAccountSettingsStore.getState().data?.security.hasPassword, true);
});

test("C2 update() sends exactly the preferred method, not the whole security object", async () => {
  stubFetch(() => json(200, { ...baseSettings("u-a"), security: { passkeysEnabled: true, preferredMfaMethod: "recovery" } }));
  useAccountSettingsStore.setState({ data: baseSettings("u-a") });
  useAccountSettingsStore.getState().update({ security: { ...baseSettings("u-a").security, hasPassword: true, preferredMfaMethod: "recovery" } });
  await settledWrites();
  assert.deepEqual(sent.map((call) => [call.method, call.body]), [["PATCH", { security: { preferredMfaMethod: "recovery" } }]]);
});

test("C3 a 422 rolls the local value back and sets the error", async () => {
  stubFetch(() => json(422, { ok: false, code: "invalid_body", message: "nope" }));
  useAccountSettingsStore.setState({ data: baseSettings("u-a") });
  useAccountSettingsStore.getState().update({ security: { preferredMfaMethod: "recovery" } });
  await settledWrites();
  assert.equal(useAccountSettingsStore.getState().data?.security.preferredMfaMethod, "totp");
  assert.ok(useAccountSettingsStore.getState().error);
});

test("C4 the emails store has no make-primary, and a failed read never claims verification", async () => {
  const state = useAccountEmailsStore.getState() as unknown as Record<string, unknown>;
  assert.equal(state.makePrimary, undefined, "makePrimary");
  for (const name of ["add", "resend", "verify", "remove"]) assert.equal(typeof state[name], "function", name);
  for (const [status, code] of [[404, undefined], [503, "settings_read_failed"], [503, "account_plane_unavailable"]] as const) {
    stubFetch(() => json(status, { ok: false, code, message: "x" }));
    await useAccountEmailsStore.getState().hydrate("u-a", "a@b.c");
    const rows = useAccountEmailsStore.getState().data;
    assert.ok(rows.length <= 1);
    for (const row of rows) {
      assert.equal(row.verifiedAt, null);
      assert.equal(row._id, primaryEmailId("u-a"));
    }
  }
});

test("C5 a failed hydrate for user B shows nothing of user A", async () => {
  stubFetch((url) => json(200, url.endsWith("/emails") ? [{ ...defaultEmail("u-a", "a@a.test"), verifiedAt: "2026-01-01T00:00:00.000Z" }] : baseSettings("u-a")));
  await useAccountSettingsStore.getState().hydrate("u-a");
  await useAccountEmailsStore.getState().hydrate("u-a", "a@a.test");
  assert.ok(storage.get(SETTINGS_KEY)?.includes("u-a"));
  stubFetch(() => { throw new Error("offline"); });
  await useAccountSettingsStore.getState().hydrate("u-b");
  await useAccountEmailsStore.getState().hydrate("u-b");
  assert.deepEqual(useAccountSettingsStore.getState().data, { userId: "u-b", security: {} });
  assert.deepEqual(useAccountEmailsStore.getState().data, []);
  assert.ok(!JSON.stringify([...storage.values()]).includes("a@a.test"));
});

test("C6 a remote settings body is stored as received, with no defaults merged in", async () => {
  stubFetch(() => json(200, { userId: "u-a", security: { passkeysEnabled: false } }));
  await useAccountSettingsStore.getState().hydrate("u-a");
  const data = useAccountSettingsStore.getState().data as Record<string, unknown>;
  assert.deepEqual(data, { userId: "u-a", security: { passkeysEnabled: false } });
  assert.equal(data.updatedAt, undefined);
  assert.equal(data.createdAt, undefined);
  assert.ok(!("pendingDeletionAt" in data));
  stubFetch(() => { throw new Error("offline"); });
  await useAccountSettingsStore.getState().hydrate("u-a");
  assert.ok(!("pendingDeletionAt" in (useAccountSettingsStore.getState().data as object)));
});

test("C7 only a code ending _unavailable or _off reads as unavailable", () => {
  assert.equal(classifySettingsError(503, "settings_read_failed"), "failed");
  assert.equal(classifySettingsError(503, "account_plane_unavailable"), "unavailable");
});

test("C8 an address is never Verified without a server timestamp", () => {
  assert.equal(defaultEmail("u", "a@b.c").verifiedAt, null);
  assert.equal(emailVerificationLabel(defaultEmail("u", "a@b.c")), "Not confirmed");
  assert.equal(emailVerificationLabel({ verifiedAt: "2026-01-01T00:00:00.000Z" }), "Verified");
  const modal = readFileSync(new URL("../../src/features/settings/profile/ProfileSecurityModals.tsx", import.meta.url), "utf8");
  // The modal may only ever write `verifiedAt: null`; a timestamp literal would be a made-up confirmation.
  const literals = [...modal.matchAll(/verifiedAt\s*:\s*([^,}\s]+)/g)].map((match) => match[1]);
  assert.ok(literals.every((value) => value === "null"), literals.join());
});

test("C9 resetAccountStores empties both stores and keys; legacy email rows are dropped on hydrate", async () => {
  useAccountSettingsStore.setState({ data: baseSettings("u-a") });
  useAccountEmailsStore.setState({ data: [defaultEmail("u-a", "a@a.test")] });
  assert.ok(storage.has(SETTINGS_KEY) && storage.has(EMAILS_KEY));
  resetAccountStores();
  assert.equal(storage.has(SETTINGS_KEY), false);
  assert.equal(storage.has(EMAILS_KEY), false);
  assert.equal(useAccountSettingsStore.getState().data, null);
  assert.deepEqual(useAccountEmailsStore.getState().data, []);

  useAccountEmailsStore.setState({ data: [{ ...defaultEmail("u-a", "fake@a.test"), _id: "email-123", isPrimary: false }, defaultEmail("u-a", "a@a.test")] });
  stubFetch(() => { throw new Error("offline"); });
  await useAccountEmailsStore.getState().hydrate("u-a");
  assert.deepEqual(useAccountEmailsStore.getState().data, []);
});

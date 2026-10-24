/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-account-user-switch.test.ts               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3 isolation, driven through the real user store: a sign-out or a user change empties both
// account stores and their localStorage keys, a cold boot and an unrelated update do not, and a
// hydrate that was in flight for the previous user writes nothing when its answer arrives late.

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

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
Reflect.set(globalThis, "window", globalThis);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});

const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");
const { useAccountSettingsStore } = await import("../../src/store/settings/useAccountSettingsStore.ts");
const { useAccountEmailsStore } = await import("../../src/store/settings/useAccountEmailsStore.ts");
const { defaultEmail } = await import("../../src/store/settings/defaults.ts");

const SETTINGS_KEY = "osionos:settings:account";
const EMAILS_KEY = "osionos:settings:account-emails";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const token = (id: string) => `osionos_v1.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;

function signIn(id: string) {
  const persona = { id, email: `${id}@example.test`, password: "", name: id, emoji: "x", roleBadge: "Member", persistInSessions: true };
  const session = { userId: id, accessToken: token(id), refreshToken: "osb_rt.x.sig", privateWorkspaces: [], sharedWorkspaces: [] };
  useUserStore.getState().importBridgeSession(session as never, persona as never, new Date(Date.now() + 864e5).toISOString());
}

function seedUser(id: string) {
  useAccountSettingsStore.setState({ data: { userId: id, security: { preferredMfaMethod: "recovery" } } });
  useAccountEmailsStore.setState({ data: [defaultEmail(id, `${id}@example.test`)] });
}

const bothStoresEmpty = () => useAccountSettingsStore.getState().data === null && useAccountEmailsStore.getState().data.length === 0;
const bothKeysGone = () => !memory.has(SETTINGS_KEY) && !memory.has(EMAILS_KEY);
const showsNothingOf = (id: string) => !JSON.stringify([useAccountSettingsStore.getState(), useAccountEmailsStore.getState(), [SETTINGS_KEY, EMAILS_KEY].map((key) => memory.get(key))]).includes(id);

function resetWorld() {
  memory.clear();
  useUserStore.setState({ sessions: {}, personas: [], activeUserId: "", activeWorkspaceByUser: {}, initialized: false, loading: false, error: null });
  useAccountSettingsStore.setState({ data: null, loading: false, error: null });
  useAccountEmailsStore.setState({ data: [], loading: false, error: null });
  memory.clear();
}

test("C9a a user switch and a sign-out each empty both stores and both keys", () => {
  resetWorld();
  signIn("u-a");
  seedUser("u-a");
  assert.ok(memory.has(SETTINGS_KEY) && memory.has(EMAILS_KEY));
  signIn("u-b");
  assert.ok(bothStoresEmpty() && bothKeysGone(), "switch A to B");
  seedUser("u-b");
  useUserStore.setState({ activeUserId: "" });
  assert.ok(bothStoresEmpty() && bothKeysGone(), "sign-out");
});

test("C9b an update that leaves the active user unchanged clears nothing", () => {
  resetWorld();
  signIn("u-a");
  seedUser("u-a");
  useUserStore.setState({ error: "unrelated" });
  signIn("u-a");
  assert.equal(useAccountSettingsStore.getState().data?.userId, "u-a");
  assert.equal(useAccountEmailsStore.getState().data.length, 1);
  assert.ok(memory.has(SETTINGS_KEY) && memory.has(EMAILS_KEY));
});

test("C9c a cold boot keeps the persisted data, and hydrate for the new user discards it", async () => {
  resetWorld();
  seedUser("u-a");
  signIn("u-b");
  assert.equal(useAccountSettingsStore.getState().data?.userId, "u-a", "boot does not reset");
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  await useAccountSettingsStore.getState().hydrate("u-b");
  await useAccountEmailsStore.getState().hydrate("u-b");
  assert.ok(showsNothingOf("u-a"));
});

test("C10 a hydrate in flight for user A writes nothing after the active user became B", async () => {
  resetWorld();
  signIn("u-a");
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async (url: string) => {
    await held;
    return json(String(url).endsWith("/emails") ? [defaultEmail("u-a", "u-a@example.test")] : { userId: "u-a", security: { preferredMfaMethod: "recovery" } });
  }) as typeof fetch;
  const pending = [useAccountSettingsStore.getState().hydrate("u-a"), useAccountEmailsStore.getState().hydrate("u-a", "u-a@example.test")];
  signIn("u-b");
  release();
  await Promise.all(pending);
  assert.ok(bothStoresEmpty(), JSON.stringify([useAccountSettingsStore.getState().data, useAccountEmailsStore.getState().data]));
  assert.ok(showsNothingOf("u-a"));
});

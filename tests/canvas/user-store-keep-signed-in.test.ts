/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-keep-signed-in.test.ts                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 18:20:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 18:20:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Keep me signed in" keeps the session, never the password: measured on the beta 2026-11-03,
// a checked sign-in left it in clear text in osionos:active-accounts and osionos:bridge-session.

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

const PASSWORD = "Canary-Secret-42!";
const token = `osionos_v1.${Buffer.from(JSON.stringify({ sub: "u-1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;

globalThis.fetch = (async (url: string) => {
  if (String(url).endsWith("/api/auth/login")) {
    return new Response(JSON.stringify({ user: { id: "u-1" }, accessToken: token, refreshToken: "osb_rt.one.sig" }), { status: 200 });
  }
  return new Response("[]", { status: 200 });
}) as typeof fetch;

function storedPassword(): string[] {
  return [...memory.entries()].filter(([, value]) => value.includes(PASSWORD)).map(([key]) => key);
}

test("a checked sign-in keeps the session and no copy of the password", async () => {
  memory.clear();
  assert.equal(await useUserStore.getState().loginWithCredentials("amy@example.test", PASSWORD, true, "login"), true);
  assert.ok(JSON.parse(memory.get("osionos:bridge-session") ?? "{}")["u-1"], "the session is kept for the next visit");
  assert.deepEqual(storedPassword(), []);
  assert.ok(!JSON.stringify(useUserStore.getState().personas).includes(PASSWORD), "nor in memory");
});

test("a record saved before the fix loses its password on the next save", () => {
  memory.clear();
  const persona = { id: "u-2", email: "bo@example.test", password: PASSWORD, name: "Bo", emoji: "x", roleBadge: "Member", persistInSessions: true };
  const session = { userId: "u-2", accessToken: token, refreshToken: "osb_rt.two.sig", privateWorkspaces: [], sharedWorkspaces: [] };
  useUserStore.getState().importBridgeSession(session as never, persona as never, new Date(Date.now() + 864e5).toISOString());
  assert.deepEqual(storedPassword(), []);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-fixtures.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The user store under node: an empty seed, a bridge at http://bridge, and a localStorage
// with a character quota, so a test can fill the origin the way a real profile fills up.
// The loader must be registered before the store is imported, so the store comes from here.

import { register } from "node:module";

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

/** A Storage that counts key + value characters, as the browsers' quota does, and refuses a
 *  write past `limit`, any write to a key in `refused`, a write to a key in `fullWhilePageCached`
 *  while a workspace page cache is stored, and the next N writes to a key counted in `refusals`,
 *  with a QuotaExceededError. */
export class QuotaStorage {
  readonly data = new Map<string, string>();
  limit = Number.POSITIVE_INFINITY;
  readonly refused = new Set<string>();
  readonly fullWhilePageCached = new Set<string>();
  readonly refusals = new Map<string, number>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); this.limit = Number.POSITIVE_INFINITY; this.refused.clear(); this.fullWhilePageCached.clear(); this.refusals.clear(); }
  used() { let total = 0; for (const [key, value] of this.data) total += key.length + value.length; return total; }
  setItem(key: string, value: string) {
    const text = String(value);
    const previous = this.data.get(key);
    const next = this.used() - (previous === undefined ? 0 : key.length + previous.length) + key.length + text.length;
    const cached = this.fullWhilePageCached.has(key) && [...this.data.keys()].some((stored) => stored.startsWith("osio:pages:ws"));
    const counted = (this.refusals.get(key) ?? 0) > 0;
    if (counted) this.refusals.set(key, (this.refusals.get(key) ?? 0) - 1);
    if (this.refused.has(key) || cached || counted || next > this.limit) throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
    this.data.set(key, text);
  }
}

export const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

export const userStore = await import("../../src/features/auth/model/useUserStore.ts");
export const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

export const BRIDGE_KEY = "osionos:bridge-session";
export const NOW = Date.now();
export const resultKey = (userId: string) => `osionos:refresh-result:${userId}`;
export const leaseKey = (userId: string) => `osionos:refresh-lease:${userId}`;

export function token(expSecondsFromNow: number, tag: string): string {
  const payload = { sub: "u", tag, exp: Math.floor(NOW / 1000) + expSecondsFromNow };
  return `osionos_v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

const persona = (id: string) => ({ id, email: `${id}@example.test`, password: "", name: id, emoji: "x", roleBadge: "Member", persistInSessions: true });
const workspace = (id: string) => ({ _id: `ws-${id}`, name: `W ${id}`, ownerId: id, members: [], settings: {} }) as never;

export function signIn(id: string, refreshToken: string, expSeconds = 30): void {
  const session = { userId: id, accessToken: token(expSeconds, `${id}-old`), refreshToken, privateWorkspaces: [workspace(id)], sharedWorkspaces: [] };
  userStore.useUserStore.getState().importBridgeSession(session as never, persona(id) as never, new Date(NOW + 7 * 864e5).toISOString());
}

export function persisted(): Record<string, { session: { accessToken: string; refreshToken: string } }> {
  return JSON.parse(storage.getItem(BRIDGE_KEY) ?? "{}");
}

type Bridge = { refreshTo: string; held?: Promise<void>; logout?: () => Response };

/** The bridge: the refresh route answers a new pair (after `held`, when given) and the logout
 *  route answers `logout`. Returns the refresh tokens the refresh route was sent. */
export function stubBridge({ refreshTo, held, logout }: Bridge): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/logout")) return logout?.() ?? new Response(null, { status: 204 });
    calls.push(JSON.parse(String(init?.body ?? "{}")).refreshToken ?? "");
    await held;
    return new Response(JSON.stringify({ accessToken: token(3600, "fresh"), refreshToken: refreshTo, expiresAt: NOW + 3_600_000 }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

/** A promise the test resolves by hand: the point where an interleaving is decided. */
export function gate(): { opened: Promise<void>; open: () => void } {
  let open = () => {};
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

export function reset(): void {
  storage.clear();
  useToastStore.getState().clear();
  userStore.useUserStore.setState({ sessions: {}, personas: [], activeUserId: "", activeWorkspaceByUser: {}, initialized: false, loading: false, error: null });
}

/** A workspace page cache of `size` characters: the room the room-maker may take back. */
export function fillPageCache(size: number): string {
  const key = "osio:pages:ws-cache";
  storage.setItem(key, "x".repeat(size));
  return key;
}

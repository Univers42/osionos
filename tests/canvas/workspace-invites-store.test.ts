/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-invites-store.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-5-c: the invites store maps the bridge's invite rows, hands the accept link out once and
// never persists it. Transport is a stubbed fetch; the store is the only writer of the routes.

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

// Node has no localStorage: a Map-backed one lets the persist middleware write, so the test
// reads what would really reach disk.
const disk = new Map<string, string>();
Reflect.set(globalThis, "localStorage", {
  getItem: (key: string) => disk.get(key) ?? null,
  setItem: (key: string, value: string) => void disk.set(key, value),
  removeItem: (key: string) => void disk.delete(key),
});
// zustand reads `window.localStorage`.
Reflect.set(globalThis, "window", globalThis);

const { useWorkspaceInvitesStore } = await import("../../src/store/settings/useWorkspaceInvitesStore.ts");

const WS = "11111111-1111-4111-8111-111111111111";
const TOKEN = "A".repeat(43);
const LINK = `https://app.test/?invite=${TOKEN}`;
const ROW = {
  id: "22222222-2222-4222-8222-222222222222", email: "ada@example.com", role: "member", invitedBy: "u1",
  expiresAt: "2026-11-01T00:00:00.000Z", createdAt: "2026-10-24T00:00:00.000Z", acceptedAt: null, revokedAt: null,
};

function useSession() {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.t", handleSessionRevoked: () => undefined }),
    subscribe: () => () => undefined,
  });
}

function answerWith(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

const persisted = (): string => [...disk.values()].join("\n");

test("create maps the row, keeps the link in memory only and persists no token", async () => {
  useSession();
  answerWith(200, { ok: true, invite: ROW, token: TOKEN, acceptUrl: LINK });
  const invite = await useWorkspaceInvitesStore.getState().create(WS, { email: ROW.email, role: "member" });
  assert.equal(invite?._id, ROW.id);
  assert.equal(invite?.workspaceId, WS);
  assert.equal(useWorkspaceInvitesStore.getState().acceptLinks[ROW.id], LINK);
  const stored = persisted();
  assert.ok(stored.includes(ROW.id), "the store did write the row to disk");
  assert.equal(stored.includes(TOKEN), false, "the plaintext token is not persisted");
  assert.equal(stored.includes("acceptLinks"), false);
  assert.equal(JSON.stringify(useWorkspaceInvitesStore.getState().data).includes(TOKEN), false);
});

test("a refused create rolls the list back and offers no link", async () => {
  useSession();
  useWorkspaceInvitesStore.setState({ data: { [WS]: [] }, acceptLinks: {} });
  answerWith(409, { ok: false, code: "already_member", message: "That account is already a member of this workspace." });
  const invite = await useWorkspaceInvitesStore.getState().create(WS, { email: ROW.email, role: "member" });
  assert.equal(invite, null);
  assert.deepEqual(useWorkspaceInvitesStore.getState().data[WS], []);
  assert.deepEqual(useWorkspaceInvitesStore.getState().acceptLinks, {});
});

test("resend swaps in the new link and keeps the row", async () => {
  useSession();
  useWorkspaceInvitesStore.setState({ data: { [WS]: [{ ...ROW, _id: ROW.id, workspaceId: WS, updatedAt: ROW.createdAt }] }, acceptLinks: {} });
  answerWith(200, { ok: true, invite: ROW, token: TOKEN, acceptUrl: LINK });
  await useWorkspaceInvitesStore.getState().resend(WS, ROW.id);
  assert.equal(useWorkspaceInvitesStore.getState().acceptLinks[ROW.id], LINK);
  assert.equal(useWorkspaceInvitesStore.getState().data[WS]?.length, 1);
});

test("hydrate maps the listed rows and a revoked row stays listed", async () => {
  useSession();
  answerWith(200, [{ ...ROW, revokedAt: "2026-10-25T00:00:00.000Z" }]);
  await useWorkspaceInvitesStore.getState().hydrate(WS);
  const [row] = useWorkspaceInvitesStore.getState().data[WS] ?? [];
  assert.equal(row?._id, ROW.id);
  assert.equal(row?.revokedAt, "2026-10-25T00:00:00.000Z");
});

test("revoke keeps the row and stamps revokedAt", async () => {
  useSession();
  useWorkspaceInvitesStore.setState({ data: { [WS]: [{ ...ROW, _id: ROW.id, workspaceId: WS, updatedAt: ROW.createdAt }] }, acceptLinks: { [ROW.id]: LINK } });
  answerWith(200, { ok: true, revoked: true });
  await useWorkspaceInvitesStore.getState().revoke(WS, ROW.id);
  const [row] = useWorkspaceInvitesStore.getState().data[WS] ?? [];
  assert.ok(row?.revokedAt, "the row is marked revoked, not dropped");
  assert.equal(useWorkspaceInvitesStore.getState().acceptLinks[ROW.id], undefined);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-invites-mine.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Plan B front half: the invitee's own inbox and the two by-id decisions. Transport is a
// stubbed fetch; the store is the only writer of the routes. An old bridge answers /mine
// with a 404 and must look like an empty inbox, not an error.

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

const disk = new Map<string, string>();
Reflect.set(globalThis, "localStorage", {
  getItem: (key: string) => disk.get(key) ?? null,
  setItem: (key: string, value: string) => void disk.set(key, value),
  removeItem: (key: string) => void disk.delete(key),
});
Reflect.set(globalThis, "window", globalThis);

const { useWorkspaceInvitesStore } = await import("../../src/store/settings/useWorkspaceInvitesStore.ts");

const WS = "11111111-1111-4111-8111-111111111111";
const INVITE_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "A".repeat(43);
const MINE = [{
  id: INVITE_ID,
  workspaceName: "Studio",
  inviterName: "Ada",
  role: "member",
  expiresAt: "2026-11-04T00:00:00.000Z",
}];

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: {} };

function useSession() {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.t", handleSessionRevoked: () => undefined }),
    subscribe: () => () => undefined,
  });
}

function respondWith(status: number, body: unknown) {
  answer = { status, body };
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({
    url,
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
  });
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

function reset() {
  useSession();
  calls = [];
  respondWith(200, {});
  useWorkspaceInvitesStore.setState({ mine: [], mineLoading: false, mineError: null, mineUnavailable: false });
}

test("mine maps the /mine rows and is not persisted", async () => {
  reset();
  respondWith(200, { invites: MINE });
  const invites = await useWorkspaceInvitesStore.getState().fetchMine();
  assert.deepEqual(invites, MINE);
  assert.deepEqual(useWorkspaceInvitesStore.getState().mine, MINE);
  assert.equal(useWorkspaceInvitesStore.getState().mineUnavailable, false);
  assert.equal(useWorkspaceInvitesStore.getState().mineError, null);
  assert.equal(calls[0]?.url, "https://bridge.test/api/invites/mine");
  assert.equal(calls[0]?.method, "GET");
});

test("an old bridge's 404 on /mine is an empty inbox with no error", async () => {
  reset();
  respondWith(404, { error: "Not found" });
  const invites = await useWorkspaceInvitesStore.getState().fetchMine();
  assert.deepEqual(invites, []);
  assert.deepEqual(useWorkspaceInvitesStore.getState().mine, []);
  assert.equal(useWorkspaceInvitesStore.getState().mineUnavailable, true);
  assert.equal(useWorkspaceInvitesStore.getState().mineError, null);
  assert.equal(useWorkspaceInvitesStore.getState().mineLoading, false);
});

test("mine keeps a real failure as an error", async () => {
  reset();
  respondWith(500, { code: "boom", error: "Server failed" });
  await useWorkspaceInvitesStore.getState().fetchMine();
  assert.match(useWorkspaceInvitesStore.getState().mineError ?? "", /Server failed/);
  assert.equal(useWorkspaceInvitesStore.getState().mineUnavailable, false);
});

test("resolve answers the id, and every refusal is null", async () => {
  reset();
  respondWith(200, { id: INVITE_ID });
  assert.equal(await useWorkspaceInvitesStore.getState().resolve(TOKEN), INVITE_ID);
  assert.equal(calls[0]?.url, "https://bridge.test/api/invites/resolve");
  assert.deepEqual(calls[0]?.body, { token: TOKEN });

  respondWith(404, { error: "Not found" });
  assert.equal(await useWorkspaceInvitesStore.getState().resolve(TOKEN), null);
});

test("acceptById maps the join and drops the pending row", async () => {
  reset();
  useWorkspaceInvitesStore.setState({ mine: MINE });
  respondWith(200, { ok: true, workspaceId: WS, role: "guest" });
  const result = await useWorkspaceInvitesStore.getState().acceptById(INVITE_ID);
  assert.deepEqual(result, { ok: true, workspaceId: WS, role: "guest" });
  assert.equal(calls[0]?.url, `https://bridge.test/api/invites/${INVITE_ID}/accept`);
  assert.deepEqual(useWorkspaceInvitesStore.getState().mine, []);
});

test("acceptById maps already_member and invite_expired", async () => {
  reset();
  respondWith(409, { code: "already_member", error: "Already a member" });
  assert.deepEqual(await useWorkspaceInvitesStore.getState().acceptById(INVITE_ID), { ok: false, code: "already_member" });

  respondWith(410, { code: "invite_expired", error: "Expired" });
  assert.deepEqual(await useWorkspaceInvitesStore.getState().acceptById(INVITE_ID), { ok: false, code: "invite_expired" });

  respondWith(404, { error: "Not found" });
  assert.deepEqual(await useWorkspaceInvitesStore.getState().acceptById(INVITE_ID), { ok: false, code: "not_found" });
});

test("decline maps success and clears the row; a 404 also clears it", async () => {
  reset();
  useWorkspaceInvitesStore.setState({ mine: MINE });
  respondWith(200, { ok: true });
  assert.equal(await useWorkspaceInvitesStore.getState().decline(INVITE_ID), true);
  assert.equal(calls[0]?.url, `https://bridge.test/api/invites/${INVITE_ID}/decline`);
  assert.deepEqual(useWorkspaceInvitesStore.getState().mine, []);

  useWorkspaceInvitesStore.setState({ mine: MINE });
  respondWith(404, { code: "not_found", error: "Not found" });
  assert.equal(await useWorkspaceInvitesStore.getState().decline(INVITE_ID), true);
  assert.deepEqual(useWorkspaceInvitesStore.getState().mine, []);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-teams-store.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-5-d: the teams slice of useTeamspacesStore reads and writes the bridge's
// /api/workspaces/:id/teams routes, follows the keyset cursor, and hydrates an
// old persisted row (written before the slice existed) to an empty list.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push(toast) { (globalThis.__toasts ??= []).push(toast); } }) };`;

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

const OLD_ROW = JSON.stringify({ state: { data: { w1: [] } }, version: 0 });
const memory = new Map<string, string>([["osionos:settings:teamspaces", OLD_ROW]]);
// zustand's persist reads `window.localStorage`; without a window it silently skips persistence.
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;
Reflect.set(globalThis, "window", { localStorage: storage });
Reflect.set(globalThis, "localStorage", storage);
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "page.jwt", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});


const { useTeamspacesStore } = await import("../../src/store/settings/useTeamspacesStore.ts");

const WS = "w1";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const wireTeam = (id: string, name: string) => ({ id, name, description: "", memberCount: 0, myRole: null, createdAt: null, updatedAt: null });

/** Answers each `METHOD path` with the next canned response and records every call. */
async function withRoutes<T>(routes: Record<string, Response[]>, run: (calls: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const key = `${init?.method ?? "GET"} ${url.pathname}${url.search}`;
    calls.push(key);
    const next = routes[key]?.shift();
    return next ?? json({ error: "not_found" }, 404);
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("an old persisted row with no teams key hydrates to an empty list, never a throw", () => {
  const state = useTeamspacesStore.getState();
  assert.deepEqual(state.teams, {});
  assert.deepEqual(state.teamMembers, {});
  assert.deepEqual(state.data[WS], []);
});

test("hydrateTeams follows the keyset cursor across pages", async () => {
  const base = `/api/workspaces/${WS}/teams`;
  await withRoutes(
    {
      [`GET ${base}?limit=50`]: [json({ teams: [wireTeam("t1", "Design")], nextCursor: "c1" })],
      [`GET ${base}?limit=50&cursor=c1`]: [json({ teams: [wireTeam("t2", "Ops")], nextCursor: null })],
    },
    async () => {
      await useTeamspacesStore.getState().hydrateTeams(WS);
    },
  );
  assert.deepEqual(useTeamspacesStore.getState().teams[WS].map((team) => team.name), ["Design", "Ops"]);
});

test("createTeam posts the name and shows the server's team", async () => {
  const base = `/api/workspaces/${WS}/teams`;
  const created = await withRoutes(
    { [`POST ${base}`]: [json({ team: wireTeam("t3", "Support") }, 201)] },
    () => useTeamspacesStore.getState().createTeam(WS, { name: "Support" }),
  );
  assert.equal(created?.id, "t3");
  assert.ok(useTeamspacesStore.getState().teams[WS].some((team) => team.id === "t3"));
});

test("addTeamMember re-reads the members, removeTeamMember drops the row and the count", async () => {
  const base = `/api/workspaces/${WS}/teams/t3/members`;
  const member = { userId: "u1", name: "Ada", role: "member", addedAt: null };
  await withRoutes(
    {
      [`POST ${base}`]: [json({ member }, 201)],
      [`GET ${base}?limit=50`]: [json({ members: [member], nextCursor: null })],
      [`DELETE ${base}/u1`]: [json({ ok: true })],
    },
    async () => {
      await useTeamspacesStore.getState().addTeamMember(WS, "t3", { userId: "u1" });
      assert.deepEqual(useTeamspacesStore.getState().teamMembers.t3, [member]);
      assert.equal(useTeamspacesStore.getState().teams[WS].find((team) => team.id === "t3")?.memberCount, 1);
      await useTeamspacesStore.getState().removeTeamMember(WS, "t3", "u1");
    },
  );
  assert.deepEqual(useTeamspacesStore.getState().teamMembers.t3, []);
  assert.equal(useTeamspacesStore.getState().teams[WS].find((team) => team.id === "t3")?.memberCount, 0);
});

test("deleteTeam removes the team and its members", async () => {
  await withRoutes(
    { [`DELETE /api/workspaces/${WS}/teams/t3`]: [json({ ok: true })] },
    () => useTeamspacesStore.getState().deleteTeam(WS, "t3"),
  );
  assert.ok(!useTeamspacesStore.getState().teams[WS].some((team) => team.id === "t3"));
  assert.equal(useTeamspacesStore.getState().teamMembers.t3, undefined);
});

test("createTeam rejected with a coded 404 keeps no local team and reports the server's message", async () => {
  const base = `/api/workspaces/w2/teams`;
  const created = await withRoutes(
    { [`POST ${base}`]: [json({ code: "workspace_not_found", message: "No such workspace." }, 404)] },
    () => useTeamspacesStore.getState().createTeam("w2", { name: "Ghost" }),
  );
  assert.equal(created, null);
  assert.ok(!(useTeamspacesStore.getState().teams.w2 ?? []).some((team) => team.name === "Ghost"));
  const toasts = Reflect.get(globalThis, "__toasts") as Array<{ kind: string; description: string }>;
  assert.deepEqual(toasts.map((toast) => [toast.kind, toast.description]), [["error", "No such workspace."]]);
});

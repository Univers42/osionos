/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   library-server-views.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 20:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 20:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// C913: the Library views an admin curates come from the bridge for every member. Only a
// curator saves, once per burst of edits and against the stamp it read; a 403 relocks and
// a 409 adopts the other admin's views. The real api client runs over a stubbed bridge
// that answers like scripts/bridge-library-views.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import type { NotionState } from "@notion-db/object-database";
import type { UserSession, Workspace } from "@/entities/user";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

interface Stored { views: Record<string, unknown>; updatedAt: string | null }
const library = new Map<string, Stored>();
const curators = new Set<string>();
const unserved = new Set<string>();
const puts: Array<{ workspaceId: string; body: { views: Record<string, unknown>; baseUpdatedAt: string | null } }> = [];
const gets: string[] = [];
let stamp = 0;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenUser = (init?: RequestInit) => String(new Headers(init?.headers).get("authorization")).replace(/^Bearer tok-/, "");

globalThis.fetch = (async (input: string, init?: RequestInit) => {
  const route = /\/api\/workspaces\/([^/]+)\/library-views$/.exec(String(input));
  if (!route) return json({ error: "not_found" }, 404);
  const workspaceId = decodeURIComponent(route[1]);
  if (unserved.has(workspaceId)) return json({ message: "Not found" }, 404);
  const current = library.get(workspaceId) ?? { views: {}, updatedAt: null };
  const canCurate = curators.has(`${tokenUser(init)}:${workspaceId}`);
  if ((init?.method ?? "GET") === "GET") {
    gets.push(workspaceId);
    return json({ ...current, canCurate });
  }
  const body = JSON.parse(String(init?.body));
  puts.push({ workspaceId, body });
  if (!canCurate) return json({ ok: false, code: "forbidden", message: "Only the workspace owner or an admin may change the Library views." }, 403);
  if (body.baseUpdatedAt !== current.updatedAt) return json({ ok: false, code: "library_views_conflict", message: "Someone else changed the Library views.", ...current }, 409);
  const saved = { views: body.views, updatedAt: `2026-10-29T20:00:00.${String(++stamp).padStart(3, "0")}Z` };
  library.set(workspaceId, saved);
  return json({ ...saved, canCurate: true });
}) as typeof fetch;

const { useUserStore } = await import("@/features/auth/model/useUserStore");
const { useToastStore } = await import("@/shared/ui");
const { getLibraryDatabaseAdapter } = await import("@/widgets/database-view/model/libraryDatabaseState");
const { LIBRARY_DB_ID } = await import("@/widgets/database-view/model/libraryDatabaseModel");
const { libraryViews } = await import("@/widgets/database-view/model/libraryViews");

const adapter = getLibraryDatabaseAdapter();
const load = (): Promise<NotionState> => adapter.loadState();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SHIPPED_ALL = libraryViews(false)["v-library-all"];
const named = (name: string) => ({ "v-library-all": { ...SHIPPED_ALL, name } });
const nameOf = (state: NotionState) => (state.views["v-library-all"] as { name: string }).name;
const isLocked = (state: NotionState) => state.databases[LIBRARY_DB_ID].locked === true;
const toastTitles = () => useToastStore.getState().toasts.map((toast) => toast.title);
const edited = (state: NotionState, name: string): NotionState =>
  ({ ...state, views: { ...state.views, "v-library-all": { ...state.views["v-library-all"], name } } });

async function until(done: (state: NotionState) => boolean): Promise<NotionState> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const state = await load();
    if (done(state)) return state;
    await tick();
  }
  throw new Error("the Library never reached the expected state");
}

// One shared workspace per test (the views cache is module-wide, per user and workspace).
function signIn(userId: string, workspaceId: string, role: string): void {
  const shared = { _id: workspaceId, name: workspaceId, slug: workspaceId, ownerId: "boss", role } as Workspace;
  const session = { userId, accessToken: `tok-${userId}`, refreshToken: "", privateWorkspaces: [], sharedWorkspaces: [shared] } as unknown as UserSession;
  useUserStore.setState({ sessions: { [userId]: session }, activeUserId: userId, activeWorkspaceByUser: { [userId]: workspaceId } });
}

function reset(): void {
  puts.length = 0;
  gets.length = 0;
  useToastStore.setState({ toasts: [] });
}

test("a member sees the admin's views, locked, and never saves", async () => {
  reset();
  library.set("ws-member", { views: named("Curated"), updatedAt: "2026-10-29T19:00:00.000Z" });
  signIn("u-member", "ws-member", "editor");
  const state = await until((next) => nameOf(next) === "Curated");
  assert.equal(isLocked(state), true);
  adapter.persistState?.(edited(state, "Mine"), state);
  await sleep(900);
  assert.equal(puts.length, 0, "a member never PUTs");
  assert.equal(nameOf(await load()), "Curated");
});

test("a curator's burst of edits is one PUT after the debounce, against the stamp it read", async () => {
  reset();
  library.set("ws-admin", { views: {}, updatedAt: "2026-10-29T19:00:00.000Z" });
  curators.add("u-admin:ws-admin");
  signIn("u-admin", "ws-admin", "admin");
  const state = await until((next) => !isLocked(next));
  adapter.persistState?.(edited(state, "A"), state);
  adapter.persistState?.(edited(state, "B"), edited(state, "A"));
  assert.equal(nameOf(await load()), "B", "shown at once");
  await sleep(400);
  assert.equal(puts.length, 0, "nothing sent inside the debounce");
  await sleep(600);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].body.baseUpdatedAt, "2026-10-29T19:00:00.000Z");
  assert.deepEqual(puts[0].body.views, named("B"), "only the view that differs from the shipped ones");
  const after = await until(() => library.get("ws-admin")?.updatedAt !== "2026-10-29T19:00:00.000Z");
  assert.equal(nameOf(after), "B");
  assert.deepEqual(toastTitles(), []);
});

test("a 403 relocks the Library and says why", async () => {
  reset();
  library.set("ws-demoted", { views: named("Kept"), updatedAt: "2026-10-29T19:00:00.000Z" });
  curators.add("u-demoted:ws-demoted");
  signIn("u-demoted", "ws-demoted", "admin");
  const state = await until((next) => !isLocked(next) && nameOf(next) === "Kept");
  curators.delete("u-demoted:ws-demoted");
  adapter.persistState?.(edited(state, "Lost"), state);
  await sleep(900);
  const after = await until((next) => isLocked(next) && nameOf(next) === "Kept");
  assert.equal(puts.length, 1);
  assert.equal(nameOf(after), "Kept", "the server's views, not the refused edit");
  assert.deepEqual(toastTitles(), ["You can no longer change the Library views"]);
});

test("a 409 adopts the other admin's views", async () => {
  reset();
  library.set("ws-race", { views: {}, updatedAt: "2026-10-29T19:00:00.000Z" });
  curators.add("u-race:ws-race");
  signIn("u-race", "ws-race", "admin");
  const state = await until((next) => !isLocked(next));
  library.set("ws-race", { views: named("Theirs"), updatedAt: "2026-10-29T19:30:00.000Z" });
  adapter.persistState?.(edited(state, "Mine"), state);
  await sleep(900);
  const after = await until((next) => nameOf(next) === "Theirs");
  assert.equal(puts.length, 1);
  assert.equal(isLocked(after), false, "still a curator");
  assert.deepEqual(toastTitles(), ["Another admin changed the Library views"]);
  assert.equal(library.get("ws-race")?.updatedAt, "2026-10-29T19:30:00.000Z", "theirs stays stored");
});

test("a bridge without the route leaves everyone on the shipped views, locked, quietly", async () => {
  reset();
  unserved.add("ws-old");
  curators.add("u-old:ws-old");
  signIn("u-old", "ws-old", "admin");
  for (let turn = 0; turn < 40; turn += 1) await tick();
  const state = await load();
  assert.deepEqual(state.views, libraryViews(false));
  assert.equal(isLocked(state), true);
  adapter.persistState?.(edited(state, "Edited"), state);
  await sleep(900);
  assert.equal(puts.length, 0);
  assert.deepEqual(toastTitles(), []);
});

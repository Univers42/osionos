/* ************************************************************************** */
/*  library-adapter-access.test.ts — whom the Library adapter lists for, from */
/*  the live stores: private rows follow the session, agents are cached per   */
/*  user and workspace, and only a curator's view edits are kept or honoured. */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/user-store-env.ts";

import type { NotionState } from "@notion-db/object-database";
import type { PageEntry } from "@/entities/page";
import type { UserSession, Workspace } from "@/entities/user";

// The shared in-memory localStorage never says what was written; this one does.
const files = new Map<string, string>();
const writes: string[] = [];
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => files.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); files.set(key, String(value)); },
    removeItem: (key: string) => void files.delete(key),
    clear: () => files.clear(),
  },
});

// The AI service, by URL. A workspace with no entry answers 404: agents are off on the deployment.
const requests: string[] = [];
const agentSettings = new Map<string, unknown>();
const agentsByUser = new Map<string, unknown[]>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string) => {
  const path = String(input).replace(/^\/api\/ai/, "");
  requests.push(path);
  const settings = /^\/workspaces\/([^/]+)\/agents\/settings$/.exec(path);
  if (settings) return agentSettings.has(settings[1]) ? json(agentSettings.get(settings[1])) : json({ error: "not_found" }, 404);
  if (path === "/agents") return json(agentsByUser.get(useUserStore.getState().activeUserId) ?? []);
  if (/^\/workspaces\/[^/]+\/skills$/.test(path)) return json({ skills: [] });
  if (path.startsWith("/commands")) return json({ commands: [] });
  return json({ error: "not_found" }, 404);
}) as typeof fetch;

const { useUserStore } = await import("@/features/auth/model/useUserStore");
const { usePageStore } = await import("@/store/usePageStore");
const { derivePageState } = await import("@/store/pageStore.helpers");
const { getLibraryDatabaseAdapter } = await import("@/widgets/database-view/model/libraryDatabaseState");
const { createLibrarySubItemsController, openLibraryItem } = await import("@/widgets/database-view/model/libraryItems");
const { LIBRARY_DB_ID } = await import("@/widgets/database-view/model/libraryDatabaseModel");
const { libraryViews } = await import("@/widgets/database-view/model/libraryViews");

const adapter = getLibraryDatabaseAdapter();
const load = (): Promise<NotionState> => adapter.loadState();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const calls = (path: string) => requests.filter((request) => request === path).length;
const rows = (state: NotionState) => Object.keys(state.pages).sort();

async function until(done: (state: NotionState) => boolean): Promise<NotionState> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const state = await load();
    if (done(state)) return state;
    await tick();
  }
  throw new Error("the Library never reached the expected state");
}

// Caveat: 40 event-loop turns outlast the stubbed round trips (a few awaits each); a request
// that took longer would be missed and a "never asked" assertion would pass for the wrong reason.
async function settle(): Promise<void> {
  for (let turn = 0; turn < 40; turn += 1) await tick();
}

const workspace = (id: string, extra: Partial<Workspace> = {}): Workspace =>
  ({ _id: id, name: id, slug: id, ownerId: "boss", ...extra }) as Workspace;

const session = (userId: string, privateIds: string[], shared: Workspace[] = []): UserSession =>
  ({
    userId, accessToken: "", refreshToken: "",
    privateWorkspaces: privateIds.map((id) => workspace(id, { ownerId: userId })),
    sharedWorkspaces: shared,
  }) as UserSession;

function signIn(sessions: UserSession[], activeUserId: string, activeWorkspaceByUser: Record<string, string>): void {
  useUserStore.setState({ sessions: Object.fromEntries(sessions.map((entry) => [entry.userId, entry])), activeUserId, activeWorkspaceByUser });
}

const page = (id: string, workspaceId: string, extra: Partial<PageEntry> = {}): PageEntry =>
  ({ _id: id, title: id, workspaceId, updatedAt: "2026-10-01T00:00:00.000Z", ...extra }) as PageEntry;

function seedPages(...entries: PageEntry[]): void {
  const byWorkspace: Record<string, PageEntry[]> = {};
  for (const entry of entries) (byWorkspace[entry.workspaceId] ??= []).push(entry);
  usePageStore.setState({ ...derivePageState(byWorkspace), recents: [] });
}

// Ids are unique per test: the remote cache is module-wide and remembers what it asked.
async function fresh(): Promise<void> {
  await settle();
  requests.length = 0;
  writes.length = 0;
  files.clear();
  agentSettings.clear();
  agentsByUser.clear();
  seedPages();
}

test("C821: private rows come only from the session's own private workspaces", async () => {
  await fresh();
  const shared = workspace("sh821", { role: "editor" });
  signIn([session("u821a", ["pa821"], [shared]), session("u821b", ["pb821"], [shared])], "u821a", { u821a: "sh821", u821b: "sh821" });
  seedPages(
    page("shared-page", "sh821", { ownerId: "boss", visibility: "shared" }),
    page("a-private", "pa821", { ownerId: "u821a" }),
    page("a-shared", "pa821", { ownerId: "u821a", visibility: "shared" }),
    page("a-public", "pa821", { ownerId: "u821a", visibility: "public" }),
    page("b-private", "pb821", { ownerId: "u821b" }),
  );
  const ownRows = ["a-private", "a-public", "a-shared", "shared-page"];
  assert.deepEqual(rows(await load()), ownRows);

  useUserStore.setState({ activeUserId: "u821b" });
  const theirs = rows(await load());
  assert.deepEqual(theirs, ["b-private", "shared-page"]);
  assert.equal(theirs.some((id) => id.startsWith("a-")), false, "none of A's private-workspace pages, whatever their visibility");

  useUserStore.setState({ activeUserId: "u821a" });
  assert.deepEqual(rows(await load()), ownRows);
});

const customAgent = (id: string, name: string) =>
  ({ kind: "custom", id, scope: "user", workspaceId: null, name, description: "", tools: [], skills: [], version: 1, archived: false, needsReview: false });

test("C822: a user-scope agent cache is per user and workspace", async () => {
  await fresh();
  agentSettings.set("sh822", { agents_enabled: true, custom_agents_allowed: true });
  agentsByUser.set("u822a", [customAgent("ag-a", "Only A")]);
  agentsByUser.set("u822b", [customAgent("ag-b", "Only B")]);
  const shared = workspace("sh822", { role: "editor" });
  signIn([session("u822a", [], [shared]), session("u822b", [], [shared])], "u822a", { u822a: "sh822", u822b: "sh822" });

  const forA = await until((state) => "agent:ag-a" in state.pages);
  assert.ok("v-library-agents" in forA.views, "agents on: the Agents tab is there");
  assert.equal(calls("/agents"), 1);

  useUserStore.setState({ activeUserId: "u822b" });
  assert.equal("agent:ag-a" in (await load()).pages, false, "A's agent is not B's, even before B's own list lands");
  const forB = await until((state) => "agent:ag-b" in state.pages);
  assert.equal("agent:ag-a" in forB.pages, false);
  assert.equal(calls("/agents"), 2, "B asked for its own agents in the same workspace");
  assert.equal(calls("/workspaces/sh822/agents/settings"), 2);

  useUserStore.setState({ activeUserId: "u822a" });
  const back = await load();
  assert.ok("agent:ag-a" in back.pages && !("agent:ag-b" in back.pages), "A's cache is still A's");
  await settle();
  assert.equal(calls("/agents"), 2, "back on A, nothing is fetched again");
});

const edited = (state: NotionState, name: string): NotionState =>
  ({ ...state, views: { ...state.views, "v-library-all": { ...state.views["v-library-all"], name } } });

test("C913: views kept in this browser by L1 are ignored, and no role writes them", async () => {
  await fresh();
  const key = "osionos:library:views:v1:u830:sh830";
  const shipped = libraryViews(false);
  const stored = JSON.stringify({ "v-library-all": { ...shipped["v-library-all"], name: "Seeded" } });
  files.set(key, stored);
  // No bridge here (API_BASE is unset under node): the curated views never arrive, so even an
  // admin stays on the shipped views, locked. library-server-views.test.ts drives the bridge.
  for (const role of ["editor", "viewer", "admin"]) {
    signIn([session("u830", [], [workspace("sh830", { role })])], "u830", { u830: "sh830" });
    const state = await load();
    assert.deepEqual(state.views, shipped, `${role}: the shipped views, whatever this browser holds`);
    assert.equal(state.databases[LIBRARY_DB_ID].locked, true, `${role}: locked until the bridge says otherwise`);
    adapter.persistState?.(edited(state, "Edited"), state);
    assert.equal(writes.length, 0, `${role}: nothing is written to this browser`);
    assert.equal(files.get(key), stored);
  }
});

test("C833: with agents off there is no listAgents call and no Agents view", async () => {
  await fresh();
  const agentsView = libraryViews(true)["v-library-agents"];
  assert.ok(agentsView, "the shipped views do hold an Agents tab");
  const cases: Array<[string, string, unknown]> = [
    ["u833a", "sh833a", undefined],
    ["u833b", "sh833b", { agents_enabled: false, custom_agents_allowed: false }],
  ];
  for (const [user, space, body] of cases) {
    if (body) agentSettings.set(space, body);
    signIn([session(user, [space])], user, { [user]: space });
    await load();
    await settle();
    assert.equal(calls(`/workspaces/${space}/agents/settings`), 1, `${space}: the settings were asked`);
    assert.equal(calls("/agents"), 0, `${space}: listAgents is never called`);
    const state = await load();
    assert.equal("v-library-agents" in state.views, false, `${space}: no Agents view`);
    assert.equal(rows(state).some((id) => id.startsWith("agent:")), false);
  }
});

test("C834: signed out, or without a workspace, the Library is empty and asks for nothing", async () => {
  await fresh();
  seedPages(page("ghost", "sh834", { visibility: "public" }), page("mine", "pw834", { ownerId: "u834" }));
  const noWorkspace = { sessions: { u834: session("u834", []) }, activeUserId: "u834", activeWorkspaceByUser: {} };
  const signedOut = { sessions: {}, activeUserId: "", activeWorkspaceByUser: {} };
  for (const [label, who] of [["signed out", signedOut], ["no workspace", noWorkspace]] as const) {
    useUserStore.setState(who);
    const state = await load();
    assert.deepEqual(state.pages, {}, `${label}: zero rows`);
    assert.equal(state.databases[LIBRARY_DB_ID].locked, true, `${label}: locked`);
    assert.deepEqual(await adapter.findPages({} as never), []);
    assert.equal(await adapter.getPage("ghost"), null);
    await settle();
    assert.deepEqual(requests, [], `${label}: no request at all`);
  }
});

test("C835: a private-workspace page in a shared Library lists and opens in its own workspace", async () => {
  await fresh();
  signIn([session("u835", ["pw835"], [workspace("sw835", { role: "editor" })])], "u835", { u835: "sw835" });
  seedPages(
    page("p-parent", "pw835", { ownerId: "u835" }),
    page("p-kid-1", "pw835", { ownerId: "u835", parentPageId: "p-parent" }),
    page("p-kid-2", "pw835", { ownerId: "u835", parentPageId: "p-parent" }),
    page("s-page", "sw835", { ownerId: "boss", visibility: "shared" }),
  );
  assert.equal(useUserStore.getState().activeWorkspace()?._id, "sw835", "the Library being read is the shared workspace's");
  assert.ok("p-parent" in (await load()).pages, "the private page is a row of the shared workspace's Library");

  const controller = createLibrarySubItemsController();
  assert.deepEqual((await controller.fetchRows("p-parent")).map((row) => row.id), ["p-kid-1", "p-kid-2"]);
  assert.deepEqual(await controller.fetchRows("s-page"), []);

  const opened: Array<{ id: string; workspaceId: string }> = [];
  const { openPage } = usePageStore.getState();
  usePageStore.setState({ openPage: (target) => void opened.push(target) });
  try {
    openLibraryItem("p-kid-1");
    openLibraryItem("s-page");
  } finally {
    usePageStore.setState({ openPage });
  }
  assert.deepEqual(
    opened.map(({ id, workspaceId }) => ({ id, workspaceId })),
    [{ id: "p-kid-1", workspaceId: "pw835" }, { id: "s-page", workspaceId: "sw835" }],
  );
});

test("C1211: a curator drags a page row under a page of its workspace or out to its root", async () => {
  await fresh();
  signIn([session("u1211", ["pw1211"])], "u1211", { u1211: "pw1211" });
  seedPages(
    page("m-a", "pw1211", { ownerId: "u1211" }),
    page("m-b", "pw1211", { ownerId: "u1211" }),
    page("m-kid", "pw1211", { ownerId: "u1211", parentPageId: "m-a" }),
  );
  const { useToastStore } = await import("@/shared/ui");
  const toasts = () => useToastStore.getState().toasts.length;
  const parentOf = (id: string) => usePageStore.getState().pageById(id)?.parentPageId ?? null;
  const curator = createLibrarySubItemsController(() => true);

  await curator.moveRow?.("m-a", "m-b");
  assert.equal(parentOf("m-a"), "m-b", "nested under the drop target");
  await curator.moveRow?.("m-a", null);
  assert.equal(parentOf("m-a"), null, "unnested to the workspace root");

  useToastStore.getState().clear();
  await assert.rejects(curator.moveRow?.("m-a", "m-kid") ?? Promise.resolve(), "never under its own sub-page");
  await assert.rejects(curator.moveRow?.("skill:s1", "m-b") ?? Promise.resolve(), "only page rows move");
  assert.equal(curator.canMoveRow?.("skill:s1"), false);
  assert.equal(curator.canMoveRow?.("m-a"), true);

  const member = createLibrarySubItemsController(() => false);
  assert.equal(member.canMoveRow?.("m-a"), false, "a member gets no move grip");
  await assert.rejects(member.moveRow?.("m-b", "m-a") ?? Promise.resolve());
  assert.equal(parentOf("m-b"), null, "a refused move leaves the tree as it was");
  assert.equal(toasts(), 3, "each refusal is said once");
});

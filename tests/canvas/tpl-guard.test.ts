/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tpl-guard.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import type { PageEntry } from "@/entities/page";
import type { OutboxDeps } from "@/store/sync/pageOutbox";

const TEMPLATE_ID = "tpl:crm-pipeline";
const ORDINARY_ID = "507f1f77bcf86cd799439011";
const WORKSPACE = "ws";
let values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const session = {
  userId: "owner",
  privateWorkspaces: [{ _id: WORKSPACE }],
  sharedWorkspaces: [],
};
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({
    activeSession: () => session,
    activeJwt: () => null,
    activePageJwt: () => null,
  }),
  subscribe: () => () => undefined,
});

const { isCatalogueId } = await import("@/data/templates/catalogue/tplId");
const { usePageStore } = await import("@/store/usePageStore");
const { useFavoritesStore } = await import("@/store/favorites/favoritesStore");
const { publishPage, publishPageKeepalive } = await import("@/store/sync/pageOutbox");
const {
  derivePageState,
  flushScheduledPagesCachePersist,
  savePagesCache,
  withoutCatalogueEntries,
} = await import("@/store/pageStore.helpers");

const pageStateBefore = usePageStore.getState();
const favoritesStateBefore = useFavoritesStore.getState();
const originalFetch = globalThis.fetch;
let fetchCalls = 0;

beforeEach(() => {
  flushScheduledPagesCachePersist();
  values = new Map<string, string>();
  fetchCalls = 0;
  usePageStore.setState(pageStateBefore, true);
  useFavoritesStore.setState(favoritesStateBefore, true);
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});

after(() => {
  flushScheduledPagesCachePersist();
  globalThis.fetch = originalFetch;
  usePageStore.setState(pageStateBefore, true);
  useFavoritesStore.setState(favoritesStateBefore, true);
});

function makePage(id: string, archivedAt: string | null = null): PageEntry {
  return {
    _id: id,
    title: id,
    workspaceId: WORKSPACE,
    ownerId: "owner",
    visibility: "private",
    archivedAt,
    content: [],
  };
}

function seedCataloguePage(archivedAt: string | null = null) {
  const page = makePage(TEMPLATE_ID, archivedAt);
  const state = usePageStore.getState();
  usePageStore.setState({
    ...derivePageState({ [WORKSPACE]: [page] }, state),
    activePage: null,
    recents: [],
  });
  fetchCalls = 0;
  return usePageStore.getState().pages;
}

function assertNoPageEffects(before: Record<string, PageEntry[]>) {
  assert.equal(usePageStore.getState().pages, before);
  assert.equal(fetchCalls, 0);
}

test("isCatalogueId accepts only the tpl prefix", () => {
  assert.equal(isCatalogueId("tpl:x"), true);
  for (const id of ["tplx", "x-tpl:", "", ORDINARY_ID]) {
    assert.equal(isCatalogueId(id), false, id);
  }
});

test("openPage leaves activePage and recents identical", () => {
  seedCataloguePage();
  const activePage = { id: ORDINARY_ID, workspaceId: WORKSPACE, kind: "page" as const };
  const recents = [activePage];
  usePageStore.setState({ activePage, recents });
  usePageStore.getState().openPage({ id: TEMPLATE_ID, workspaceId: WORKSPACE, kind: "page", title: "CRM" });
  assert.equal(usePageStore.getState().activePage, activePage);
  assert.equal(usePageStore.getState().recents, recents);
  assert.equal(fetchCalls, 0);
});

test("page mutations have zero effects for catalogue ids", async (t) => {
  const mutations = [
    ["patchPage", () => usePageStore.getState().patchPage(TEMPLATE_ID, { title: "changed" })],
    ["duplicatePage", () => usePageStore.getState().duplicatePage(TEMPLATE_ID, WORKSPACE)],
    ["archivePage", () => usePageStore.getState().archivePage(TEMPLATE_ID, WORKSPACE, "jwt")],
    ["deletePage", () => usePageStore.getState().deletePage(TEMPLATE_ID, WORKSPACE, "jwt")],
    ["restorePage", () => usePageStore.getState().restorePage(TEMPLATE_ID, WORKSPACE, "jwt")],
    ["permanentlyDeletePage", () => usePageStore.getState().permanentlyDeletePage(TEMPLATE_ID, WORKSPACE, "jwt")],
  ] as const;
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const before = seedCataloguePage("2026-01-01T00:00:00.000Z");
      const result = await mutate();
      if (name === "duplicatePage") assert.equal(result, null);
      assertNoPageEffects(before);
    });
  }
});

test("favorites toggle leaves pageIds unchanged and does not fetch", async () => {
  const pageIds = [ORDINARY_ID];
  useFavoritesStore.setState({ pageIds });
  await useFavoritesStore.getState().toggle(TEMPLATE_ID);
  assert.equal(useFavoritesStore.getState().pageIds, pageIds);
  assert.equal(fetchCalls, 0);
});

test("outbox publishers drop catalogue pages without transport calls", async () => {
  let patchCalls = 0;
  let keepaliveCalls = 0;
  const deps: OutboxDeps = {
    token: () => "jwt",
    patch: async () => { patchCalls += 1; return {}; },
    base: () => "https://bridge.test",
    keepalive: () => { keepaliveCalls += 1; },
  };
  const page = makePage(TEMPLATE_ID);
  const outcome = await publishPage(page, deps);
  publishPageKeepalive(page, deps);
  assert.deepEqual(outcome, { result: "ok", ignored: [], version: null, conflict: null });
  assert.equal(patchCalls, 0);
  assert.equal(keepaliveCalls, 0);
});

test("withoutCatalogueEntries preserves references and drops only tpl entries", () => {
  const clean = { [WORKSPACE]: [makePage(ORDINARY_ID)] };
  assert.equal(withoutCatalogueEntries(clean), clean);
  const mixed = { [WORKSPACE]: [makePage(ORDINARY_ID), makePage(TEMPLATE_ID)] };
  const filtered = withoutCatalogueEntries(mixed);
  assert.notEqual(filtered, mixed);
  assert.deepEqual(filtered[WORKSPACE].map((page) => page._id), [ORDINARY_ID]);
  assert.equal(mixed[WORKSPACE].length, 2);
});

test("savePagesCache never writes a catalogue entry", () => {
  savePagesCache({ [WORKSPACE]: [makePage(ORDINARY_ID), makePage(TEMPLATE_ID)] });
  flushScheduledPagesCachePersist();
  const written = values.get(`osio:pages:${WORKSPACE}`);
  assert.ok(written);
  assert.equal(written.includes("tpl:"), false);
  assert.deepEqual(JSON.parse(written).map((page: PageEntry) => page._id), [ORDINARY_ID]);
});
